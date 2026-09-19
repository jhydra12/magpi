// Every read and every write a dream run makes, fixed to one space when the writer is built.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { ApiError } from '../errors.ts';

export interface SpaceScope {
  orgId: string;
  spaceId: string;
}

export interface SpaceChunkRow {
  id: string;
  document_id: string;
  ordinal: number;
  content: string;
  created_at: string;
}

/** What the similarity pass reads of a document: its opening chunk. */
export interface SpaceOpeningChunk {
  id: string;
  content: string;
}

export interface SpaceDocumentRow {
  id: string;
  title: string;
  origin: 'upload' | 'sync' | 'dream';
  connection_id: string | null;
  url: string | null;
  updated_at: string;
}

export interface EntityDraft {
  kind: 'person' | 'project' | 'customer' | 'decision';
  name: string;
  canonicalName: string;
  summary: string | null;
}

/** An entity the space has already filed, as the matcher and the enrichment step read it. */
export interface KnownEntity {
  id: string;
  kind: EntityDraft['kind'];
  name: string;
  canonicalName: string;
  hasSummary: boolean;
}

export interface MentionDraft {
  entityId: string;
  documentId: string;
  chunkId: string;
}

export interface LinkDraft {
  dreamRunId: string;
  documentA: string;
  documentB: string;
  similarity: number;
  rationale: string;
}

export interface DreamDocumentDraft {
  dreamRunId: string;
  title: string;
  text: string;
  /** The chunks this synthesis was built from. Never empty. */
  sourceChunkIds: string[];
}

export interface SpaceScopedDb {
  readonly scope: SpaceScope;
  recentChunks(sinceIso: string, limit: number): Promise<SpaceChunkRow[]>;
  documentsByIds(ids: string[]): Promise<SpaceDocumentRow[]>;
  recentDocuments(sinceIso: string, limit: number): Promise<SpaceDocumentRow[]>;
  /** The opening chunk of each document, keyed by document, for the similarity pass. */
  firstChunksOf(documentIds: string[]): Promise<Map<string, SpaceOpeningChunk>>;
  insertDreamDocument(draft: DreamDocumentDraft): Promise<string>;
  insertChunks(
    documentId: string,
    chunks: { ordinal: number; content: string; tokenCount: number; embedding: number[] }[],
  ): Promise<void>;
  /** Every entity the space knows, which is what the matcher looks for in tonight's text. */
  knownEntities(limit: number): Promise<KnownEntity[]>;
  /** Files a batch of entities and answers with an id per draft, in draft order. */
  upsertEntities(drafts: EntityDraft[]): Promise<string[]>;
  insertMentions(drafts: MentionDraft[]): Promise<void>;
  /** How many mentions each of these entities has, all told, not only tonight's. */
  mentionCounts(entityIds: string[]): Promise<Map<string, number>>;
  writeSummaries(summaries: { entityId: string; summary: string }[]): Promise<void>;
  insertLinks(drafts: LinkDraft[]): Promise<void>;
}

const countsSchema = z.array(z.object({ entity_id: z.string(), mentions: z.coerce.number() }));

/** The conflict key entities are filed under, within one space. */
function entityKey(kind: string, canonicalName: string): string {
  return `${kind}:${canonicalName}`;
}

function failed(what: string, detail: string): ApiError {
  console.error(`${what} failed`, detail);
  return new ApiError(500, 'internal', `${what} failed`);
}

