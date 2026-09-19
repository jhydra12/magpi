// Manual runs wait in the same queue as scheduled runs until a worker claims them.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '../_shared/errors.ts';
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
  if (input.kind && input.kind !== 'all') {
    return [await startManualRun(db, { ...input, kind: input.kind })];
  }

  const kinds = ['entities', 'digest', 'connections'] as const;
  const createdAt = new Date().toISOString();
  const { data, error } = await db
    .from('dream_runs')
    .insert(kinds.map((kind) => ({
      org_id: input.orgId,
      space_id: input.spaceId,
      kind,
      status: 'queued',
      started_at: null,
      triggered_by: input.triggeredBy,
      created_at: createdAt,
    })))
    .select('id, org_id, space_id, kind')
    .returns<DreamRunRecord[]>();

  if (
    error || !data || data.length !== kinds.length ||
    new Set(data.map((run) => run.id)).size !== kinds.length
  ) {
    throw new ApiError(500, 'internal', 'the dream could not be started');
  }
  return kinds.map((kind) => {
    const run = data.find((row) => row.kind === kind);
    if (!run) throw new ApiError(500, 'internal', 'the dream could not be started');
    return run;
  });
}

export async function startManualRun(
  db: SupabaseClient,
  input: ManualRunInput,
): Promise<DreamRunRecord> {
  const { data, error } = await db
    .from('dream_runs')
    .insert({
      org_id: input.orgId,
      space_id: input.spaceId,
      kind: input.kind,
      status: 'queued',
      started_at: null,
      triggered_by: input.triggeredBy,
    })
    .select('id, org_id, space_id, kind')
    .single<DreamRunRecord>();

  if (error || !data) throw new ApiError(500, 'internal', 'the run could not be started');
  return data;
}
