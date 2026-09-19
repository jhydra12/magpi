'use server';

import { z } from 'zod';

import { databaseErrorState } from '@/lib/actions/database-error';
import { errorState, successState, type ActionState } from '@/lib/actions/state';
import { ACCEPTED_MIME_TYPES, storagePathFor } from '@/lib/documents/uploads';
import { withSession } from '@/lib/actions/with-session';
import { createServiceClient } from '@/lib/supabase/service';

const enqueueSchema = z.object({
  spaceId: z.uuid(),
  // A name inside the space's own folder, not a path. A slash is refused, not stripped.
  objectName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((name) => !name.includes('/'), 'the object name is a name, not a path'),
  title: z.string().trim().min(1).max(500),
  mimeType: z.enum(ACCEPTED_MIME_TYPES),
});

/** Records an uploaded object as a document and queues it. The plan check runs in the database. */
export async function enqueueUploadedDocument(
  input: z.input<typeof enqueueSchema>,
): Promise<ActionState<{ documentId: string }>> {
  return withSession(async ({ supabase, orgId, userId }) => {
    const parsed = enqueueSchema.safeParse(input);
    if (!parsed.success) return errorState('That upload could not be recorded.');

    const { spaceId, objectName, title, mimeType } = parsed.data;

    // The caller's own client, so RLS proves they are in this space first.
    const { data: space } = await supabase
      .from('spaces')
      .select('id')
      .eq('id', spaceId)
      .maybeSingle();
    if (!space) return errorState('You are not in that space.');

    const { data: allowance, error: allowanceError } = await supabase
      .rpc('check_ingest_allowed', { p_org_id: orgId })
      .single();

    if (allowanceError) {
      return databaseErrorState('checking the ingest allowance', allowanceError, {
        fallback: 'That upload could not be recorded.',
      });
    }
    if (!allowance.allowed) return errorState(allowance.reason ?? 'This plan is full.');

    const { data, error } = await createServiceClient()
      .rpc('enqueue_document', {
        p_document: {
          org_id: orgId,
          space_id: spaceId,
          title,
          mime_type: mimeType,
          storage_path: storagePathFor(spaceId, objectName),
          origin: 'upload',
          created_by: userId,
        },
      })
      .single();
    if (error) {
      return databaseErrorState('queuing an uploaded document', error, {
        fallback: 'That upload could not be queued. Try again.',
      });
    }
    return successState({ documentId: data.document_id });
  }, '/documents');
}

const deleteSchema = z.object({ documentId: z.uuid() });

/** Only a dream output is deletable from the UI, and deleting it leaves its sources alone. */
export async function deleteDreamDocument(formData: FormData): Promise<ActionState<undefined>> {
  return withSession(async ({ supabase }) => {
    const parsed = deleteSchema.safeParse({ documentId: formData.get('documentId') });
    if (!parsed.success) return errorState('That document could not be deleted.');

    const { error } = await supabase.from('documents').delete().eq('id', parsed.data.documentId);
    if (error) {
      return databaseErrorState('deleting a dream document', error, {
        fallback: 'That document could not be deleted.',
      });
    }

    return successState(undefined);
  }, '/documents');
}
