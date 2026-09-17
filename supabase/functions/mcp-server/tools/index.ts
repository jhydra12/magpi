// The one composition point. Adding a tool is one import and one call.

import type { McpServer } from '@modelcontextprotocol/server';

import { registerAddNoteTool } from './add_note.ts';
import { registerFetchTool } from './fetch.ts';
import { registerGetDocumentTool } from './get_document.ts';
import { registerListSpacesTool } from './list_spaces.ts';
import { registerSearchTool } from './search.ts';
import { registerWhoamiTool } from './whoami.ts';
import type { ToolContext } from './types.ts';

export type { ToolContext } from './types.ts';

export function registerTools(server: McpServer, context: ToolContext): void {
  registerWhoamiTool(server, context);
  registerSearchTool(server, context);
  registerGetDocumentTool(server, context);
  registerFetchTool(server, context);
  registerListSpacesTool(server, context);
  registerAddNoteTool(server, context);
}
