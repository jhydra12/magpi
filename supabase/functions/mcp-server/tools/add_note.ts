// The one write. Puts text into a space as a document, so an agent can file what it worked out.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { sha256Hex } from '../../_shared/crypto.ts';
import { enqueueDocument } from '../../_shared/jobs/enqueue_document.ts';

import { jsonResult, ToolError } from './result.ts';
import type { ToolContext } from './types.ts';

const inputSchema = z.object({
  space_id: z.string().uuid().describe('The space to write into. Must be one the caller is in.'),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(100_000),
});

export type AddNoteInput = z.infer<typeof inputSchema>;

export interface FiledNote {
  document_id: string;
  space_id: string;
  ingest_job_id: string;
  status: 'queued';
}

/**
 * Every other tool leans on row level security alone. This one cannot: documents and chunks carry
 * select policies and no insert policy, so the write runs as the service role. The membership
 * check is therefore explicit, made through the caller's own client, before the role changes.
 */
async function requireMembership(ctx: ToolContext, spaceId: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .rpc('is_space_member', { p_space_id: spaceId })
    .returns<unknown>();
  if (error) throw new ToolError(`that space could not be checked: ${error.message}`);
  // The caller named a space and expects an effect, so this one says no rather than narrowing.
  if (data !== true) throw new ToolError(`you are not a member of space ${spaceId}`);
}

async function requireIngestAllowance(ctx: ToolContext): Promise<void> {
  const { data, error } = await ctx.supabase
    .rpc('check_ingest_allowed', { p_org_id: ctx.orgId })
    .maybeSingle<{ allowed: boolean; reason: string }>();
  if (error) throw new ToolError(`the plan could not be checked: ${error.message}`);
  if (data && !data.allowed) throw new ToolError(data.reason);
}

export async function addNote(ctx: ToolContext, input: AddNoteInput): Promise<FiledNote> {
  await requireMembership(ctx, input.space_id);
  await requireIngestAllowance(ctx);

  // A note is an upload with no file picker: the text goes to storage and the ingest job reads
  // it back the way it reads any other upload. The space leads the path, which is what the
  // storage policy reads.
  const storagePath = `${input.space_id}/notes/${await sha256Hex(
    `${ctx.userClaims.id}:${input.title}:${input.content}`,
  )}.md`;
  await ctx.notes.write(storagePath, input.content);

  const queued = await enqueueDocument(ctx.admin, {
    org_id: ctx.orgId,
    space_id: input.space_id,
    title: input.title,
    origin: 'upload',
    mime_type: 'text/markdown',
    storage_path: storagePath,
    created_by: ctx.userClaims.id,
  });
  // Keep successfully uploaded bytes on an ambiguous database failure: retry uses this same path.
  return { ...queued, space_id: input.space_id, status: 'queued' };
}

export function registerAddNoteTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'add_note',
    {
      description:
        'Write a note into one space as a document. The note is chunked, embedded and searchable ' +
        'like any other document.',
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(await addNote(ctx, input)),
  );
}
