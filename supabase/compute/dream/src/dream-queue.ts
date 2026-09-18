import { ApiError } from '../../../functions/_shared/errors.ts';
import { retireAbandoned } from '../../../functions/_shared/jobs/claim.ts';
import { runDreamJob, type DreamRunRecord } from '../../../functions/_shared/jobs/dream.ts';
import { runDreamBatch, type BatchOutcome } from '../../../functions/_shared/jobs/dream_batch.ts';
import type { JobDeps } from '../../../functions/_shared/jobs/types.ts';

/** Selects at most the immediately available capacity; conditional updates claim each run. */
export async function drainDreamQueue(
  deps: JobDeps,
  limit: number,
): Promise<BatchOutcome & { selected: number }> {
  await retireAbandoned(
    deps.db,
    {
      table: 'dream_runs',
      startedColumn: 'started_at',
      finishedColumn: 'finished_at',
      error: 'the run was interrupted and did not finish',
    },
    deps.http.now(),
  );
  const { data, error } = await deps.db
    .from('dream_runs')
    .select('id, org_id, space_id, kind')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)
    .returns<DreamRunRecord[]>();
  if (error)
    throw new ApiError(500, 'dream_queue_unavailable', 'the Dream queue could not be read');
  const runs = data ?? [];
  return { ...(await runDreamBatch(runs, deps, runDreamJob)), selected: runs.length };
}
