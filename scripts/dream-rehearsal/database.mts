import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../web/lib/database.types.ts';
import { batchUrl, manifestSchema, manifestRunIds, spaceName, verifyOwnership } from './model.mts';
import type { Manifest } from './model.mts';

type Client = ReturnType<typeof createClient<Database>>;
type SourceChunk = Pick<
  Database['public']['Tables']['chunks']['Row'],
  'id' | 'document_id' | 'ordinal' | 'content' | 'embedding' | 'token_count'
>;

/** Creates a privileged CLI client without persisted credentials or user session state. */
export function client(url: string, key: string): Client {
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertResult(error: { message: string; code?: string } | null, action: string): void {
  if (error)
    throw new Error(`${action} failed (${error.code ?? 'database error'}): ${error.message}`);
}

async function source(
  db: Client,
  sourceSpace: string,
  userId: string,
): Promise<{
  orgId: string;
  chunks: SourceChunk[];
  documents: { id: string; title: string; url: string | null }[];
}> {
  const space = await db.from('spaces').select('org_id,kind').eq('id', sourceSpace).single();
  assertResult(space.error, 'Read source space');
  if (!space.data) throw new Error('Source space not found');
  const member = await db
    .from('org_members')
    .select('user_id')
    .eq('org_id', space.data.org_id)
    .eq('user_id', userId)
    .single();
  assertResult(member.error, 'Verify user belongs to source organization');
  if (space.data.kind !== 'org') {
    const membership = await db
      .from('space_members')
      .select('user_id')
      .eq('space_id', sourceSpace)
      .eq('user_id', userId)
      .single();
    assertResult(membership.error, 'Verify user can read source space');
  }
  const chunks = await db
    .from('chunks')
    .select('id,document_id,ordinal,content,embedding,token_count,documents!inner(origin)')
    .eq('space_id', sourceSpace)
    .neq('documents.origin', 'dream')
    .not('embedding', 'is', null)
    .neq('content', '')
    .order('id')
    .limit(120);
  assertResult(chunks.error, 'Read source chunks');
  const eligible = (chunks.data ?? []).filter((chunk) => chunk.content.trim().length > 0);
  if (eligible.length === 0)
    throw new Error('Source space has no non-Dream text chunks with embeddings');
  const documents = await db
    .from('documents')
    .select('id,title,url')
    .in('id', [...new Set(eligible.map((chunk) => chunk.document_id))])
    .eq('space_id', sourceSpace);
  assertResult(documents.error, 'Read source documents');
  return { orgId: space.data.org_id, chunks: eligible, documents: documents.data ?? [] };
}

/** Prepares isolated input copies, then submits all jobs together after writing the ownership manifest. */
export async function prepare(
  db: Client,
  settings: {
    sourceSpace: string;
    user: string;
    count: number;
    kind?: 'digest' | 'all';
    targetUrl: string;
    webUrl: string;
    manifestPath: string;
  },
): Promise<Manifest> {
  const input = await source(db, settings.sourceSpace, settings.user);
  const manifest = manifestSchema.parse({
    version: 1,
    batchId: randomUUID(),
    createdAt: new Date().toISOString(),
    targetUrl: settings.targetUrl,
    webUrl: settings.webUrl,
    sourceSpaceId: settings.sourceSpace,
    orgId: input.orgId,
    userId: settings.user,
    spaces: Array.from({ length: settings.count }, () => ({
      id: randomUUID(),
      runId: randomUUID(),
      additionalRuns:
        settings.kind === 'all'
          ? [
              { id: randomUUID(), kind: 'entities' },
              { id: randomUUID(), kind: 'connections' },
            ]
          : [],
      documents: input.documents.map((document) => ({
        id: randomUUID(),
        sourceId: document.id,
        chunks: input.chunks
          .filter((chunk) => chunk.document_id === document.id)
          .map((chunk) => ({ id: randomUUID(), sourceId: chunk.id })),
      })),
    })),
  });
  // Exclusive creation protects an earlier batch's cleanup record. Credentials are never written.
  await writeFile(
    settings.manifestPath,
    `${JSON.stringify({ ...manifest, batchUrl: batchUrl(manifest) }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  for (const [index, space] of manifest.spaces.entries()) {
    assertResult(
      (
        await db.from('spaces').insert({
          id: space.id,
          org_id: manifest.orgId,
          kind: 'team',
          name: spaceName(manifest, index),
          description: `Dream rehearsal batch ${manifest.batchId}`,
          dreaming_enabled: false,
        })
      ).error,
      'Create rehearsal space',
    );
    assertResult(
      (await db.from('space_members').insert({ space_id: space.id, user_id: manifest.userId }))
        .error,
      'Add rehearsal member',
    );
    await cloneDocuments(db, manifest, space, input);
  }
  // One request gives every queued run the same database statement timestamp.
  assertResult(
    (
      await db.from('dream_runs').insert(
        manifest.spaces.flatMap((space) =>
          [{ id: space.runId, kind: 'digest' as const }, ...space.additionalRuns].map((run) => ({
            ...run,
            org_id: manifest.orgId,
            space_id: space.id,
            status: 'queued' as const,
            triggered_by: manifest.userId,
          })),
        ),
      )
    ).error,
    'Queue rehearsal batch',
  );
  return manifest;
}

async function cloneDocuments(
  db: Client,
  manifest: Manifest,
  space: Manifest['spaces'][number],
  input: Awaited<ReturnType<typeof source>>,
): Promise<void> {
  const fresh = Date.now();
  for (const document of space.documents) {
    const original = input.documents.find((candidate) => candidate.id === document.sourceId);
    if (!original) throw new Error('Manifest document is missing from source input');
    assertResult(
      (
        await db.from('documents').insert({
          id: document.id,
          org_id: manifest.orgId,
          space_id: space.id,
          origin: 'upload',
          title: original.title,
          url: original.url,
          created_by: manifest.userId,
          created_at: new Date(fresh).toISOString(),
          updated_at: new Date(fresh).toISOString(),
        })
      ).error,
      'Clone source document',
    );
    const chunks = document.chunks.map((chunk) => {
      const index = input.chunks.findIndex((candidate) => candidate.id === chunk.sourceId);
      const originalChunk = input.chunks[index];
      if (!originalChunk) throw new Error('Manifest chunk is missing from source input');
      return {
        id: chunk.id,
        org_id: manifest.orgId,
        space_id: space.id,
        document_id: document.id,
        ordinal: originalChunk.ordinal,
        content: originalChunk.content,
        embedding: originalChunk.embedding,
        token_count: originalChunk.token_count,
        created_at: new Date(fresh - index).toISOString(),
      };
    });
    assertResult((await db.from('chunks').insert(chunks)).error, 'Clone source chunks');
  }
}

/** Reads only this manifest's runs and confirms digest output contains text. */
export async function status(
  db: Client,
  manifest: Manifest,
): Promise<{
  runs: Database['public']['Tables']['dream_runs']['Row'][];
  nonempty: Set<string>;
  entities: number;
  mentions: number;
  links: number;
}> {
  const ids = manifestRunIds(manifest);
  const runs: Database['public']['Tables']['dream_runs']['Row'][] = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const result = await db
      .from('dream_runs')
      .select('*')
      .in('id', ids.slice(offset, offset + 50))
      .eq('org_id', manifest.orgId);
    assertResult(result.error, 'Read rehearsal runs');
    runs.push(...(result.data ?? []));
  }
  const outputIds = runs.flatMap((run) => (run.output_document_id ? [run.output_document_id] : []));
  const nonempty = new Set<string>();
  for (const id of outputIds) {
    const chunks = await db
      .from('chunks')
      .select('content')
      .eq('document_id', id)
      .eq('org_id', manifest.orgId)
      .limit(1);
    assertResult(chunks.error, 'Read output text');
    if (chunks.data?.some((chunk) => chunk.content.trim().length > 0)) nonempty.add(id);
  }
  const spaceIds = manifest.spaces.map((space) => space.id);
  const counts = await Promise.all(
    (['entities', 'entity_mentions', 'dream_links'] as const).map(async (table) => {
      const result = await db
        .from(table)
        .select('id', { count: 'exact', head: true })
        .in('space_id', spaceIds);
      assertResult(result.error, `Read rehearsal ${table}`);
      return result.count ?? 0;
    }),
  );
  return { runs, nonempty, entities: counts[0], mentions: counts[1], links: counts[2] };
}

/** Deletes only identified rehearsal spaces, refusing while any owned space has pending work. */
export async function cleanup(db: Client, manifest: Manifest, url: string): Promise<number> {
  const ids = manifest.spaces.map((space) => space.id);
  const spaces = await db.from('spaces').select('id,name,org_id,kind,description').in('id', ids);
  assertResult(spaces.error, 'Read rehearsal space ownership');
  verifyOwnership(manifest, url, spaces.data ?? []);
  const active = await db
    .from('dream_runs')
    .select('id')
    .in('space_id', ids)
    .in('status', ['queued', 'running'])
    .limit(1);
  assertResult(active.error, 'Check for active Dream jobs');
  if (active.data?.length)
    throw new Error('Rehearsal has queued or running jobs. Let them finish before cleanup');
  const removed = await db
    .from('spaces')
    .delete()
    .in('id', ids)
    .eq('org_id', manifest.orgId)
    .eq('description', `Dream rehearsal batch ${manifest.batchId}`)
    .select('id');
  assertResult(removed.error, 'Delete rehearsal spaces');
  return removed.data?.length ?? 0;
}
