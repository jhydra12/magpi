// Connections pass: pairs recent documents about the same thing and writes the explained ones.

import { z } from 'zod';

import { ApiError } from '../errors.ts';
import {
  ask,
  type DreamOutcome,
  enter,
  NOTHING,
  parsed,
  type Pass,
  readAnswer,
  sinceIso,
} from './dream_pass.ts';
import type { LinkDraft, SpaceDocumentRow } from './space_writer.ts';

// One embedding and one search per document. The searches run together, so this is bounded by
// what one embedding call and forty concurrent searches cost, not by forty round trips in a row.
const MAX_COMPARED_DOCUMENTS = 40;

// A page of candidate links a person will actually read.
const MAX_LINKS = 30;

// Room for every link to be explained to the length the schema allows. An answer that runs out
// of room reads as malformed JSON, so the cap is derived from the count rather than guessed at.
const RATIONALE_OUTPUT_TOKENS = MAX_LINKS * 120;

const SEARCH_MATCH_COUNT = 10;

const rationalesSchema = z.array(
  z.object({ pair: z.number().int().min(0), rationale: z.string().trim().min(1).max(400) }),
).max(MAX_LINKS);

const searchHitsSchema = z.array(z.object({ document_id: z.string(), score: z.number() }));

// JSON mode answers with an object, so the array arrives under a key rather than on its own.
const rationaleAnswerSchema = z.object({ rationales: rationalesSchema });

const RATIONALE_SYSTEM =
  'You say in one line why two documents look like they are about the same thing. Answer with a ' +
  'JSON object and nothing else, of the form {"rationales": [...]}, where each entry has the ' +
  'keys pair (the number given) and rationale (one sentence).';

/** Two documents from one connection are one source talking to itself. */
function sourceOf(document: SpaceDocumentRow): string {
  return document.connection_id ?? 'upload';
}

/**
 * Semantic neighbours only. `search` builds its lexical arm with websearch_to_tsquery, which ANDs
 * every term, so a whole chunk as query text matches only the chunk itself and raises "tsquery
 * stack too small" once the chunk is dense enough. The embedding is what finds a neighbour here.
 */
async function searchNeighbours(pass: Pass, embedding: number[]): Promise<
  { document_id: string; score: number }[]
> {
  // The service role bypasses RLS, so this filter is what keeps the pass inside its own space.
  const { data, error } = await pass.deps.db.rpc('search', {
    query_embedding: embedding,
    query_text: '',
    space_filter: [pass.run.space_id],
    match_count: SEARCH_MATCH_COUNT,
  }).returns<unknown>();
  if (error) {
    console.error('the connections search failed', error.message);
    throw new ApiError(500, 'internal', 'the space could not be searched');
  }
  return parsed(searchHitsSchema, data ?? [], 'search results');
}

/** The pairs worth asking about: distinct documents, one hop from each source. */
async function candidatePairs(pass: Pass, documents: SpaceDocumentRow[]): Promise<
  { sourceId: string; otherId: string; similarity: number }[]
> {
  const { run, deps, db } = pass;
  const found = new Map<string, { sourceId: string; otherId: string; similarity: number }>();

  // Opening chunks in one read and their vectors in one model call.
  enter(pass, 'extract');
  const openings = await db.firstChunksOf(documents.map((document) => document.id));
  const readable = documents.flatMap((document) => {
    const chunk = openings.get(document.id);
    return chunk ? [{ document, chunk }] : [];
  });
  if (readable.length === 0) return [];

  enter(pass, 'extract');
  const embeddings = await deps.models.embed({
    orgId: run.org_id,
    texts: readable.map(({ chunk }) => chunk.content),
  });

  // The whole scan is one stage, however many searches it takes. Each search waits on Postgres
  // and on nothing the next one needs, so twenty in a row spent nineteen round trips idle.
  enter(pass, 'extract');
  const searched = await Promise.all(
    readable.map(({ document }, index) => {
      const embedding = embeddings[index];
      if (!embedding) return Promise.resolve({ document, hits: [] });
      return searchNeighbours(pass, embedding).then((hits) => ({ document, hits }));
    }),
  );

  // Collected in order afterwards, so which of two equal pairs wins does not depend on timing.
  for (const { document, hits } of searched) {
    for (const hit of hits) {
      if (hit.document_id === document.id) continue;
      const key = [document.id, hit.document_id].sort().join(':');
      if (found.has(key)) continue;
      // The fused search score, which ranks pairs within this pass only.
      found.set(key, { sourceId: document.id, otherId: hit.document_id, similarity: hit.score });
    }
  }
  return [...found.values()];
}

export async function dreamConnections(pass: Pass): Promise<DreamOutcome> {
  const { deps, db } = pass;
  enter(pass, 'collect');
  const documents = await db.recentDocuments(sinceIso(deps), MAX_COMPARED_DOCUMENTS);
  pass.inputDocumentCount = documents.length;
  if (documents.length === 0) return NOTHING;

  let produced = 0;
  for (let offset = 0; offset < documents.length; offset += MAX_COMPARED_DOCUMENTS) {
    produced += await connectBatch(pass, documents.slice(offset, offset + MAX_COMPARED_DOCUMENTS));
  }
  return { ...NOTHING, inputDocumentCount: documents.length, produced };
}

async function connectBatch(pass: Pass, documents: SpaceDocumentRow[]): Promise<number> {
  const { run, db } = pass;
  const candidates = await candidatePairs(pass, documents);
  enter(pass, 'collect');
  const others = await db.documentsByIds([...new Set(candidates.map((c) => c.otherId))]);
  const known = new Map([...documents, ...others].map((doc) => [doc.id, doc]));

  // Drop pairs the read could not return and pairs whose halves share a connection, then cap.
  const pairs = candidates
    .flatMap((candidate) => {
      const source = known.get(candidate.sourceId);
      const other = known.get(candidate.otherId);
      if (!source || !other || sourceOf(source) === sourceOf(other)) return [];
      return [{ candidate, title: `${source.title} and ${other.title}` }];
    })
    .sort((a, b) => b.candidate.similarity - a.candidate.similarity)
    .slice(0, MAX_LINKS);
  if (pairs.length === 0) return 0;

  enter(pass, 'synthesize');
  const prompt = pairs.map((pair, index) => `${index}: ${pair.title}`).join('\n');
  const answer = await ask(pass, {
    system: RATIONALE_SYSTEM,
    user: `CANDIDATE PAIRS\n${prompt}`,
    maxOutputTokens: RATIONALE_OUTPUT_TOKENS,
    json: true,
  });
  const rationales = new Map(
    readAnswer(rationaleAnswerSchema, answer, 'link rationales').rationales.map((
      row,
    ) => [row.pair, row.rationale]),
  );

  // Only links the model explained are written.
  const drafts: LinkDraft[] = pairs.flatMap(({ candidate }, index) => {
    const rationale = rationales.get(index);
    if (!rationale) return [];
    return [{
      dreamRunId: run.id,
      documentA: candidate.sourceId,
      documentB: candidate.otherId,
      similarity: candidate.similarity,
      rationale,
    }];
  });

  enter(pass, 'write');
  await db.insertLinks(drafts);
  return drafts.length;
}
