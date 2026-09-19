// The digest pass: summarise the day's chunks into one cited document, then chunk and embed it.

import { chunkText } from '../chunking.ts';
import { ApiError } from '../errors.ts';
import {
  ask,
  chunkPrompt,
  counted,
  type DreamOutcome,
  enter,
  MAX_INPUT_CHUNKS,
  NOTHING,
  type Pass,
  sinceIso,
} from './dream_pass.ts';
import type { SpaceChunkRow } from './space_writer.ts';

const DIGEST_SYSTEM =
  'You summarise what a team changed, decided and left unresolved. Answer in short markdown ' +
  'with three sections: What changed, What was decided, What is unresolved. Say only what the ' +
  'notes say. Answer in prose. Do not add a sources or citations section.';

const MARKER = /\[\[chunk:[^\]]*\]\]/g;

/** What a digest read, for documents.source_chunk_ids, in read order rather than sorted. */
function citedChunkIds(chunks: SpaceChunkRow[]): string[] {
  return [...new Set(chunks.map((chunk) => chunk.id))];
}

/** Strips anything shaped like a chunk marker, since citations live in a column. */
function prose(summary: string): string {
  return summary.replace(MARKER, '').trim();
}

export async function dreamDigest(pass: Pass): Promise<DreamOutcome> {
  const { deps, db } = pass;
  enter(pass, 'collect');
  const chunks = counted(pass, await db.recentChunks(sinceIso(deps), MAX_INPUT_CHUNKS));
  // A digest of nothing would be a document with no citations, so produce nothing.
  if (chunks.length === 0) return NOTHING;

  let outputDocumentId: string | null = null;
  let produced = 0;
  for (let offset = 0; offset < chunks.length; offset += MAX_INPUT_CHUNKS) {
    const outcome = await digestBatch(pass, chunks.slice(offset, offset + MAX_INPUT_CHUNKS));
    outputDocumentId = outcome.outputDocumentId;
    produced += outcome.produced;
  }
  return { inputDocumentCount: pass.inputDocumentCount, outputDocumentId, produced };
}

async function digestBatch(pass: Pass, chunks: SpaceChunkRow[]): Promise<DreamOutcome> {
  const { run, deps, db } = pass;
  enter(pass, 'synthesize');
  const summary = await ask(pass, {
    system: DIGEST_SYSTEM,
    user: chunkPrompt(chunks),
    maxOutputTokens: 1500,
  });

  enter(pass, 'write');
  const body = prose(summary);
  const day = deps.http.now().toISOString().slice(0, 10);
  const documentId = await db.insertDreamDocument({
    dreamRunId: run.id,
    title: `Digest for ${day}`,
    text: body,
    sourceChunkIds: citedChunkIds(chunks),
  });

  const pieces = chunkText(body);
  enter(pass, 'write');
  const vectors = await deps.models.embed({
    orgId: run.org_id,
    texts: pieces.map((piece) => piece.content),
  });
  if (vectors.length !== pieces.length) {
    throw new ApiError(502, 'model_error', 'the digest could not be embedded');
  }

  enter(pass, 'write');
  await db.insertChunks(
    documentId,
    pieces.map((piece, index) => ({ ...piece, embedding: vectors[index] })),
  );
  return {
    inputDocumentCount: pass.inputDocumentCount,
    outputDocumentId: documentId,
    produced: pieces.length,
  };
}
