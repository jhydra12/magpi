import { z } from 'zod';

import type { Enums, Tables } from '@/lib/database.types';

export type EntityKind = Enums<'entity_kind'>;

export type EntityRecord = Pick<
  Tables<'entities'>,
  'id' | 'kind' | 'name' | 'summary' | 'space_id'
>;

export type EntityMentionRecord = Pick<Tables<'entity_mentions'>, 'entity_id' | 'document_id'>;

export type MentionedDocument = Pick<Tables<'documents'>, 'id' | 'title' | 'url'>;

export type EntityListing = {
  readonly id: string;
  readonly name: string;
  readonly summary: string | null;
  readonly documents: readonly MentionedDocument[];
};

export type EntityGroup = {
  readonly kind: EntityKind;
  readonly label: string;
  readonly entities: readonly EntityListing[];
};

/** Fixed order, so the page does not reshuffle between two dream runs. */
const KIND_ORDER: readonly EntityKind[] = ['person', 'project', 'customer', 'decision'];

const KIND_LABELS: Record<EntityKind, string> = {
  person: 'People',
  project: 'Projects',
  customer: 'Customers',
  decision: 'Decisions',
};

export function buildEntityGroups({
  entities,
  mentions,
  documents,
}: {
  readonly entities: readonly EntityRecord[];
  readonly mentions: readonly EntityMentionRecord[];
  readonly documents: readonly MentionedDocument[];
}): readonly EntityGroup[] {
  const documentsById = new Map(documents.map((document) => [document.id, document]));

  const documentIdsByEntity = new Map<string, Set<string>>();
  for (const mention of mentions) {
    const seen = documentIdsByEntity.get(mention.entity_id) ?? new Set<string>();
    seen.add(mention.document_id);
    documentIdsByEntity.set(mention.entity_id, seen);
  }

  const listingsFor = (entity: EntityRecord): EntityListing => ({
    id: entity.id,
    name: entity.name,
    summary: entity.summary,
    documents: [...(documentIdsByEntity.get(entity.id) ?? [])].flatMap((documentId) => {
      const document = documentsById.get(documentId);
      return document ? [document] : [];
    }),
  });

  return KIND_ORDER.flatMap((kind) => {
    const inKind = entities
      .filter((entity) => entity.kind === kind)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    if (inKind.length === 0) return [];
    return [{ kind, label: KIND_LABELS[kind], entities: inKind.map(listingsFor) }];
  });
}

/** Validate incremental graph responses before passing them to the renderer. */
export const entityGraphResponseSchema = z.object({
  active: z.boolean(),
  groups: z.array(
    z.object({
      kind: z.enum(['person', 'project', 'customer', 'decision']),
      label: z.string(),
      entities: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          summary: z.string().nullable(),
          documents: z.array(
            z.object({ id: z.string(), title: z.string(), url: z.string().nullable() }),
          ),
        }),
      ),
    }),
  ),
});
