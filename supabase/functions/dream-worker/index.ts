// POST /dream-worker. Picks up queued dream runs, created elsewhere, and calls the job body.

import { denoEnv } from '../_shared/env.ts';
import { dreamBudgetMs } from '../_shared/jobs/budget.ts';
import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { drainDreamQueue } from '../_shared/jobs/dream_queue.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

// The runtime keeps this promise alive after the wake request receives its response.
declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void } | undefined;

serveFunction('dream-worker', async (core) => {
  requireWorkerCaller(core.headers);
  parseBody(workerBatchSchema, core.body ?? {});
  const deps = { ...jobDepsFromEnv(), budgetMs: dreamBudgetMs(denoEnv.get('SB_DREAM_BUDGET_MS')) };

  const work = drainDreamQueue(deps, 1, 'edge');
  if (typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(
      work.catch(() => console.error('Edge Dream wake failed; cron will retry')),
    );
    return jsonResponse({ accepted: true }, { status: 202 });
  }
  const { results, contended } = await work;
  return jsonResponse({ claimed: results.length, contended, results });
});
