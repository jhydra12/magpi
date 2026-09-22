import type { Database } from '@/lib/database.types';

type DreamRunInsert = Database['public']['Tables']['dream_runs']['Insert'];

const RESET_TIMEOUT_COUNT = 3;
const SUCCESS_COMPLETION_GAP_MS = 60_000;
const SUCCESS_RUN_DURATION_MS = 30_000;

/** Builds the finished Dream rows shown after a full demo reset. */
export function buildDemoResetDreamRuns(
  orgId: string,
  spaceIds: readonly string[],
  resetAt: Date,
): DreamRunInsert[] {
  const firstFinishedAt = new Date(
    Date.UTC(resetAt.getUTCFullYear(), resetAt.getUTCMonth(), resetAt.getUTCDate(), 6, 1),
  );
  const timeoutCount = Math.min(RESET_TIMEOUT_COUNT, Math.max(0, spaceIds.length - 1));
  let successIndex = 0;

  return spaceIds.map((spaceId, index) => {
    const didTimeOut = index < timeoutCount;
    const finishedAt = didTimeOut
      ? firstFinishedAt
      : new Date(firstFinishedAt.getTime() + successIndex++ * SUCCESS_COMPLETION_GAP_MS);
    const startedAt = new Date(
      finishedAt.getTime() - (didTimeOut ? 5 * 60_000 : SUCCESS_RUN_DURATION_MS),
    );
    return {
      org_id: orgId,
      space_id: spaceId,
      kind: 'digest',
      status: didTimeOut ? 'timeout' : 'succeeded',
      created_at: startedAt.toISOString(),
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      error: didTimeOut ? 'processing did not finish before the time limit' : null,
    };
  });
}
