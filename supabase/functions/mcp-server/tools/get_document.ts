// Fetches one document in full, for when a search result is not enough context.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { jsonResult, ToolError } from './result.ts';
import type { ToolContext } from './types.ts';

const inputSchema = z.object({
  document_id: z.string().uuid().describe('The document to read, as returned by search.'),
});

export type GetDocumentInput = z.infer<typeof inputSchema>;

export interface FullDocument {
  document_id: string;
  space_id: string;
  title: string;
  url: string | null;
  origin: string;
  mime_type: string | null;
  updated_at: string;
  content: string;
  chunk_count: number;
}

interface DocumentRow {
  id: string;
  space_id: string;
  title: string;
  url: string | null;
  origin: string;
  mime_type: string | null;
  updated_at: string;
}

export async function readDocument(
  ctx: ToolContext,
  input: GetDocumentInput,
): Promise<FullDocument> {
  const { data, error } = await ctx.supabase
    .from('documents')
    .select('id, space_id, title, url, origin, mime_type, updated_at')
    .eq('id', input.document_id)
    .maybeSingle<DocumentRow>();
  if (error) throw new ToolError(`the document could not be read: ${error.message}`);
  // A document nobody may see and a document that never existed answer the same way.
  if (!data) throw new ToolError(`no document ${input.document_id}`);

  const { data: chunks, error: chunkError } = await ctx.supabase
    .from('chunks')
    .select('content')
    .eq('document_id', input.document_id)
    .order('ordinal', { ascending: true })
    .returns<{ content: string }[]>();
  if (chunkError) throw new ToolError(`the document text could not be read: ${chunkError.message}`);

  const pieces = chunks ?? [];
  return {
    document_id: data.id,
    space_id: data.space_id,
    title: data.title,
    url: data.url,
    origin: data.origin,
    mime_type: data.mime_type,
    updated_at: data.updated_at,
    // The text Digital Brain indexed, in order, rather than the original file bytes.
    content: pieces.map((chunk) => chunk.content).join('\n\n'),
    chunk_count: pieces.length,
  };
}

export function registerGetDocumentTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_document',
    {
      description: 'Return the full text and metadata of one document.',
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(await readDocument(ctx, input)),
  );
}
