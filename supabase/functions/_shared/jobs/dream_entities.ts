// The entities pass: find the people, projects, customers and decisions in the day's chunks.
//
// Three steps, only two of which cost anything. What the space already knows is matched against
// tonight's text by string matching, which is exact and free. The model is asked only for names
// nothing has seen before, and only writes a summary for a thing that keeps coming up.
//
// Every name, the model's included, has to appear in the text before it is filed.

import { z } from 'zod';

import {
  ask,
  counted,
  type DreamOutcome,
  enter,
  NOTHING,
  type Pass,
  readAnswer,
  sinceIso,
  WEEK_MS,
} from './dream_pass.ts';
import { buildMatcher } from './entity_matcher.ts';
import type { EntityDraft, KnownEntity, MentionDraft, SpaceChunkRow } from './space_writer.ts';

/**
 * More than a digest reads, because most of the work here is matching, which is free, and the
 * model is only asked for a list of names.
 */
const MAX_INPUT_CHUNKS = 400;

/** Writes a few documents at a time so the graph can show discoveries during a run. */
const ENTITY_BATCH_CHUNKS = 40;

/** Names held in memory for the matcher. Beyond this the oldest-touched entities wait a night. */
const MAX_KNOWN_ENTITIES = 5000;

/** How often a thing must come up before a summary of it is worth a model call. */
const ENRICH_AFTER_MENTIONS = 3;

/** Summaries written per night, so a busy space cannot run up a bill on one run. */
const MAX_ENRICHED = 25;

/** Names the discovery call may answer with, and the room that takes. */
const MAX_DISCOVERED = 100;
const DISCOVERY_OUTPUT_TOKENS = MAX_DISCOVERED * 25;

/** Room for every summary to run to the length the schema allows, so none is cut off. */
const SUMMARY_OUTPUT_TOKENS = MAX_ENRICHED * 200;

/** Chunks quoted to the model when it writes one summary. */
const CONTEXT_CHUNKS = 2;
const CONTEXT_CHARS = 500;

// Every entry is read on its own. One row the model shaped oddly is one row, not a lost answer.
const discoverySchema = z.object({ entities: z.array(z.unknown()) });
const discoveredSchema = z.object({
  kind: z.enum(['person', 'project', 'customer', 'decision']),
  name: z.string().trim().min(1).max(200),
});

const summarySchema = z.object({ summaries: z.array(z.unknown()) });
const summarySchemaEntry = z.object({
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(600),
});

/** The entries of a list that were shaped the way the prompt asked for, and no more than `most`. */
function usable<T>(entries: unknown[], schema: z.ZodType<T>, most: number): T[] {
  return entries
    .flatMap((entry) => {
      const row = schema.safeParse(entry);
      return row.success ? [row.data] : [];
    })
    .slice(0, most);
}

const DISCOVERY_SYSTEM =
  'You list the people, projects, customers and decisions named in workplace notes. Answer with ' +
  'a JSON object and nothing else, of the form {"entities": [...]}, where each entry has the keys ' +
  'kind (one of person, project, customer, decision) and name, written exactly as the text writes ' +
  'it. Do not explain and do not summarise. An empty array is a valid answer.';

const SUMMARY_SYSTEM =
  'You write one sentence about each thing named below, using only the notes quoted under it. ' +
  'Answer with a JSON object and nothing else, of the form {"summaries": [...]}, where each entry ' +
  'has the keys name (copied exactly) and summary (one sentence).';

/** The conflict key an entity is filed under, matching the unique index on the table. */
function keyOf(entity: { kind: string; canonicalName: string }): string {
  return `${entity.kind}:${entity.canonicalName}`;
}

