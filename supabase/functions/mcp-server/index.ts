// Magpi's MCP server: the Supabase Library's MCP Server block with five tools on it, composed as
// the block is:
//
//   withOAuthProtectedResource  OAuth discovery for external clients. Runs before the auth gate
//                               so a client with no token yet can read the metadata, and adds
//                               the WWW-Authenticate challenge to the gate's 401.
//   withSupabase                Verifies the user access token and builds an RLS-scoped client,
//                               so an embedded agent and an external OAuth client both act as
//                               the signed-in person.
//   handleMcp                   MCP transport and the tools in ./tools/index.ts.

import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { pipeline } from '@supabase/middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type SupabaseContext, withOAuthProtectedResource, withSupabase } from '@supabase/server';

import { serviceClient } from '../_shared/db.ts';
import { liveHttp } from '../_shared/deps.ts';
import { denoEnv } from '../_shared/env.ts';
import { modelRunnerFromEnv } from '../_shared/jobs/runtime.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';
import { registerTools, type ToolContext } from './tools/index.ts';
import type { NoteStore } from './tools/types.ts';

function readTextEnv(name: string, fallback: string): string {
  return Deno.env.get(name)?.trim() || fallback;
}

/** The block reads both from env. Magpi's defaults keep the name short and the description its own. */
const SERVER_NAME = readTextEnv('MCP_SERVER_NAME', 'magpi');
const SERVER_VERSION = '1.0.0';
const SERVER_DESCRIPTION = readTextEnv(
  'MCP_SERVER_DESCRIPTION',
  'Magpi is one searchable index over the documents this person has connected: their notes, ' +
    'their issue tracker, their files.',
);

const INSTRUCTIONS = `${SERVER_DESCRIPTION} ` +
  'Every tool runs as the signed-in user, so row level security decides what each one can ' +
  'see. Prefer search over guessing, and read a document in full with get_document when a ' +
  'passage is not enough.';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
};

/** The bucket the ingest job reads an uploaded document's bytes back out of. */
const UPLOAD_BUCKET = 'documents';

function storageNotes(admin: SupabaseClient): NoteStore {
  return {
    async write(storagePath, text) {
      const { error } = await admin.storage
        .from(UPLOAD_BUCKET)
        .upload(storagePath, new Blob([text], { type: 'text/markdown' }), {
          contentType: 'text/markdown',
          upsert: true,
        });
      if (error) throw new Error(`the note could not be stored: ${error.message}`);
    },
  };
}

/** One organization per account, so the caller's org is a lookup rather than a choice. */
async function orgOf(ctx: SupabaseContext, userId: string): Promise<string> {
  const { data, error } = await ctx.supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle<{ org_id: string }>();
  if (error || !data) throw new Error('this account belongs to no organization');
  return data.org_id;
}

async function handleMcp(request: Request, ctx: SupabaseContext): Promise<Response> {
  // auth: 'user' guarantees both claim shapes before this handler runs.
  const userClaims = ctx.userClaims!;

  // The middleware builds its own admin client from its own supabase-js. Ours is the one the
  // shared helpers take, and the one the model runner logs through.
  const admin = serviceClient(denoEnv);
  await enforceRateLimits(admin, [
    { bucket: `mcp:user:${userClaims.id}`, limit: 120, windowSeconds: 600 },
  ]);

  const context: ToolContext = {
    // @supabase/server carries its own copy of supabase-js, so the two client types are the same
    // shape from two packages. The tools read this one untyped, as every other function here does.
    supabase: ctx.supabase as unknown as SupabaseClient,
    admin,
    userClaims,
    jwtClaims: ctx.jwtClaims!,
    models: modelRunnerFromEnv(admin, liveHttp.fetch, () => new Date(), denoEnv),
    notes: storageNotes(admin),
    orgId: await orgOf(ctx, userClaims.id),
  };

  // The server and its tools are bound to this caller for exactly one request.
  const handler = createMcpHandler(
    () => {
      const server = new McpServer(
        { name: SERVER_NAME, version: SERVER_VERSION },
        { instructions: INSTRUCTIONS },
      );
      registerTools(server, context);
      return server;
    },
    { onerror: (error) => console.error('MCP request failed', error) },
  );

  return await handler.fetch(request);
}

// The handler is passed inline so TypeScript infers its context from the entries.
Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user', cors: { headers: CORS_HEADERS } })],
    (request, ctx) => handleMcp(request, ctx),
  ),
);
