'use server';

import { revalidatePath } from 'next/cache';

import { resolveAdminAccess } from '@/lib/analytics/access';
import { errorState, successState, type ActionState } from '@/lib/actions/state';
import {
  resetDreamCompute,
  assertComputeResetConfigured,
  isDreamComputeAbsent,
} from '@/lib/admin/compute-reset';
import { dreamRateLimitBuckets } from './rate-limit';

async function deleteGeneratedDreamData(
  access: Extract<Awaited<ReturnType<typeof resolveAdminAccess>>, { kind: 'granted' }>,
): Promise<ActionState<{ deleted: number }>> {
  const { elevated: db, context } = access;
  const { orgId } = context;

  const { data: spaces, error: spacesError } = await db
    .from('spaces')
    .select('id')
    .eq('org_id', orgId);
  if (spacesError) return errorState(`The demo could not be reset: ${spacesError.message}`);

  const { data: dreamDocuments, error: readError } = await db
    .from('documents')
    .select('id, storage_path')
    .eq('org_id', orgId)
    .eq('origin', 'dream');
  if (readError) return errorState(`The demo could not be reset: ${readError.message}`);

  const storagePaths = (dreamDocuments ?? [])
    .map((document) => document.storage_path)
    .filter((path): path is string => Boolean(path));
  if (storagePaths.length > 0) {
    const { error } = await db.storage.from('documents').remove(storagePaths);
    if (error) return errorState(`Generated files could not be deleted: ${error.message}`);
  }

  const deletions = [
    db.from('dream_runs').delete().eq('org_id', orgId),
    db.from('entities').delete().eq('org_id', orgId),
    db.from('documents').delete().eq('org_id', orgId).eq('origin', 'dream'),
    db.from('usage_events').delete().eq('org_id', orgId).eq('kind', 'dream_run'),
    db.from('model_calls').delete().eq('org_id', orgId).in('purpose', ['dream', 'extract']),
    db
      .from('rate_limits')
      .delete()
      .in(
        'bucket',
        dreamRateLimitBuckets(
          context.userId,
          (spaces ?? []).map((space) => space.id),
        ),
      ),
  ];

  for (const deletion of deletions) {
    const { error } = await deletion;
    if (error) return errorState(`The demo could not be reset: ${error.message}`);
  }

  revalidatePath('/admin/demo');
  revalidatePath('/admin');
  revalidatePath('/dreams');
  revalidatePath('/dreams/entities');
  revalidatePath('/dreams/log');
  return successState({ deleted: dreamDocuments?.length ?? 0 });
}

async function deleteDemoChatHistory(
  access: Extract<Awaited<ReturnType<typeof resolveAdminAccess>>, { kind: 'granted' }>,
): Promise<ActionState<{ complete: boolean }>> {
  const { elevated: db, context } = access;
  const { error: conversationsError } = await db
    .from('conversations')
    .delete()
    .eq('org_id', context.orgId);
  if (conversationsError)
    return errorState(`Chat history could not be deleted: ${conversationsError.message}`);

  const { error: foldersError } = await db
    .from('conversation_folders')
    .delete()
    .eq('org_id', context.orgId);
  if (foldersError) return errorState(`Chat folders could not be deleted: ${foldersError.message}`);

  revalidatePath('/chat');
  return successState({ complete: true });
}

/** Runs one verified reset stage; repeated calls resume waiting without a long request. */
export async function resetDemoStep(step: string): Promise<ActionState<{ complete: boolean }>> {
  const access = await resolveAdminAccess();
  if (access.kind === 'signed-out') return errorState('You need to sign in to do that.');
  if (access.kind === 'forbidden') return errorState('Only an owner or admin can reset the demo.');
  const db = access.elevated;
  try {
    if (!['pause', 'chats', 'compute', 'data', 'edge'].includes(step))
      return errorState('Unknown reset step.');
    assertComputeResetConfigured();
    if (step === 'pause') {
      const { error } = await db.rpc('set_dream_execution_mode', { p_mode: 'paused' });
      if (error) throw new Error('Dream processing could not be paused.');
      // Pausing unschedules the workers that would retire their own abandoned rows, so a run
      // whose worker died would otherwise keep this step waiting for it forever.
      const { error: sweepError } = await db.rpc('sweep_stale_worker_runs');
      if (sweepError) throw new Error('Stalled Dream work could not be cleared.');
      return successState({ complete: await hasNoActiveWorkers(db) });
    }
    const { data: mode, error: modeError } = await db.rpc('dream_execution_mode');
    if (modeError || mode !== 'paused')
      return errorState('Start Reset again to pause Dream processing.');
    if (!(await hasNoActiveWorkers(db)))
      return errorState('Dream work is still finishing. Start Reset again to wait for it.');
    if (step === 'chats') return deleteDemoChatHistory(access);
    if (step === 'compute') return successState(await resetDreamCompute());
    if (!(await isDreamComputeAbsent()))
      return errorState('Compute deletion has not finished. Start Reset again.');
    if (step === 'data') {
      const result = await deleteGeneratedDreamData(access);
      return result.status === 'error' ? result : successState({ complete: true });
    }
    const { count, error: runsError } = await db
      .from('dream_runs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', access.context.orgId);
    if (runsError || count !== 0)
      return errorState('Generated Dream data remains. Start Reset again.');
    const { error } = await db.rpc('set_dream_execution_mode', { p_mode: 'edge' });
    if (error) throw new Error('Edge processing could not be restored. Start Reset again.');
    return successState({ complete: true });
  } catch (error) {
    return errorState(error instanceof Error ? error.message : 'The demo could not be reset.');
  }
}

async function hasNoActiveWorkers(
  db: Extract<Awaited<ReturnType<typeof resolveAdminAccess>>, { kind: 'granted' }>['elevated'],
): Promise<boolean> {
  const results = await Promise.all([
    db.from('dream_runs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
    db.from('ingest_jobs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
  ]);
  if (results.some((result) => result.error))
    throw new Error('Worker status could not be checked.');
  return results.every((result) => result.count === 0);
}
