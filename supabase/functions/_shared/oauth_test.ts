import { assert, assertEquals } from '@std/assert';

import type { HttpDeps } from './deps.ts';
import { callbackUrl, createPkce, oauthDriverFor, safeReturnTo } from './oauth.ts';
import type { ProviderRecord } from './providers.ts';
import { asyncApiErrorFrom, envSource } from './testing/assertions.ts';

function record(slug: string, overrides: Partial<ProviderRecord> = {}): ProviderRecord {
  return {
    slug,
    display_name: slug,
    description: '',
    kind: 'oauth',
    auth_url: `https://${slug}.example/authorize`,
    token_url: `https://${slug}.example/token`,
    scopes: ['read', 'write'],
    docs_url: null,
    enabled: true,
    position: 0,
    scope_selection_kind: null,
    ...overrides,
  };
}

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function answering(payload: unknown, status = 200): HttpDeps & { calls: Captured[] } {
  const calls: Captured[] = [];
  return {
    calls,
    fetch: (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(input),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: String(init?.body ?? ''),
      });
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  };
}

const AUTH_INPUT = {
  clientId: 'client-id',
  redirectUri: 'https://fx.example/connections-callback',
  state: 'state-value',
  codeChallenge: 'challenge',
};

Deno.test('the pkce verifier stays server side and the challenge is its digest', async () => {
  const { verifier, challengePromise } = createPkce();
  const challenge = await challengePromise;
  assert(verifier.length >= 32);
  assert(challenge !== verifier);
});

Deno.test('the authorize url carries pkce, the state and the registry scopes', () => {
  const url = new URL(oauthDriverFor(record('linear')).buildAuthUrl(AUTH_INPUT));
  assertEquals(url.searchParams.get('code_challenge_method'), 'S256');
  assertEquals(url.searchParams.get('state'), 'state-value');
  assertEquals(url.searchParams.get('response_type'), 'code');
  // Linear wants commas where everyone else wants a space.
  assertEquals(url.searchParams.get('scope'), 'read,write');
});

Deno.test('google asks for offline access so a refresh token arrives every time', () => {
  const url = new URL(oauthDriverFor(record('google_drive')).buildAuthUrl(AUTH_INPUT));
  assertEquals(url.searchParams.get('access_type'), 'offline');
  assertEquals(url.searchParams.get('prompt'), 'consent');
});

Deno.test('slack buys a user token, not a bot token', () => {
  const url = new URL(oauthDriverFor(record('slack')).buildAuthUrl(AUTH_INPUT));
  assertEquals(url.searchParams.get('user_scope'), 'read write');
  assertEquals(url.searchParams.get('scope'), null);
});

Deno.test('notion asks for no scopes and says who is installing', () => {
  const url = new URL(
    oauthDriverFor(record('notion', { scopes: [] })).buildAuthUrl(AUTH_INPUT),
  );
  assertEquals(url.searchParams.get('owner'), 'user');
  assertEquals(url.searchParams.get('scope'), null);
});

Deno.test('a code exchange returns the token set and the account label', async () => {
  const deps = answering({
    access_token: 'at_1',
    refresh_token: 'rt_1',
    expires_in: 3600,
    scope: 'read write',
    workspace_name: 'Digital Brain HQ',
  });
  const tokens = await oauthDriverFor(record('notion'), deps).exchangeCode({
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: AUTH_INPUT.redirectUri,
    code: 'auth-code',
    codeVerifier: 'verifier',
  });

  assertEquals(tokens.accessToken, 'at_1');
  assertEquals(tokens.refreshToken, 'rt_1');
  assertEquals(tokens.scopes, ['read', 'write']);
  assertEquals(tokens.externalAccountId, 'Digital Brain HQ');
  assert(tokens.expiresAt !== null);
});

Deno.test('notion sends its credentials as basic auth, never in the form', async () => {
  const deps = answering({ access_token: 'at_1' });
  await oauthDriverFor(record('notion'), deps).exchangeCode({
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: AUTH_INPUT.redirectUri,
    code: 'auth-code',
    codeVerifier: 'verifier',
  });
  assertEquals(deps.calls[0].headers.authorization, `Basic ${btoa('id:secret')}`);
  assert(!deps.calls[0].body.includes('client_secret'));
});

Deno.test('slack lifts the user token out of authed_user', async () => {
  const deps = answering({
    ok: true,
    access_token: 'bot-token',
    team: { name: 'Digital Brain' },
    authed_user: { access_token: 'user-token', scope: 'search:read' },
  });
  const tokens = await oauthDriverFor(record('slack'), deps).exchangeCode({
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: AUTH_INPUT.redirectUri,
    code: 'auth-code',
    codeVerifier: 'verifier',
  });
  assertEquals(tokens.accessToken, 'user-token');
  assertEquals(tokens.externalAccountId, 'Digital Brain');
});

Deno.test('a provider signalling failure with a 200 and an error field still fails', async () => {
  const deps = answering({ error: 'invalid_grant' });
  const err = await asyncApiErrorFrom(() =>
    oauthDriverFor(record('linear'), deps).exchangeCode({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: AUTH_INPUT.redirectUri,
      code: 'auth-code',
      codeVerifier: 'verifier',
    })
  );
  assertEquals(err.status, 502);
});

Deno.test("the provider's own error text never reaches the response", async () => {
  const deps = answering({ error: 'invalid_grant', error_description: 'code sk_live_abc reused' });
  const err = await asyncApiErrorFrom(() =>
    oauthDriverFor(record('linear'), deps).exchangeCode({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: AUTH_INPUT.redirectUri,
      code: 'auth-code',
      codeVerifier: 'verifier',
    })
  );
  assert(!err.message.includes('sk_live_abc'));
});

Deno.test('the callback url is the public functions origin', () => {
  assertEquals(
    callbackUrl(envSource({ SB_FUNCTIONS_BASE_URL: 'https://fx.example' })),
    'https://fx.example/connections-callback',
  );
});

Deno.test('a return path must be same-site and absolute', () => {
  assertEquals(safeReturnTo('/connections'), '/connections');
  assertEquals(safeReturnTo('//evil.example'), null);
  assertEquals(safeReturnTo('https://evil.example'), null);
  assertEquals(safeReturnTo('/a\\b'), null);
  assertEquals(safeReturnTo(null), null);
});
