'use server';

import { revalidatePath } from 'next/cache';

import { resolveAdminAccess } from '@/lib/analytics/access';
import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { dreamRateLimitBuckets } from './rate-limit';

/** Removes generated Dream output for the current organization and leaves source content intact. */
export async function resetDemo(): Promise<ActionState<{ deleted: number }>> {
  const access = await resolveAdminAccess();
  if (access.kind === 'signed-out') return errorState('You need to sign in to do that.');
  if (access.kind === 'forbidden') return errorState('Only an owner or admin can reset the demo.');

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

  const storagePaths = (dreamDocuments ?? [])
    .map((document) => document.storage_path)
    .filter((path): path is string => Boolean(path));
  if (storagePaths.length > 0) {
    const { error } = await db.storage.from('documents').remove(storagePaths);
    if (error)
      return errorState(`The demo was reset, but generated files remain: ${error.message}`);
  }

  revalidatePath('/admin/demo');
  revalidatePath('/admin');
  revalidatePath('/dreams');
  revalidatePath('/dreams/entities');
  revalidatePath('/dreams/log');
  return successState({ deleted: dreamDocuments?.length ?? 0 });
}
