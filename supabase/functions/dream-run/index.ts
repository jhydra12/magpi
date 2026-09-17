// POST /dream-run. A user triggering a dream from the space page, run inline rather than queued.

import { ApiError, jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { dreamRunSchema, parseBody } from '../_shared/validate.ts';
import { audit, serviceClient } from '../_shared/db.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { requireSpaceMembership, requireUser } from '../_shared/auth.ts';
import { dreamRunBudgetMs } from '../_shared/env.ts';
import { runDreamJob } from '../_shared/jobs/dream.ts';
import { jobDepsFromEnv } from '../_shared/jobs/runtime.ts';
import { startManualRun } from './start.ts';

serveFunction('dream-run', async (core) => {
  const input = parseBody(dreamRunSchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  // Dreaming is expensive, so the per-space budget is tighter than the per-user one.
  await enforceRateLimits(db, [
    { bucket: `dream-run:user:${user.id}`, limit: 20, windowSeconds: 3600 },
    { bucket: `dream-run:space:${input.space_id}`, limit: 10, windowSeconds: 3600 },
  ]);

  const { orgId } = await requireSpaceMembership(db, user.id, input.space_id);

  const { data: space, error: spaceError } = await db
    .from('spaces')
    .select('dreaming_enabled')
    .eq('id', input.space_id)
    .maybeSingle<{ dreaming_enabled: boolean }>();
  if (spaceError) throw new ApiError(500, 'internal', 'the space could not be read');
  // Turning dreaming off stops a manual run too.
  if (!space?.dreaming_enabled) {
    throw new ApiError(409, 'dreaming_disabled', 'dreaming is switched off for this space');
  }

  // The budget can be pinned by env, which is how the keynote makes this run time out on cue.
  const deps = { ...jobDepsFromEnv(), budgetMs: dreamRunBudgetMs() };
  const run = await startManualRun(
    db,
    { orgId, spaceId: input.space_id, kind: input.kind, triggeredBy: user.id },
    deps.http.now(),
  );

  audit({
    actor: `user:${user.id}`,
    action: 'dream.run',
    target: run.id,
    ip: core.ip,
    meta: { space_id: input.space_id, kind: input.kind },
  });

  const result = await runDreamJob(run, deps);

  // 200 whatever the outcome, since the run's status is the answer, not the request's.
  return jsonResponse({
    dream_run_id: run.id,
    status: result.kind === 'succeeded' ? 'succeeded' : result.kind,
    output_document_id: result.kind === 'succeeded' ? result.outputDocumentId : null,
  });
});
