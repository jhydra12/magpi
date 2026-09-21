'use server';

import { revalidatePath } from 'next/cache';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { resolveAdminAccess } from '@/lib/analytics/access';
import { dreamRateLimitBuckets } from './rate-limit';

/** Clear this organization's dreams without tearing down its running services. */
export async function resetDreams(): Promise<ActionState> {
  const access = await resolveAdminAccess();
  if (access.kind === 'signed-out') return errorState('You need to sign in to do that.');
  if (access.kind !== 'granted') return errorState('Only an owner or admin can reset dreams.');

  const { elevated: db, context } = access;
  let resumeMode: 'edge' | 'compute' | null = null;
  let failure: string | null = null;
  try {
    const { data: mode, error: modeError } = await db.rpc('dream_execution_mode');
    if (modeError || !['edge', 'compute', 'paused'].includes(mode ?? ''))
      throw new Error('Dream processing status could not be checked.');
    // A paused project may be in the middle of a full reset in another tab.
    if (mode === 'paused')
      throw new Error('Dream processing is paused. Finish the current reset first.');
    resumeMode = mode as 'edge' | 'compute';
    const { error: pauseError } = await db.rpc('set_dream_execution_mode', { p_mode: 'paused' });
    if (pauseError) throw new Error('Dream processing could not be paused.');

    // Claims share the execution-mode lock, so no new worker can start after the pause.
    // Existing workers must finish before their output can safely be removed.
    const { count, error: activeError } = await db
      .from('dream_runs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', context.orgId)
      .eq('status', 'running');
    if (activeError || count === null) throw new Error('Active dreams could not be checked.');
    if (count > 0)
      throw new Error(
        'Dreams are still running. Wait for them to finish, then reset dreams again.',
      );

    // Delete in bounded batches so every generated file is removed, even above the API row limit.
    while (true) {
      const { data: documents, error } = await db
        .from('documents')
        .select('id, storage_path')
        .eq('org_id', context.orgId)
        .eq('origin', 'dream')
        .order('id')
        .limit(100);
      if (error) throw new Error(`Dream output could not be read: ${error.message}`);
      if (!documents?.length) break;
      const paths = documents.flatMap((document) =>
        document.storage_path ? [document.storage_path] : [],
      );
      if (paths.length) {
        const { error: storageError } = await db.storage.from('documents').remove(paths);
        if (storageError)
          throw new Error(`Dream files could not be removed: ${storageError.message}`);
      }
      const { error: deleteError } = await db
        .from('documents')
        .delete()
        .eq('org_id', context.orgId)
        .eq('origin', 'dream')
        .in(
          'id',
          documents.map(({ id }) => id),
        );
      if (deleteError) throw new Error(`Dream output could not be removed: ${deleteError.message}`);
    }

    // Run deletion cascades to generated links; entity deletion cascades to mentions.
    for (const table of ['dream_runs', 'entities'] as const) {
      const { error } = await db.from(table).delete().eq('org_id', context.orgId);
      if (error) throw new Error(`Dream history could not be removed: ${error.message}`);
    }
    const { error: usageError } = await db
      .from('usage_events')
      .delete()
      .eq('org_id', context.orgId)
      .eq('kind', 'dream_run');
    if (usageError) throw new Error(`Dream usage could not be cleared: ${usageError.message}`);
    const { error: callsError } = await db
      .from('model_calls')
      .delete()
      .eq('org_id', context.orgId)
      .in('purpose', ['dream', 'extract']);
    if (callsError) throw new Error(`Dream activity could not be cleared: ${callsError.message}`);

    let offset = 0;
    while (true) {
      const { data: spaces, error } = await db
        .from('spaces')
        .select('id')
        .eq('org_id', context.orgId)
        .order('id')
        .range(offset, offset + 99);
      if (error) throw new Error(`Dream limits could not be read: ${error.message}`);
      const { error: limitsError } = await db
        .from('rate_limits')
        .delete()
        .in(
          'bucket',
          dreamRateLimitBuckets(
            context.userId,
            (spaces ?? []).map(({ id }) => id),
          ),
        );
      if (limitsError) throw new Error(`Dream limits could not be cleared: ${limitsError.message}`);
      if (!spaces || spaces.length < 100) break;
      offset += spaces.length;
    }
    const { error: freshenError } = await db.rpc('freshen_demo_corpus', {
      p_org_id: context.orgId,
    });
    if (freshenError)
      throw new Error(`Source timestamps could not be refreshed: ${freshenError.message}`);
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Dreams could not be reset.';
  } finally {
    if (resumeMode) {
      try {
        const { error } = await db.rpc('set_dream_execution_mode', { p_mode: resumeMode });
        if (error) throw error;
      } catch {
        failure = `${failure ? `${failure} ` : ''}Dream processing could not be restored to ${resumeMode}. Restore it before starting another dream.`;
      }
    }
    revalidatePath('/dreams', 'layout');
    revalidatePath('/admin', 'layout');
  }
  return failure ? errorState(failure) : successState(undefined);
}
