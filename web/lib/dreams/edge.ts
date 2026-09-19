import { z } from 'zod';

import { invokeEdgeFunction, type FunctionsClient } from '@/lib/edge/invoke';
import { ok, type Result } from '@/lib/result';

import type { DreamKind } from './status';

/** A successful submission queues work for Compute and returns before processing starts. */
const runResponse = z.object({
  dream_run_id: z.uuid(),
  dream_run_ids: z.array(z.uuid()).min(1).max(3).optional(),
  status: z.enum(['queued', 'succeeded', 'failed', 'timeout']),
  output_document_id: z.uuid().nullable(),
});

export type DreamRunOutcome = {
  readonly dreamRunId: string;
  readonly dreamRunIds: readonly string[];
  readonly status: 'queued' | 'succeeded' | 'failed' | 'timeout';
  readonly outputDocumentId: string | null;
};

/** Queue all tasks or one explicit task through the authenticated endpoint. */
export async function requestDreamRun(
  client: FunctionsClient,
  input: { spaceId: string; kind: DreamKind | 'all' },
): Promise<Result<DreamRunOutcome, string>> {
  const result = await invokeEdgeFunction(
    client,
    'dream-run',
    { space_id: input.spaceId, kind: input.kind },
    runResponse,
  );
  if (!result.ok) return result;
  const ids = result.data.dream_run_ids ?? [result.data.dream_run_id];
  return ok({
    dreamRunId: result.data.dream_run_id,
    dreamRunIds: ids,
    status: result.data.status,
    outputDocumentId: result.data.output_document_id,
  });
}
