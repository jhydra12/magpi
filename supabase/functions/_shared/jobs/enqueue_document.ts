import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ApiError } from '../errors.ts';

const queuedSchema = z.object({ document_id: z.uuid(), ingest_job_id: z.uuid() });

/** Creates a document and its ingest job together; stable source identities make retries safe. */
export async function enqueueDocument(
  db: SupabaseClient,
  document: Record<string, unknown>,
  force = false,
): Promise<z.infer<typeof queuedSchema>> {
  const { data, error } = await db.rpc('enqueue_document', {
    p_document: document,
    p_force: force,
  }).single<unknown>();
  const parsed = queuedSchema.safeParse(data);
  if (error || !parsed.success) {
    throw new ApiError(500, 'enqueue_failed', 'the document could not be queued');
  }
  return parsed.data;
}
