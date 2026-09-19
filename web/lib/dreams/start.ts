import 'server-only';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';

import { requestDreamRun, type DreamRunOutcome } from './edge';
import type { DreamKind } from './status';

/** Validate space access before submitting real worker tasks. */
export async function startDream(
  context: SessionContext,
  input: { spaceId: string; kind: DreamKind | 'all' },
): Promise<ActionState<DreamRunOutcome>> {
  const { data: space } = await context.supabase
    .from('spaces')
    .select('id, dreaming_enabled')
    .eq('id', input.spaceId)
    .maybeSingle();
  if (!space) return errorState('You are not in that space.');
  if (!space.dreaming_enabled) {
    return errorState('Dreaming is switched off for this space. Turn it on first.');
  }

  const result = await requestDreamRun(context.supabase, {
    spaceId: input.spaceId,
    kind: input.kind,
  });
  return result.ok ? successState(result.data) : errorState(result.error);
}
