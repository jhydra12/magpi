'use server';

import { z } from 'zod';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { withSession } from '@/lib/actions/with-session';
import { requestDreamRun, type DreamRunOutcome } from '@/lib/dreams/edge';
import { setSpaceDreaming as writeSpaceDreaming } from '@/lib/spaces/dreaming';

const DREAMS_PATH = '/dreams';

const idSchema = z.uuid();
const kindSchema = z.enum(['entities', 'digest', 'connections', 'all']);

/** Queue a manual Dream run after checking access and the per-space setting. */
export async function startDreamRun(
  spaceId: string,
  kind: 'entities' | 'digest' | 'connections' | 'all' = 'all',
): Promise<ActionState<DreamRunOutcome>> {
  const input = z.object({ spaceId: idSchema, kind: kindSchema }).safeParse({ spaceId, kind });
  if (!input.success) return errorState('Choose a space and a kind of run.');

  return withSession(async (context) => {
    const { data: space } = await context.supabase
      .from('spaces')
      .select('id, dreaming_enabled')
      .eq('id', input.data.spaceId)
      .maybeSingle();
    if (!space) return errorState('You are not in that space.');
    if (!space.dreaming_enabled) {
      return errorState('Dreaming is switched off for this space. Turn it on first.');
    }

    const result = await requestDreamRun(context.supabase, {
      spaceId: input.data.spaceId,
      kind: input.data.kind,
    });
    return result.ok ? successState(result.data) : errorState(result.error);
  }, DREAMS_PATH);
}

export async function setSpaceDreaming(
  spaceId: string,
  enabled: boolean,
): Promise<ActionState<undefined>> {
  const input = z
    .object({ spaceId: idSchema, enabled: z.boolean() })
    .safeParse({ spaceId, enabled });
  if (!input.success) return errorState('That is not a space.');

  return withSession(async (context) => {
    const result = await writeSpaceDreaming(
      context.supabase,
      input.data.spaceId,
      input.data.enabled,
    );
    if (!result.ok) return errorState(result.error);
    return successState(undefined);
  }, DREAMS_PATH);
}

async function decideDreamLink(
  linkId: string,
  decision: { confirmed_at: string | null; dismissed_at: string | null },
  refusal: string,
): Promise<ActionState<undefined>> {
  const input = idSchema.safeParse(linkId);
  if (!input.success) return errorState('That is not a candidate link.');

  return withSession(async (context) => {
    const { error } = await context.supabase
      .from('dream_links')
      .update(decision)
      .eq('id', input.data);
    if (error) return errorState(refusal);
    return successState(undefined);
  }, DREAMS_PATH);
}

export async function confirmDreamLink(linkId: string): Promise<ActionState<undefined>> {
  return decideDreamLink(
    linkId,
    { confirmed_at: new Date().toISOString(), dismissed_at: null },
    'That link could not be confirmed.',
  );
}

export async function dismissDreamLink(linkId: string): Promise<ActionState<undefined>> {
  return decideDreamLink(
    linkId,
    { confirmed_at: null, dismissed_at: new Date().toISOString() },
    'That link could not be dismissed.',
  );
}

/** Deletes a dream output; documents_delete_dream narrows this to origin = 'dream'. */
export async function deleteDreamOutput(documentId: string): Promise<ActionState<undefined>> {
  const input = idSchema.safeParse(documentId);
  if (!input.success) return errorState('That is not a document.');

  return withSession(async (context) => {
    const { data, error } = await context.supabase
      .from('documents')
      .delete()
      .eq('id', input.data)
      .select('id');
    if (error) return errorState('That document could not be deleted.');
    if (!data || data.length === 0) {
      return errorState('Only a document a dream wrote can be deleted here.');
    }
    return successState(undefined);
  }, DREAMS_PATH);
}
