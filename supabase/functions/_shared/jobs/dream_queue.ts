import { ApiError } from '../errors.ts';
import { retireAbandoned } from './claim.ts';
import { runDreamJob } from './dream.ts';
import { dreamRunsSchema } from './dream_pass.ts';
import { type BatchOutcome, runDreamBatch } from './dream_batch.ts';
import type { JobDeps } from './types.ts';

/** Atomically claims available capacity so simultaneous workers receive different runs. */
export async function drainDreamQueue(
  deps: JobDeps,
  limit: number,
  executor: 'edge' | 'compute' = 'compute',
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
    .rpc(
      executor === 'edge' ? 'claim_edge_dream_run' : 'claim_dream_runs',
      executor === 'edge' ? {} : { p_limit: limit },
    )
    .returns<unknown>();
  if (error) {
    throw new ApiError(500, 'dream_queue_unavailable', 'the Dream queue could not be read');
  }
  const runs = dreamRunsSchema.parse(data ?? []);
  return { ...(await runDreamBatch(runs, deps, runDreamJob, true)), selected: runs.length };
}
