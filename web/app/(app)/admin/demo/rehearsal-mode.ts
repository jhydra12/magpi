'use server';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { resolveAdminAccess } from '@/lib/analytics/access';

export interface RehearsalMode {
  enabled: boolean;
  /** True when SB_MODEL_REHEARSAL is set, which decides for the workers whatever is stored here. */
  isForcedByEnv: boolean;
}

/** SB_MODEL_REHEARSAL as the workers read it: set means it decides, unset means the toggle does. */
function envOverride(): boolean | null {
  const raw = process.env.SB_MODEL_REHEARSAL?.trim().toLowerCase();
  if (!raw) return null;
  return raw === '1' || raw === 'true';
}

export async function readRehearsalMode(): Promise<ActionState<RehearsalMode>> {
  const access = await resolveAdminAccess();
  if (access.kind !== 'granted') return errorState('Only an owner or admin can read this.');

  const { data, error } = await access.elevated.rpc('model_rehearsal_enabled');
  if (error) return errorState('Rehearsal mode could not be read.');

  const forced = envOverride();
  // What the workers will actually do, so the switch never claims a state they will not honour.
  return successState({ enabled: forced ?? data === true, isForcedByEnv: forced !== null });
}

export async function setRehearsalMode(enabled: boolean): Promise<ActionState<RehearsalMode>> {
  const access = await resolveAdminAccess();
  if (access.kind === 'signed-out') return errorState('You need to sign in to do that.');
  if (access.kind !== 'granted') return errorState('Only an owner or admin can change this.');

  const forced = envOverride();
  if (forced !== null) {
    return errorState(
      `SB_MODEL_REHEARSAL is set on the server, so rehearsal mode is fixed ${forced ? 'on' : 'off'}.`,
    );
  }

  const { data, error } = await access.elevated.rpc('set_model_rehearsal', { p_enabled: enabled });
  if (error) return errorState('Rehearsal mode could not be changed.');
  return successState({ enabled: data === true, isForcedByEnv: false });
}
