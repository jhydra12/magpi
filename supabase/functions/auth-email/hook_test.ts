import { assert, assertEquals, assertThrows } from '@std/assert';

import { compose, isSigned, payloadSchema } from './hook.ts';

const SECRET_BYTES = new Uint8Array(32).fill(7);
const SECRET = `v1,whsec_${btoa(String.fromCharCode(...SECRET_BYTES))}`;
const SITE = 'https://magpi.test';
const SENT_AT = '1757620000';
/** The instant those calls were signed at, so a fresh call is fresh. */
const NOW = Number(SENT_AT) * 1000;

function payload(overrides: Record<string, unknown> = {}) {
  const { user = {}, email_data = {} } = overrides as {
    user?: Record<string, unknown>;
    email_data?: Record<string, unknown>;
  };
  return payloadSchema.parse({
    user: { email: 'reader@example.com', ...user },
    email_data: {
      token: '123456',
      token_hash: 'hash-current',
      redirect_to: '',
      email_action_type: 'recovery',
      ...email_data,
    },
  });
}

/** The signature the auth server would send for this body. */
async function sign(id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    SECRET_BYTES,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signed)));
}

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

Deno.test('every account email goes to the address it is about', () => {
  Deno.env.set('SB_WEB_BASE_URL', SITE);

  const cases = [
    ['signup', 'Confirm your email address'],
    ['recovery', 'Reset your Digital Brain password'],
    ['magiclink', 'Your Digital Brain sign-in link'],
    ['reauthentication', 'Your Digital Brain confirmation code'],
  ] as const;

  for (const [action, subject] of cases) {
    const { to, rendered } = compose(payload({ email_data: { email_action_type: action } }));
    assertEquals(to, 'reader@example.com', action);
    assertEquals(rendered.subject, subject);
  }
});

Deno.test('the link points at the confirm route with the type that made it', () => {
  Deno.env.set('SB_WEB_BASE_URL', SITE);

  const { rendered } = compose(payload({ email_data: { redirect_to: '/chat' } }));
  const html = JSON.stringify(rendered.body);

  assert(html.includes(`${SITE}/auth/confirm`), 'the link did not point at the confirm route');
  assert(html.includes('token_hash=hash-current'));
  assert(html.includes('type=recovery'));
  assert(html.includes('next=%2Fchat'));
});

// Both inboxes are asked and each gets a different token. Sending the current address the new
// address's token would let one click finish a change that is supposed to need two.
Deno.test('the new address is asked with its own token, not the old one', () => {
  Deno.env.set('SB_WEB_BASE_URL', SITE);

  const changing = payload({
    user: { new_email: 'new@example.com' },
    email_data: { email_action_type: 'email_change', token_hash_new: 'hash-new' },
  });

  const { to, rendered } = compose(changing);
  assertEquals(to, 'new@example.com');
  assert(JSON.stringify(rendered.body).includes('token_hash=hash-new'));
});

Deno.test('the current address is asked with its own token', () => {
  Deno.env.set('SB_WEB_BASE_URL', SITE);

  const changing = payload({
    user: { new_email: 'new@example.com' },
    email_data: { email_action_type: 'email_change_current', token_hash_new: 'hash-new' },
  });

  const { to, rendered } = compose(changing);
  assertEquals(to, 'reader@example.com');
  assert(JSON.stringify(rendered.body).includes('token_hash=hash-current'));
});

Deno.test('an action nobody wrote a template for is an error, not a blank email', () => {
  assertThrows(
    () => compose(payload({ email_data: { email_action_type: 'invite' } })),
    Error,
    'no template for invite',
  );
});

Deno.test('a correctly signed call is accepted', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  const body = '{"hello":"world"}';
  const signature = await sign('msg_1', SENT_AT, body);

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': SENT_AT,
        'webhook-signature': `v1,${signature}`,
      }),
      body,
      NOW,
    ),
    true,
  );
});

Deno.test('a body that was tampered with after signing is refused', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  const signature = await sign('msg_1', SENT_AT, '{"hello":"world"}');

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': SENT_AT,
        'webhook-signature': `v1,${signature}`,
      }),
      '{"hello":"elsewhere"}',
      NOW,
    ),
    false,
  );
});

Deno.test('a call carrying no signature at all is refused', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  assertEquals(await isSigned(headers({}), '{}', NOW), false);
});

// A rotation offers the old and the new signature at once, space separated.
Deno.test('one matching signature among several is enough', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  const body = '{"hello":"world"}';
  const signature = await sign('msg_1', SENT_AT, body);

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': SENT_AT,
        'webhook-signature': `v1,AAAA v1,${signature}`,
      }),
      body,
      NOW,
    ),
    true,
  );
});

// Failing open here would turn the hook into an open relay for password reset links.
Deno.test('no configured secret refuses everything rather than trusting it', async () => {
  Deno.env.delete('SB_AUTH_HOOK_SECRET');
  const signature = await sign('msg_1', SENT_AT, '{}');

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': SENT_AT,
        'webhook-signature': `v1,${signature}`,
      }),
      '{}',
      NOW,
    ),
    false,
  );
});

// A signature does not expire on its own. Without a window, a call captured once could be
// replayed for as long as the secret lives: the same reset email again and again, or an email
// change re-offered after the person decided against it.
Deno.test('a call signed long ago is refused however good the signature is', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  const body = '{"hello":"world"}';
  const signature = await sign('msg_1', SENT_AT, body);
  const headersSent = headers({
    'webhook-id': 'msg_1',
    'webhook-timestamp': SENT_AT,
    'webhook-signature': `v1,${signature}`,
  });

  // Six minutes later, against a five minute window.
  assertEquals(await isSigned(headersSent, body, NOW + 360_000), false);
  // Still fine a minute later, because clocks are not perfectly aligned.
  assertEquals(await isSigned(headersSent, body, NOW + 60_000), true);
});

Deno.test('a call dated far in the future is refused too', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  const body = '{"hello":"world"}';
  const signature = await sign('msg_1', SENT_AT, body);

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': SENT_AT,
        'webhook-signature': `v1,${signature}`,
      }),
      body,
      NOW - 360_000,
    ),
    false,
  );
});

Deno.test('a timestamp that is not a number is refused rather than read as zero', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  const body = '{"hello":"world"}';
  const signature = await sign('msg_1', 'not-a-time', body);

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': 'not-a-time',
        'webhook-signature': `v1,${signature}`,
      }),
      body,
      NOW,
    ),
    false,
  );
});
