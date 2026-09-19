// POST /dream-run. Authorizes and queues Dream tasks for the worker.

import { ApiError, jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { dreamRunSchema, parseBody } from '../_shared/validate.ts';
import { audit, serviceClient } from '../_shared/db.ts';
import { requireUser } from '../_shared/auth.ts';
import { authorizeDream, startManualDream } from './start.ts';

serveFunction('dream-run', async (core) => {
  const input = parseBody(dreamRunSchema, core.body);
  const user = await requireUser(core.headers);
  const db = serviceClient();

  const { orgId } = await authorizeDream(db, user.id, input.space_id);

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

  const runs = await startManualDream(
    db,
    { orgId, spaceId: input.space_id, kind: input.kind, triggeredBy: user.id },
  );
  const run = runs.find((item) => item.kind === 'digest') ?? runs[0];

  audit({
    actor: `user:${user.id}`,
    action: 'dream.run',
    target: run.id,
    ip: core.ip,
    meta: {
      space_id: input.space_id,
      kind: input.kind,
      dream_run_ids: runs.map((item) => item.id),
    },
  });

  return jsonResponse({
    dream_run_id: run.id,
    dream_run_ids: runs.map((item) => item.id),
    status: 'queued',
    output_document_id: null,
  }, { status: 202 });
});
