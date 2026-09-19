// Input validation at the Edge Function boundary. Schemas are strict: unknown keys are rejected.

import { z } from 'zod';

import { ApiError } from './errors.ts';

// Anchored, with no leading hyphen, so "../etc" and similar fragments cannot pass.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

const slug = z.string().regex(SLUG_RE).max(64);

export const connectionsBeginSchema = z.strictObject({
  provider: slug,
  // Where to send the browser after connecting. safeReturnTo decides if it is same-site.
  return_to: z.string().max(512).optional(),
});

// Bounded rather than pattern-matched, so a malformed ticket fails like an unknown one.
export const connectionsClaimSchema = z.strictObject({
  ticket: z.string().min(1).max(256),
});

/** The picker, both halves in one call. `routes` present saves where each unit lands, absent refreshes the list only. */
export const connectionsScopesSchema = z.strictObject({
  connection_id: z.uuid(),
  routes: z.record(z.string().min(1).max(200), z.uuid()).optional(),
});

export const connectionsSyncSchema = z.strictObject({
  connection_id: z.uuid(),
  /** Clears the cursor first, so the whole account is read again. */
  full: z.boolean().default(false),
});

export const ingestEnqueueSchema = z.strictObject({
  space_id: z.uuid(),
  /** Where the dropzone put the bytes. Read by the worker, never by the browser. */
  storage_path: z.string().min(1).max(1024),
  title: z.string().trim().min(1).max(300),
  mime_type: z.string().min(1).max(128),
});

/** A worker invocation. Bounded so one call cannot ask for unbounded work. */
export const workerBatchSchema = z.strictObject({
  org_id: z.uuid().optional(),
  batch: z.number().int().min(1).max(200).optional(),
  /** How many of that batch run at once. Bounded, so a provider is not flooded. */
  concurrency: z.number().int().min(1).max(32).optional(),
});

export const dreamRunSchema = z.strictObject({
  space_id: z.uuid(),
  kind: z.enum(['all', 'entities', 'digest', 'connections']).default('all'),
});

/** Throws a 400 ApiError carrying the issue list. */
export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new ApiError(400, 'invalid_request', 'request body failed validation', {
    detail: {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  });
}

/** Whether an uploaded object is keyed under the named space. The worker reads it bypassing RLS. */
export function isUploadInSpace(storagePath: string, spaceId: string): boolean {
  if (storagePath.includes('..') || storagePath.startsWith('/')) return false;
  return storagePath.startsWith(`${spaceId}/`) && storagePath.length > spaceId.length + 1;
}

/** A provider slug becomes part of an upstream URL, so "../" must not survive. */
export function isValidSlug(value: string): boolean {
  return value.length <= 64 && SLUG_RE.test(value);
}

/** The rows the two single-use RPCs hand back. Both carry a secret out of the database. */
const pendingConnectionRowSchema = z.object({
  user_id: z.uuid(),
  provider: slug,
  external_account_id: z.string().nullish(),
  access_token_enc: z.string().min(1),
  refresh_token_enc: z.string().nullish(),
  scopes: z.array(z.string()).nullish(),
  token_expires_at: z.string().nullish(),
  return_to: z.string().nullish(),
});

const oauthStateRowSchema = z.object({
  user_id: z.uuid(),
  provider: slug,
  code_verifier: z.string().min(1),
  return_to: z.string().nullish(),
});

export type PendingConnectionRow = z.infer<typeof pendingConnectionRowSchema>;
export type OAuthStateRow = z.infer<typeof oauthStateRowSchema>;

/** The single row a consuming RPC returns, or null when it consumed nothing. Malformed raises. */
function parseConsumedRow<T>(schema: z.ZodType<T>, data: unknown, what: string): T | null {
  const row = Array.isArray(data) ? data[0] : null;
  if (row === null || row === undefined) return null;

  const parsed = schema.safeParse(row);
  if (!parsed.success) {
    throw new ApiError(500, 'internal', `${what} returned a row this function cannot read`);
  }
  return parsed.data;
}

export function parsePendingConnectionRow(data: unknown): PendingConnectionRow | null {
  return parseConsumedRow(pendingConnectionRowSchema, data, 'consume_pending_connection');
}

export function parseOAuthStateRow(data: unknown): OAuthStateRow | null {
  return parseConsumedRow(oauthStateRowSchema, data, 'consume_oauth_state');
}
