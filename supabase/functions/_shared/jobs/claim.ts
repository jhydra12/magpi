// Taking a row nobody else is working on, since worker invocations overlap.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { ApiError } from '../errors.ts';
import type { IngestJobRecord } from './ingest.ts';

/** A connection left `syncing` for longer than this is abandoned rather than busy. */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

/** How long a row may sit `running` before it is treated as abandoned. */
export const ABANDONED_AFTER_MS = 15 * 60 * 1000;

export interface AbandonedSweep {
  table: string;
  /** When the row was picked up: claimed_at on a job, started_at on a run. */
  startedColumn: string;
  /** Written alongside the terminal status, which the table requires. */
  error: string;
  /** Set on a table that records when work stopped. */
  finishedColumn?: string;
}

/** Retires rows left `running` by a worker whose isolate was killed before it could finish. */
export async function retireAbandoned(
  db: SupabaseClient,
  sweep: AbandonedSweep,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_MS).toISOString();
  const patch: Record<string, unknown> = { status: 'timeout', error: sweep.error };
  if (sweep.finishedColumn) patch[sweep.finishedColumn] = now.toISOString();

  const { data, error } = await db
    .from(sweep.table)
    .update(patch)
    .eq('status', 'running')
    .lt(sweep.startedColumn, cutoff)
    .select('id')
    .returns<{ id: string }[]>();

  // Housekeeping must never fail the batch it runs before.
  if (error) {
    console.error('abandoned sweep failed', sweep.table, error.message);
    return 0;
  }
  return (data ?? []).length;
}

/** Moves one row out of `queued`, returning true only if this caller was the one to move it. */
export async function claimQueuedRow(
  db: SupabaseClient,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  throwOnError = false,
): Promise<boolean> {
  const { data, error } = await db
    .from(table)
    .update(patch)
    .eq('id', id)
    .eq('status', 'queued')
    .select('id')
    .maybeSingle<{ id: string }>();

  // A failed claim is the ordinary answer when another worker was faster.
  if (error) {
    if (throwOnError) {
      throw new ApiError(500, 'claim_failed', 'the queued run could not be claimed');
    }
    console.error('claim failed', table, id, error.message);
    return false;
  }
  return data !== null;
}

// The rpc returns whole ingest_jobs rows; the job body reads six of the columns. `attempts` is
// the count this claim just raised, which a job that was only throttled gives back.
const claimedJobsSchema = z.array(z.object({
  id: z.uuid(),
  org_id: z.uuid(),
  space_id: z.uuid(),
  document_id: z.uuid(),
  connection_id: z.uuid().nullable(),
  attempts: z.number().int(),
}));

/** Takes a batch of queued ingest jobs, marking them running in the statement that selects them. */
export async function claimIngestJobs(
  db: SupabaseClient,
  limit: number,
): Promise<IngestJobRecord[]> {
  const { data, error } = await db.rpc('claim_ingest_jobs', { p_limit: limit });
  if (error) {
    console.error('claiming ingest jobs failed', error.message);
    throw new ApiError(500, 'internal', 'the ingest queue could not be claimed');
  }

  const claimed = claimedJobsSchema.safeParse(data ?? []);
  if (!claimed.success) {
    console.error('claim_ingest_jobs returned rows this worker cannot read', claimed.error.message);
    throw new ApiError(500, 'internal', 'the ingest queue could not be claimed');
  }
  return claimed.data;
}

/** Claims a connection for a sync pass by setting `syncing` and clearing the last reason. */
export async function claimConnectionForSync(
  db: SupabaseClient,
  connectionId: string,
  now: Date,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();

  const { data, error } = await db
    .from('connections')
    .update({ status: 'syncing', status_detail: null })
    .eq('id', connectionId)
    .or(`status.neq.syncing,updated_at.lt.${staleBefore}`)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error('connection claim failed', connectionId, error.message);
    return false;
  }
  return data !== null;
}