/** Lowercase, no punctuation, single spaces. What two spellings of one name have in common. */
function canonical(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Every chunk each name appears in, as mention rows. No model is involved. */
function mentionsIn(
  chunks: SpaceChunkRow[],
  names: { id: string; text: string }[],
): MentionDraft[] {
  const matcher = buildMatcher(names);
  if (matcher.size === 0) return [];
  return chunks.flatMap((chunk) =>
    [...matcher.find(chunk.content)].map((entityId) => ({
      entityId,
      documentId: chunk.document_id,
      chunkId: chunk.id,
    }))
  );
}

/** A name and its canonical form are both worth looking for: one is written, one is typed. */
function needlesFor(
  entities: { id: string; name: string; canonicalName: string }[],
): { id: string; text: string }[] {
  return entities.flatMap((entity) =>
    entity.name.toLowerCase() === entity.canonicalName
      ? [{ id: entity.id, text: entity.name }]
      : [{ id: entity.id, text: entity.name }, { id: entity.id, text: entity.canonicalName }]
  );
}

/** Names in tonight's text that the space has no row for yet. */
async function discover(pass: Pass, chunks: SpaceChunkRow[], known: Set<string>): Promise<
  EntityDraft[]
> {
  const text = chunks.map((chunk) => chunk.content).join('\n\n');
  // The smaller model, because listing the names in a page is not work for the larger one.
  const answer = await ask(pass, {
    system: DISCOVERY_SYSTEM,
    user: text,
    maxOutputTokens: DISCOVERY_OUTPUT_TOKENS,
    json: true,
    purpose: 'extract',
  });

  enter(pass, 'extract');
  const listed = readAnswer(discoverySchema, answer, 'entities').entities;
  const drafts = usable(listed, discoveredSchema, MAX_DISCOVERED)
    .map((entity) => ({
      kind: entity.kind,
      name: entity.name,
      canonicalName: canonical(entity.name),
      summary: null,
    }))
    .filter((draft) => draft.canonicalName.length >= 2 && !known.has(keyOf(draft)));

  // One name may come back twice in two spellings; the later one is the same row.
  return [...new Map(drafts.map((draft) => [keyOf(draft), draft])).values()];
}

/** Writes a sentence about each thing that has now been mentioned often enough to deserve one. */
async function enrich(
  pass: Pass,
  chunks: SpaceChunkRow[],
  candidates: KnownEntity[],
  mentions: MentionDraft[],
): Promise<void> {
  if (candidates.length === 0) return;
  const byChunk = new Map(chunks.map((chunk) => [chunk.id, chunk.content]));

  const quoted = candidates.map((entity) => {
    const context = mentions
      .filter((mention) => mention.entityId === entity.id)
      .slice(0, CONTEXT_CHUNKS)
      .map((mention) => (byChunk.get(mention.chunkId) ?? '').slice(0, CONTEXT_CHARS))
      .join('\n');
    return `${entity.name} (${entity.kind})\n${context}`;
  }).join('\n\n');

  enter(pass, 'synthesize');
  const answer = await ask(pass, {
    system: SUMMARY_SYSTEM,
    user: quoted,
    maxOutputTokens: SUMMARY_OUTPUT_TOKENS,
    json: true,
    purpose: 'extract',
  });

  enter(pass, 'extract');
  const listed = readAnswer(summarySchema, answer, 'entity summaries').summaries;
  const written = usable(listed, summarySchemaEntry, MAX_ENRICHED);
  const byName = new Map(candidates.map((entity) => [canonical(entity.name), entity.id]));

  enter(pass, 'write');
  await pass.db.writeSummaries(written.flatMap((row) => {
    const entityId = byName.get(canonical(row.name));
    return entityId ? [{ entityId, summary: row.summary }] : [];
  }));
}

/** Files each discovered name the text actually says, with the chunks that say it. */
async function fileDiscovered(pass: Pass, chunks: SpaceChunkRow[], drafts: EntityDraft[]): Promise<
  { added: KnownEntity[]; mentions: MentionDraft[] }
> {
  // Keyed by the draft's position, because a draft has no id until it is written.
  const byDraft = mentionsIn(
    chunks,
    needlesFor(drafts.map((draft, index) => ({ ...draft, id: String(index) }))),
  );
  const spoken = [...new Set(byDraft.map((mention) => mention.entityId))];
  const kept = spoken.map((index) => drafts[Number(index)]);

  enter(pass, 'write');
  const filed = await pass.db.upsertEntities(kept);
  const idOf = new Map(spoken.map((index, position) => [index, filed[position]]));

  return {
    added: kept.map((draft, position) => ({
      id: filed[position],
      kind: draft.kind,
      name: draft.name,
      canonicalName: draft.canonicalName,
      hasSummary: false,
    })),
    mentions: byDraft.flatMap((mention) => {
      const entityId = idOf.get(mention.entityId);
      return entityId ? [{ ...mention, entityId }] : [];
    }),
  };
}

export async function dreamEntities(pass: Pass): Promise<DreamOutcome> {
  const { deps, db } = pass;
  enter(pass, 'collect');
  // A week rather than a night: matching a chunk again is free, and a name learned on Friday
  // should find the Tuesday note that already said it.
  const chunks = counted(pass, await db.recentChunks(sinceIso(deps, WEEK_MS), MAX_INPUT_CHUNKS));
  if (chunks.length === 0) return NOTHING;
  let known = await db.knownEntities(MAX_KNOWN_ENTITIES);
  let produced = 0;
  const batches = Array.from({ length: Math.ceil(chunks.length / ENTITY_BATCH_CHUNKS) }, (_, index) =>
    chunks.slice(index * ENTITY_BATCH_CHUNKS, (index + 1) * ENTITY_BATCH_CHUNKS),
  );

  for (const batch of batches) {
    // What the space already knows, matched against this batch's text. No model, no cost.
    enter(pass, 'extract');
    const remembered = mentionsIn(batch, needlesFor(known));

    enter(pass, 'synthesize');
    const drafts = await discover(pass, batch, new Set(known.map(keyOf)));

    enter(pass, 'extract');
    const discovered = await fileDiscovered(pass, batch, drafts);
    const mentions = [...remembered, ...discovered.mentions];
    produced += mentions.length;

    enter(pass, 'write');
    await db.insertMentions(mentions);

    const counts = await db.mentionCounts([...new Set(mentions.map((mention) => mention.entityId))]);
    const due = [...known, ...discovered.added]
      .filter((entity) => !entity.hasSummary && (counts.get(entity.id) ?? 0) >= ENRICH_AFTER_MENTIONS)
      .slice(0, MAX_ENRICHED);
    await enrich(pass, batch, due, mentions);
    known = [...known, ...discovered.added];
  }

  return { ...NOTHING, inputDocumentCount: pass.inputDocumentCount, produced };
}
