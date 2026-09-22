/** Real local OAuth authorization-code + PKCE flow, followed by MCP calls using only that token. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { releaseStackLock, takeStackLock } from '../tests/stack-lock.mjs';

const local = z
  .object({ API_URL: z.url(), SERVICE_ROLE_KEY: z.string(), ANON_KEY: z.string() })
  .parse(
    JSON.parse(
      execFileSync(process.env.SB_CLI ?? 'supabase-beta', ['status', '-o', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ),
  );
assert(['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname), 'Local fixtures only');
const root = process.cwd();
const held = takeStackLock(root, 'mcp-oauth');
if (held) throw new Error(`Local stack is in use by ${held.suite}`);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
const account = createClient(local.API_URL, local.ANON_KEY, options);
const users: string[] = [];
const orgs: string[] = [];
let clientId: string | undefined;
const endpoint = `${local.API_URL}/functions/v1/mcp-server`;
const redirectUri = 'http://127.0.0.1:49199/oauth/callback';
const record = z.record(z.string(), z.unknown());

async function fixture(label: string) {
  const email = `mcp-${label}-${randomUUID()}@magpi.test`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  users.push(created.data.user.id);
  const space = await admin
    .from('spaces')
    .select('id,org_id')
    .eq('owner_user_id', created.data.user.id)
    .single();
  if (space.error) throw space.error;
  orgs.push(space.data.org_id);
  const doc = await admin
    .from('documents')
    .insert({
      org_id: space.data.org_id,
      space_id: space.data.id,
      title: `OAuth ${label}`,
      origin: 'upload',
    })
    .select('id')
    .single();
  if (doc.error) throw doc.error;
  const chunks = await admin.from('chunks').insert({
    org_id: space.data.org_id,
    space_id: space.data.id,
    document_id: doc.data.id,
    ordinal: 0,
    content: `mcpverification ${label} document`,
    token_count: 5,
  });
  if (chunks.error) throw chunks.error;
  return {
    userId: created.data.user.id,
    email,
    password,
    spaceId: space.data.id,
    documentId: doc.data.id,
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).pathname}`);
  return record.parse(await response.json());
}

function toolValue(response: Record<string, unknown>): Record<string, unknown> {
  const result = record.parse(response.result);
  assert.notEqual(result.isError, true, 'MCP tool returned an error');
  const content = z
    .array(z.object({ type: z.string(), text: z.string().optional() }))
    .parse(result.content);
  return record.parse(JSON.parse(content.find((item) => item.type === 'text')?.text ?? '{}'));
}

try {
  const challenge = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) });
  assert.equal(challenge.status, 401);
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(
    challenge.headers.get('www-authenticate') ?? '',
  )?.[1];
  assert(metadataUrl, 'Missing OAuth resource metadata challenge');
  const resource = await fetchJson(metadataUrl);
  assert.equal(resource.resource, endpoint);
  const issuer = z.array(z.string()).parse(resource.authorization_servers)[0];
  const discovery = await fetchJson(`${issuer}/.well-known/oauth-authorization-server`);
  const register = z.string().parse(discovery.registration_endpoint);
  const dynamicClient = await fetchJson(register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Digital Brain OAuth smoke',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  clientId = z.string().parse(dynamicClient.client_id);
  const visible = await fixture('visible');
  const hidden = await fixture('hidden');
  const signedIn = await account.auth.signInWithPassword({
    email: visible.email,
    password: visible.password,
  });
  if (signedIn.error) throw signedIn.error;
  const verifier = randomBytes(48).toString('base64url');
  const state = randomUUID();
  const authorize = new URL(z.string().parse(discovery.authorization_endpoint));
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: endpoint,
  }).toString();
  const requested = await fetch(authorize, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  const consentUrl = requested.headers.get('location');
  assert(consentUrl, `Authorization did not redirect (${requested.status})`);
  const authorizationId = new URL(consentUrl, local.API_URL).searchParams.get('authorization_id');
  assert(authorizationId, 'Consent redirect has no authorization_id');
  const details = await account.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error) throw details.error;
  assert(details.data && 'client' in details.data);
  assert.equal(details.data.client.id, clientId);
  const consent = await account.auth.oauth.approveAuthorization(authorizationId, {
    skipBrowserRedirect: true,
  });
  if (consent.error) throw consent.error;
  const callback = new URL(consent.data.redirect_url);
  assert.equal(callback.origin + callback.pathname, redirectUri);
  assert.equal(callback.searchParams.get('state'), state);
  const code = callback.searchParams.get('code');
  assert(code, 'Authorization code missing');
  const token = await fetchJson(z.string().parse(discovery.token_endpoint), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: clientId,
      resource: endpoint,
    }),
  });
  const accessToken = z.string().parse(token.access_token);
  const claims = record.parse(
    JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()),
  );
  assert.equal(claims.client_id, clientId, 'Token must identify the external OAuth client');
  assert.equal(claims.sub, visible.userId);
  let sessionId: string | null = null;
  let requestId = 0;
  async function mcp(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
      signal: AbortSignal.timeout(60_000),
    });
    assert(response.ok, `MCP ${method} returned ${response.status}`);
    sessionId = response.headers.get('mcp-session-id') ?? sessionId;
    const text = await response.text();
    const payload = response.headers.get('content-type')?.includes('text/event-stream')
      ? text
          .split('\n')
          .find((line) => line.startsWith('data:'))
          ?.slice(5)
          .trim()
      : text;
    assert(payload, `MCP ${method} returned no result`);
    const parsed = record.parse(JSON.parse(payload));
    assert(!parsed.error, `MCP ${method} protocol error`);
    return parsed;
  }
  await mcp('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'magpi-oauth-smoke', version: '1.0.0' },
  });
  const listed = record.parse((await mcp('tools/list')).result);
  const toolNames = z
    .array(z.object({ name: z.string() }))
    .parse(listed.tools)
    .map((tool) => tool.name);
  assert(toolNames.includes('whoami') && toolNames.includes('search'));
  const identity = toolValue(await mcp('tools/call', { name: 'whoami', arguments: {} }));
  assert.equal(identity.client_id, clientId);
  assert.equal(identity.user_id, visible.userId);
  const found = toolValue(
    await mcp('tools/call', { name: 'search', arguments: { query: 'mcpverification', limit: 10 } }),
  );
  const hits = z.array(z.object({ document_id: z.string() })).parse(found.results);
  assert(
    hits.some((hit) => hit.document_id === visible.documentId),
    'Visible document missing',
  );
  assert(!hits.some((hit) => hit.document_id === hidden.documentId), 'Foreign document leaked');
  const filtered = toolValue(
    await mcp('tools/call', {
      name: 'search',
      arguments: { query: 'mcpverification', space_ids: [hidden.spaceId], limit: 10 },
    }),
  );
  assert.deepEqual(filtered.results, [], 'Explicit foreign-space filter must not bypass RLS');
  console.info(
    'OAuth MCP smoke passed: discovery, dynamic client, PKCE code exchange, client identity, initialize, tools/list, whoami, search and cross-organization RLS.',
  );
} finally {
  const errors: string[] = [];
  if (clientId) {
    const result = await admin.auth.admin.oauth.deleteClient(clientId);
    if (result.error) errors.push('OAuth client cleanup failed');
  }
  for (const orgId of orgs) {
    const result = await admin.from('organizations').delete().eq('id', orgId);
    if (result.error) errors.push('Organization cleanup failed');
  }
  for (const userId of users) {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error) errors.push('User cleanup failed');
  }
  await account.auth.signOut();
  releaseStackLock(root);
  if (errors.length) throw new Error(errors.join('; '));
}
