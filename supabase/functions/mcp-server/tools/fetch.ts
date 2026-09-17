// ChatGPT's connector contract names two tools, search and fetch. This is get_document under the
// name and shape ChatGPT looks for, so the same server works there without a second one.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { readDocument } from './get_document.ts';
import { jsonResult } from './result.ts';
import type { ToolContext } from './types.ts';

const inputSchema = z.object({
  id: z.string().uuid().describe('The document id, as returned by search.'),
});

export type FetchInput = z.infer<typeof inputSchema>;

export interface FetchedDocument {
  id: string;
  title: string;
  text: string;
  url: string | null;
  metadata: { space_id: string; origin: string; mime_type: string | null; updated_at: string };
}

export async function fetchDocument(ctx: ToolContext, input: FetchInput): Promise<FetchedDocument> {
  const document = await readDocument(ctx, { document_id: input.id });
  return {
    id: document.document_id,
    title: document.title,
    text: document.content,
    url: document.url,
    metadata: {
      space_id: document.space_id,
      origin: document.origin,
      mime_type: document.mime_type,
      updated_at: document.updated_at,
    },
  };
}

export function registerFetchTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'fetch',
    {
      description: 'Return the full text of one document by id. The same read as get_document.',
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(await fetchDocument(ctx, input)),
  );
}
