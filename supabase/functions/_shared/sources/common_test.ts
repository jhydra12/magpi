import { assert, assertEquals, assertRejects } from '@std/assert';

import { fixedClock } from '../deps.ts';
import type { SourceDeps } from './contract.ts';
import { SourceError } from './contract.ts';
import {
  asRecord,
  isoStamp,
  refreshWithTokenEndpoint,
  requestJson,
  retryAfterOf,
} from './common.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');

function deps(answer: () => Response | Promise<Response>): SourceDeps {
  return { fetch: () => Promise.resolve(answer()), now: fixedClock(NOW).now };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const OPTIONS = { reconnectMessage: 'reconnect it', failureMessage: 'try again later' };

Deno.test('a defensive read of a non-object answers empty rather than throwing', () => {
  assertEquals(asRecord(null), {});
  assertEquals(asRecord([1, 2]), {});
  assertEquals(asRecord({ a: 1 }), { a: 1 });
});

Deno.test('a refused credential asks for a reconnect', async () => {
  for (const status of [401, 403]) {
    try {
      await requestJson('notion', deps(() => json({}, status)), 'https://x.example', OPTIONS);
      throw new Error(`${status} did not raise`);
    } catch (err) {
      assert(err instanceof SourceError);
      assertEquals(err.needsReconnect, true);
    }
  }
});

Deno.test('a server fault does not ask for a needless reconnect', async () => {
  try {
    await requestJson('notion', deps(() => json({}, 500)), 'https://x.example', OPTIONS);
    throw new Error('did not raise');
  } catch (err) {
    assert(err instanceof SourceError);
    assertEquals(err.needsReconnect, false);
  }
});

Deno.test('malformed JSON is a retryable source failure', async () => {
  const error = await assertRejects(() =>
    requestJson(
      'notion',
      deps(() => new Response('<html>maintenance</html>', { status: 200 })),
      'https://x.example',
      OPTIONS,
    ), SourceError);
  assertEquals(error.needsReconnect, false);
});

Deno.test('a successful refresh carries an expiry measured from the injected clock', async () => {
  const outcome = await refreshWithTokenEndpoint(
    'google_drive',
    'Google Drive',
    deps(() => json({ access_token: 'at_2', expires_in: 3600 })),
    {
      refreshToken: 'rt_1',
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
  );

  assertEquals(outcome.kind, 'refreshed');
  if (outcome.kind !== 'refreshed') return;
  assertEquals(outcome.accessToken, 'at_2');
  // The provider did not rotate it, so the stored one stands.
  assertEquals(outcome.refreshToken, 'rt_1');
  assertEquals(outcome.expiresAt, '2026-09-09T13:00:00.000Z');
});

Deno.test('a refused refresh is a value, not a thrown error', async () => {
  const outcome = await refreshWithTokenEndpoint(
    'google_drive',
    'Google Drive',
    deps(() => json({ error: 'invalid_grant' }, 400)),
    {
      refreshToken: 'rt_1',
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
  );
  assertEquals(outcome.kind, 'failed');
  if (outcome.kind !== 'failed') return;
  assert(outcome.detail.includes('reconnect'));
});

Deno.test('an unreachable token endpoint is a failure the user can read', async () => {
  const outcome = await refreshWithTokenEndpoint(
    'google_drive',
    'Google Drive',
    { fetch: () => Promise.reject(new Error('econnrefused')), now: fixedClock(NOW).now },
    {
      refreshToken: 'rt_1',
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
  );
  assertEquals(outcome.kind, 'failed');
});

Deno.test('an unparseable timestamp falls back to the injected clock', () => {
  const d = deps(() => json({}));
  assertEquals(isoStamp('not a date', d), NOW.toISOString());
  assertEquals(isoStamp('2026-01-02T03:04:05Z', d), '2026-01-02T03:04:05.000Z');
});

/** The refresh grant and the code exchange are one request, so both quirks are pinned here. */

function capturing(payload: unknown, status = 200): SourceDeps & { calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  return {
    now: fixedClock(NOW).now,
    fetch: (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return Promise.resolve(json(payload, status));
    },
    calls,
  };
}

const GRANT = {
  refreshToken: 'rt_1',
  clientId: 'id',
  clientSecret: 'secret',
  tokenUrl: 'https://provider.example/token',
};

Deno.test('a provider that refuses credentials in the form is sent them in a header', async () => {
  // Notion answers 401 to a form carrying the secret.
  const http = capturing({ access_token: 'at_2' });
  await refreshWithTokenEndpoint('notion', 'Notion', http, GRANT);

  const headers = new Headers(http.calls[0].headers);
  assertEquals(headers.get('authorization'), `Basic ${btoa('id:secret')}`);
  assert(!String(http.calls[0].body).includes('client_secret'));
});

Deno.test('a provider that sends credentials in the form gets no header', async () => {
  const http = capturing({ access_token: 'at_2' });
  await refreshWithTokenEndpoint('google_drive', 'Google Drive', http, GRANT);

  assertEquals(new Headers(http.calls[0].headers).get('authorization'), null);
  assert(String(http.calls[0].body).includes('client_secret=secret'));
});

Deno.test('a renewed token nested in an envelope is lifted out, not read past', async () => {
  // Slack puts a bot token at the top level and the person's token underneath.
  const outcome = await refreshWithTokenEndpoint(
    'slack',
    'Slack',
    capturing({
      ok: true,
      access_token: 'bot-token',
      authed_user: { access_token: 'user-token', expires_in: 3600 },
    }),
    GRANT,
  );

  assertEquals(outcome.kind, 'refreshed');
  if (outcome.kind !== 'refreshed') return;
  assertEquals(outcome.accessToken, 'user-token');
});

Deno.test('the log names a provider by its slug and the user by its display name', async () => {
  // status_detail is read by a person; the log line is grepped by slug.
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  let outcome;
  try {
    outcome = await refreshWithTokenEndpoint(
      'google_drive',
      'Google Drive',
      capturing({ error: 'invalid_grant' }, 400),
      GRANT,
    );
  } finally {
    console.error = original;
  }

  assertEquals(logged[0][1], { provider: 'google_drive', status: 400 });
  assertEquals(outcome.kind, 'failed');
  if (outcome.kind !== 'failed') return;
  assert(outcome.detail.includes('Google Drive'));
  assert(!outcome.detail.includes('google_drive'));
});

/** A response carrying only the headers a rate limit is recognised by. */
function throttled(status: number, headers: Record<string, string>): Response {
  return new Response('{}', { status, headers });
}

Deno.test('a spent allowance is a throttle, not a refused credential', () => {
  // GitHub answers both with 403. Read the wrong way, a fast import marks the connection dead.
  assertEquals(
    retryAfterOf(throttled(403, { 'x-ratelimit-remaining': '0', 'retry-after': '90' })),
    90,
  );
  assertEquals(retryAfterOf(throttled(429, { 'retry-after': '30' })), 30);
});

Deno.test('a 403 with allowance left is a refused credential, not a throttle', () => {
  assertEquals(retryAfterOf(throttled(403, { 'x-ratelimit-remaining': '17' })), null);
  assertEquals(retryAfterOf(throttled(403, {})), null);
  assertEquals(retryAfterOf(throttled(401, {})), null);
});

Deno.test('an ordinary answer is not a throttle', () => {
  assertEquals(retryAfterOf(throttled(200, {})), null);
  assertEquals(retryAfterOf(throttled(500, {})), null);
});

Deno.test('a reset instant is turned into a wait, since that is what the caller needs', () => {
  const inTwoMinutes = Math.floor(Date.now() / 1000) + 120;
  const wait = retryAfterOf(
    throttled(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(inTwoMinutes) }),
  );

  assert(wait !== null && wait > 110 && wait <= 120, `expected about two minutes, got ${wait}`);
});

Deno.test('a throttle with nothing to go on still waits rather than hammering', () => {
  assertEquals(retryAfterOf(throttled(429, {})), 60);
});
