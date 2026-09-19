// One document, end to end: fetch, extract, chunk, embed, store. One import is one job.

import type { SupabaseClient } from '@supabase/supabase-js';

import { sha256Hex } from '../crypto.ts';
import { loadConnection } from '../connections.ts';
import { chunkText } from '../chunking.ts';
import { extractText } from '../extract.ts';
import { ApiError } from '../errors.ts';
import { isRateLimited, SourceError } from '../sources/contract.ts';
import { driverFor } from '../sources/index.ts';
import { resolveCredentials } from '../token_refresh.ts';
import { type Budget, DEFAULT_BUDGET_MS, StageTimeout, startBudget } from './budget.ts';
import { type IngestStage, type JobDeps, recordUsage } from './types.ts';

/** How many chunks are embedded per call. */
const EMBED_BATCH = 64;

export interface IngestJobRecord {
  id: string;
  org_id: string;
  space_id: string;
  document_id: string;
  connection_id: string | null;
  /** Counted up by the claim. A job gives one back when it was only ever throttled. */
  attempts: number;
}

export type IngestResult =
  | { kind: 'succeeded'; chunkCount: number }
  | { kind: 'unchanged' }
  | { kind: 'timeout'; stage: IngestStage }
  // `rateLimited` says the provider asked us to wait, which is a reason to stop claiming more.
  | { kind: 'retrying'; stage: IngestStage; detail: string; rateLimited?: true }
  | { kind: 'failed'; stage: IngestStage; detail: string };

interface DocumentRow {
  id: string;
  org_id: string;
  space_id: string;
  connection_id: string | null;
  external_id: string | null;
  title: string;
  url: string | null;
  mime_type: string | null;
  storage_path: string | null;
  content_hash: string | null;
  version: number;
  size_bytes: number | null;
}

const DOCUMENT_COLUMNS =
  'id, org_id, space_id, connection_id, external_id, title, url, mime_type, storage_path, content_hash, version, size_bytes';

interface SourceText {
  text: string;
  mimeType: string;
  title: string;
  url: string | null;
  /** The uploaded file's bytes, or the fetched text for a synced document. */
  sizeBytes: number;
  /** Only an upload consumes Storage, and only Storage is worth metering. */
  occupiesStorage: boolean;
}

async function loadDocument(db: SupabaseClient, documentId: string): Promise<DocumentRow> {
  const { data, error } = await db
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .maybeSingle<DocumentRow>();
  if (error) throw new ApiError(500, 'internal', 'document lookup failed');
  if (!data) throw new ApiError(404, 'unknown_document', 'that document no longer exists');
  return data;
}

/** Moves the job to its next stage, charging the budget to the stage that just ran. */
async function enterStage(
  deps: JobDeps,
  job: IngestJobRecord,
  budget: Budget,
  ran: IngestStage,
  next: IngestStage,
): Promise<IngestStage> {
  budget.checkpoint(ran);
  const { error } = await deps.db
    .from('ingest_jobs')
    .update({ stage: next, status: 'running' })
    .eq('id', job.id);
  if (error) console.error('an ingest stage could not be recorded', job.id, next, error.message);
  return next;
}

/** An uploaded file's bytes, or a source document's text. */
async function readSource(document: DocumentRow, deps: JobDeps): Promise<SourceText> {
  if (document.storage_path) {
    const bytes = await deps.uploads.read(document.storage_path);
    const extracted = await extractText({
      bytes,
      mimeType: document.mime_type ?? 'text/plain',
    });
    return {
      text: extracted.text,
      mimeType: extracted.mimeType,
      title: document.title,
      url: document.url,
      sizeBytes: bytes.byteLength,
      occupiesStorage: true,
    };
  }

  if (!document.connection_id || !document.external_id) {
    throw new ApiError(
      422,
      'unreadable_document',
      'that document has neither uploaded bytes nor a source to fetch from',
    );
  }

  const connection = await loadConnection(deps.db, document.connection_id);
  if (!connection) {
    throw new ApiError(409, 'connection_gone', 'the source connection has been removed');
  }

  const outcome = await resolveCredentials(connection, {
    db: deps.db,
    http: deps.http,
    env: deps.env,
  });
  if (outcome.kind === 'expired') {
    throw new SourceError(connection.provider, outcome.detail, true);
  }

  const fetched = await driverFor(connection.provider).fetchDocument(
    outcome.credentials,
    deps.http,
    document.external_id,
  );

  return {
    text: fetched.text,
    mimeType: fetched.mimeType,
    title: fetched.title,
    url: fetched.url,
    sizeBytes: new TextEncoder().encode(fetched.text).byteLength,
    occupiesStorage: false,
  };
}

