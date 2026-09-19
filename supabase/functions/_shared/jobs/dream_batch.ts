// Claims a page of queued dream runs and runs them together.

import { claimQueuedRow } from './claim.ts';
import type { DreamResult, DreamRunRecord } from './dream.ts';
import type { JobDeps } from './types.ts';

export interface BatchOutcome {
  results: (DreamResult & { run_id: string })[];
  contended: number;
}

/** What the worker hands in: one run to completion. */
export type RunOne = (run: DreamRunRecord, deps: JobDeps) => Promise<DreamResult>;

/**
 * Runs are independent: different spaces, or different kinds within one space, writing different
 * rows. A run spends most of its budget waiting on the model and on Postgres, so running them in
 * sequence made a batch cost the sum of its waits.
 */
export async function runDreamBatch(
  runs: DreamRunRecord[],
  deps: JobDeps,
  runOne: RunOne,
  alreadyClaimed = false,
): Promise<BatchOutcome> {
  const settled = await Promise.allSettled(runs.map(async (run) => {
    // A select says the run was queued a moment ago, not that this caller owns it.
    const claimed = alreadyClaimed || await claimQueuedRow(deps.db, 'dream_runs', run.id, {
      status: 'running',
      started_at: deps.http.now().toISOString(),
    }, true);
    if (!claimed) return null;
    try {
      return { run_id: run.id, ...(await runOne(run, deps)) };
    } catch {
      const detail = 'the dream worker stopped on an unexpected error';
      const { error } = await deps.db.from('dream_runs').update({
        status: 'failed',
        error: detail,
        finished_at: deps.http.now().toISOString(),
      }).eq('id', run.id).eq('status', 'running');
      if (error) console.error('dream failure could not be recorded', run.id);
      return { run_id: run.id, kind: 'failed' as const, detail };
    }
  }));

  // All started jobs must finish before a caller can retry after a claim/database failure.
  const failed = settled.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  const results = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  return {
    results: results.filter((result) => result !== null),
    contended: results.filter((result) => result === null).length,
  };
}