export function spaceScoped(db: SupabaseClient, scope: SpaceScope): SpaceScopedDb {
  /** The two columns no caller is allowed to choose. */
  const stamped = (row: Record<string, unknown>): Record<string, unknown> => ({
    ...row,
    org_id: scope.orgId,
    space_id: scope.spaceId,
  });

  return {
    scope,

    async recentChunks(sinceIso, limit) {
      const rows: SpaceChunkRow[] = [];
      for (let offset = 0;; offset += limit) {
        const { data, error } = await db.from('chunks')
          .select('id, document_id, ordinal, content, created_at, documents!inner(origin)')
          .eq('space_id', scope.spaceId).gte('created_at', sinceIso)
          .neq('documents.origin', 'dream')
          .order('created_at', { ascending: true }).order('id', { ascending: true })
          .range(offset, offset + limit - 1).returns<SpaceChunkRow[]>();
        if (error) throw failed('reading recent chunks', error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < limit) return rows;
      }
    },

    async documentsByIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from('documents')
        .select('id, title, origin, connection_id, url, updated_at')
        .eq('space_id', scope.spaceId)
        .in('id', ids)
        .returns<SpaceDocumentRow[]>();
      if (error) throw failed('reading documents', error.message);
      return data ?? [];
    },

    async recentDocuments(sinceIso, limit) {
      const rows: SpaceDocumentRow[] = [];
      for (let offset = 0;; offset += limit) {
        const { data, error } = await db.from('documents')
          .select('id, title, origin, connection_id, url, updated_at')
          .eq('space_id', scope.spaceId).gte('updated_at', sinceIso).neq('origin', 'dream')
          .order('updated_at', { ascending: false }).order('id', { ascending: true })
          .range(offset, offset + limit - 1).returns<SpaceDocumentRow[]>();
        if (error) throw failed('reading documents', error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < limit) return rows;
      }
    },

    async firstChunksOf(documentIds) {
      if (documentIds.length === 0) return new Map();
      const { data, error } = await db
        .from('chunks')
        .select('id, document_id, content')
        .eq('space_id', scope.spaceId)
        .in('document_id', documentIds)
        // A document's chunks start at ordinal zero, so one round trip reads every opener.
        .eq('ordinal', 0)
        .returns<{ id: string; document_id: string; content: string }[]>();
      if (error) throw failed('reading chunks', error.message);

      return new Map(
        (data ?? []).map((row) => [row.document_id, { id: row.id, content: row.content }]),
      );
    },

    async insertDreamDocument(draft) {
      const { data, error } = await db
        .from('documents')
        .insert(
          stamped({
            title: draft.title,
            origin: 'dream',
            dream_run_id: draft.dreamRunId,
            mime_type: 'text/markdown',
            version: 1,
            source_chunk_ids: draft.sourceChunkIds,
          }),
        )
        .select('id')
        .single<{ id: string }>();
      if (error || !data) throw failed('writing the dream document', error?.message ?? 'no row');
      return data.id;
    },

    async insertChunks(documentId, chunks) {
      if (chunks.length === 0) return;
      const { error } = await db.from('chunks').insert(
        chunks.map((chunk) =>
          stamped({
            document_id: documentId,
            ordinal: chunk.ordinal,
            content: chunk.content,
            token_count: chunk.tokenCount,
            embedding: chunk.embedding,
          })
        ),
      );
      if (error) throw failed('writing chunks', error.message);
    },

    async knownEntities(limit) {
      const { data, error } = await db
        .from('entities')
        .select('id, kind, name, canonical_name, summary')
        .eq('space_id', scope.spaceId)
        .order('updated_at', { ascending: false })
        .limit(limit)
        .returns<
          {
            id: string;
            kind: EntityDraft['kind'];
            name: string;
            canonical_name: string;
            summary: string | null;
          }[]
        >();
      if (error) throw failed('reading entities', error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        canonicalName: row.canonical_name,
        hasSummary: row.summary !== null,
      }));
    },

    async upsertEntities(drafts) {
      if (drafts.length === 0) return [];

      // Deduplicated on the conflict key, since one statement may not write the same row twice.
      const byKey = new Map(
        drafts.map((draft) => [entityKey(draft.kind, draft.canonicalName), draft]),
      );

      const { data, error } = await db
        .from('entities')
        .upsert(
          [...byKey.values()].map((draft) =>
            stamped({
              kind: draft.kind,
              name: draft.name,
              canonical_name: draft.canonicalName,
              summary: draft.summary,
            })
          ),
          { onConflict: 'space_id,kind,canonical_name' },
        )
        .select('id, kind, canonical_name')
        .returns<{ id: string; kind: string; canonical_name: string }[]>();
      if (error || !data) throw failed('writing entities', error?.message ?? 'no rows');

      // Matched on the conflict key rather than on position; row order is the database's business.
      const ids = new Map(data.map((row) => [entityKey(row.kind, row.canonical_name), row.id]));
      return drafts.map((draft) => {
        const id = ids.get(entityKey(draft.kind, draft.canonicalName));
        if (!id) throw failed('writing entities', `no row came back for ${draft.canonicalName}`);
        return id;
      });
    },

    async insertMentions(drafts) {
      if (drafts.length === 0) return;
      // entity_mentions carries space_id but no org_id, so the shared stamp does not fit.
      const { error } = await db.from('entity_mentions').upsert(
        drafts.map((draft) => ({
          entity_id: draft.entityId,
          document_id: draft.documentId,
          chunk_id: draft.chunkId,
          space_id: scope.spaceId,
        })),
        { onConflict: 'entity_id,chunk_id', ignoreDuplicates: true },
      );
      if (error) throw failed('writing entity mentions', error.message);
    },

    async mentionCounts(entityIds) {
      if (entityIds.length === 0) return new Map();
      const { data, error } = await db
        .rpc('entity_mention_counts', { p_space_id: scope.spaceId, p_entity_ids: entityIds })
        .returns<unknown>();
      if (error) throw failed('counting entity mentions', error.message);

      // count() is a bigint, which arrives as a string once it is past what a JSON number holds.
      const rows = countsSchema.safeParse(data ?? []);
      if (!rows.success) throw failed('counting entity mentions', rows.error.message);
      return new Map(rows.data.map((row) => [row.entity_id, row.mentions]));
    },

    async writeSummaries(summaries) {
      if (summaries.length === 0) return;
      // One statement per summary: an upsert would need every not-null column to write one field.
      const written = await Promise.all(
        summaries.map(({ entityId, summary }) =>
          db.from('entities').update({ summary }).eq('id', entityId).eq('space_id', scope.spaceId)
        ),
      );
      const fault = written.find((result) => result.error);
      if (fault?.error) throw failed('writing entity summaries', fault.error.message);
    },

    async insertLinks(drafts) {
      if (drafts.length === 0) return;
      const { error } = await db.from('dream_links').upsert(
        drafts.map((draft) => ({
          dream_run_id: draft.dreamRunId,
          space_id: scope.spaceId,
          // The table checks document_a < document_b, so a pair is stored once.
          document_a: draft.documentA < draft.documentB ? draft.documentA : draft.documentB,
          document_b: draft.documentA < draft.documentB ? draft.documentB : draft.documentA,
          similarity: draft.similarity,
          rationale: draft.rationale,
        })),
        { onConflict: 'space_id,document_a,document_b', ignoreDuplicates: true },
      );
      if (error) throw failed('writing dream links', error.message);
    },
  };
}