/** Writes the status the job ended in. A refused write leaves the row for claim_ingest_jobs. */
async function finish(
  deps: JobDeps,
  job: IngestJobRecord,
  patch: { status: string; stage: IngestStage; error: string | null; attempts?: number },
): Promise<void> {
  const { error } = await deps.db.from('ingest_jobs').update(patch).eq('id', job.id);
  if (error) {
    console.error('an ingest job could not be recorded as', patch.status, job.id, error.message);
  }
}

function detailOf(err: unknown): string {
  // SourceError and ApiError messages are ours to show. Anything else is logged, not shown.
  if (err instanceof SourceError) return err.message;
  if (err instanceof ApiError) return err.message;
  console.error('ingest job failed unexpectedly', err);
  return 'the import failed unexpectedly';
}

export async function runIngestJob(job: IngestJobRecord, deps: JobDeps): Promise<IngestResult> {
  const budget = startBudget(deps.http, deps.budgetMs ?? DEFAULT_BUDGET_MS);
  // The caller already set status, claimed_at and attempts when it claimed this row.
  let stage: IngestStage = 'fetch';

  try {
    const document = await loadDocument(deps.db, job.document_id);
    const source = await readSource(document, deps);

    stage = await enterStage(deps, job, budget, stage, 'extract');
    const contentHash = await sha256Hex(source.text);

    // Text that has not changed is not embedded again.
    if (document.content_hash === contentHash) {
      await finish(deps, job, { status: 'succeeded', stage: 'store', error: null });
      return { kind: 'unchanged' };
    }

    stage = await enterStage(deps, job, budget, stage, 'chunk');
    const chunks = chunkText(source.text);

    stage = await enterStage(deps, job, budget, stage, 'embed');
    const embeddings: number[][] = [];
    for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
      budget.checkpoint(stage);
      const batch = chunks.slice(start, start + EMBED_BATCH);
      embeddings.push(
        ...(await deps.models.embed({
          orgId: document.org_id,
          texts: batch.map((chunk) => chunk.content),
        })),
      );
    }

    stage = await enterStage(deps, job, budget, stage, 'store');
    const { error: documentError } = await deps.db.rpc('replace_document_chunks', {
      p_document_id: document.id,
      p_chunks: chunks.map((chunk, index) => ({
        ordinal: chunk.ordinal,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding: embeddings[index],
      })),
      p_metadata: {
        content_hash: contentHash,
        title: source.title,
        url: source.url,
        mime_type: source.mimeType,
        size_bytes: source.sizeBytes,
      },
    });
    if (documentError) throw new ApiError(500, 'internal', 'the document could not be replaced');

    await recordUsage(deps.db, [
      { orgId: document.org_id, kind: 'document_ingested', quantity: 1 },
      { orgId: document.org_id, kind: 'chunk_embedded', quantity: chunks.length },
      // The delta, not the size, because the admin page sums these events.
      ...(source.occupiesStorage
        ? [{
          orgId: document.org_id,
          kind: 'storage_bytes' as const,
          quantity: source.sizeBytes - (document.size_bytes ?? 0),
        }]
        : []),
    ]);

    await finish(deps, job, { status: 'succeeded', stage: 'store', error: null });
    return { kind: 'succeeded', chunkCount: chunks.length };
  } catch (err) {
    if (err instanceof StageTimeout) {
      // The stage says where the import ran out of budget.
      await finish(deps, job, { status: 'timeout', stage, error: err.message });
      return { kind: 'timeout', stage };
    }

    const detail = detailOf(err);

    // Being throttled is not an attempt at the work, so the claim that spent one gives it back.
    // Three retries inside six minutes would otherwise discard a document over an hourly limit.
    if (isRateLimited(err)) {
      await finish(deps, job, {
        status: 'queued',
        stage,
        error: detail,
        attempts: Math.max(job.attempts - 1, 0),
      });
      return { kind: 'retrying', stage, detail, rateLimited: true };
    }

    // A momentary provider failure goes back on the queue; a refused credential is terminal.
    if (err instanceof SourceError && !err.needsReconnect) {
      await finish(deps, job, { status: 'queued', stage, error: detail });
      return { kind: 'retrying', stage, detail };
    }

    await finish(deps, job, { status: 'failed', stage, error: detail });
    return { kind: 'failed', stage, detail };
  }
}
