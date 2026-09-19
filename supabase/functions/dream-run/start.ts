// Manual runs wait in the same queue as scheduled runs until a worker claims them.

import type { SupabaseClient } from '@supabase/supabase-js';

import { requireSpaceMembership } from '../_shared/auth.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { ApiError } from '../_shared/errors.ts';
import { dreamRunsSchema } from '../_shared/jobs/dream_pass.ts';
import type { DreamRunRecord } from '../_shared/jobs/dream.ts';

export interface ManualRunInput {
  orgId: string;
  spaceId: string;
  kind: DreamRunRecord['kind'];
  triggeredBy: string;
}

export interface ManualDreamInput extends Omit<ManualRunInput, 'kind'> {
  kind?: ManualRunInput['kind'] | 'all';
}

/** Queues the complete Dream in one database statement, or one explicitly requested task. */
export async function startManualDream(
  db: SupabaseClient,
  input: ManualDreamInput,
): Promise<DreamRunRecord[]> {
  const kinds = input.kind && input.kind !== 'all'
    ? [input.kind]
    : ['entities', 'digest', 'connections'];
  const { data, error } = await db.rpc('enqueue_dream', {
    p_org_id: input.orgId,
    p_space_id: input.spaceId,
    p_user_id: input.triggeredBy,
    p_kinds: kinds,
  }).returns<unknown>();
  if (error) throw new ApiError(500, 'internal', 'the dream could not be started');
  const parsed = dreamRunsSchema.safeParse(data);
  if (!parsed.success) throw new ApiError(500, 'internal', 'the dream could not be started');
  const runs = parsed.data;
  if (
    runs.length !== kinds.length || new Set(runs.map((run) => run.id)).size !== kinds.length ||
    kinds.some((kind) => !runs.some((run) => run.kind === kind))
  ) throw new ApiError(500, 'internal', 'the dream could not be started');
  return kinds.flatMap((kind) => runs.filter((run) => run.kind === kind));
}

export async function startManualRun(
  db: SupabaseClient,
  input: ManualRunInput,
): Promise<DreamRunRecord> {
  const runs = await startManualDream(db, input);
  return runs[0];
}

/** User throttling precedes authorization; a forbidden caller cannot consume space quota. */
export async function authorizeDream(
  db: SupabaseClient,
  userId: string,
  spaceId: string,
): Promise<{ orgId: string }> {
  await enforceRateLimits(db, [{
    bucket: `dream-run:user:${userId}`,
    limit: 200,
    windowSeconds: 3600,
  }]);
  const scope = await requireSpaceMembership(db, userId, spaceId);
  await enforceRateLimits(db, [{
    bucket: `dream-run:space:${spaceId}`,
    limit: 10,
    windowSeconds: 3600,
  }]);
  return scope;
}
