// POST /dream-worker. Picks up queued dream runs, created elsewhere, and calls the job body.

import { denoEnv } from '../_shared/env.ts';
import { dreamBudgetMs } from '../_shared/jobs/budget.ts';
import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { drainDreamQueue } from '../_shared/jobs/dream_queue.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

// A night's runs go together. A failure is recorded on its own row and leaves the others alone.
const DEFAULT_BATCH = 8;

serveFunction('dream-worker', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = { ...jobDepsFromEnv(), budgetMs: dreamBudgetMs(denoEnv.get('SB_DREAM_BUDGET_MS')) };

  const { results, contended } = await drainDreamQueue(deps, input.batch ?? DEFAULT_BATCH);
  return jsonResponse({ claimed: results.length, contended, results });
});
