// What the send email hook decides: which email this is, and whether the call is genuine.
//
// Kept out of index.ts so it can be tested without starting a server. GoTrue hands every account
// email here instead of sending one itself, so
// the words, the design and the delivery are all Digital Brain's.
//
// The payload is signed as a standard webhook: `v1,<base64 signature>` over `id.timestamp.body`,
// keyed by the hook secret. An unsigned call is refused before anything is rendered, because this
// endpoint takes a token and an address and will happily mail one to the other.

import { z } from 'zod';

import { timingSafeEqual } from '../_shared/crypto.ts';

import {
  changeEmail,
  confirmSignup,
  magicLink,
  reauthenticate,
  type Rendered,
  resetPassword,
} from '../_shared/email/templates.tsx';

export const payloadSchema = z.object({
  user: z.object({ email: z.string(), new_email: z.string().nullish() }),
  email_data: z.object({
    token: z.string(),
    token_hash: z.string(),
    redirect_to: z.string(),
    email_action_type: z.string(),
    token_new: z.string().nullish(),
    token_hash_new: z.string().nullish(),
  }),
});

type Payload = z.infer<typeof payloadSchema>;

function siteUrl(): string {
  return (Deno.env.get('SB_WEB_BASE_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/** Where a link lands: the confirm route, which verifies the token and forwards. */
function actionUrl(payload: Payload, tokenHash: string): string {
  const url = new URL('/auth/confirm', siteUrl());
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', payload.email_data.email_action_type);
  if (payload.email_data.redirect_to) {
    url.searchParams.set('next', payload.email_data.redirect_to);
  }
  return url.toString();
}

/** Which email this is, and who it goes to. An action nobody wrote a template for is an error. */
export function compose(payload: Payload): { to: string; rendered: Rendered } {
  const { email_action_type: action, token_hash: hash, token_hash_new: hashNew } =
    payload.email_data;
  const site = siteUrl();

  switch (action) {
    case 'signup':
      return {
        to: payload.user.email,
        rendered: confirmSignup({ siteUrl: site, actionUrl: actionUrl(payload, hash) }),
      };

    case 'recovery':
      return {
        to: payload.user.email,
        rendered: resetPassword({ siteUrl: site, actionUrl: actionUrl(payload, hash) }),
      };

    case 'magiclink':
      return {
        to: payload.user.email,
        rendered: magicLink({ siteUrl: site, actionUrl: actionUrl(payload, hash) }),
      };

    case 'email_change':
    case 'email_change_current': {
      // The current address approves; the new one confirms. GoTrue calls this hook once per side.
      const isNewAddress = action === 'email_change' && Boolean(hashNew);
      return {
        to: isNewAddress ? (payload.user.new_email ?? payload.user.email) : payload.user.email,
        rendered: changeEmail(
          { siteUrl: site, actionUrl: actionUrl(payload, isNewAddress ? hashNew! : hash) },
          { newEmail: payload.user.new_email ?? '', isNewAddress },
        ),
      };
    }

    case 'reauthentication':
      return {
        to: payload.user.email,
        rendered: reauthenticate({ siteUrl: site }, payload.email_data.token),
      };

    default:
      throw new Error(`no template for ${action}`);
  }
}

/**
 * How far out of date a call may be. A signature does not expire on its own, so without this a
 * captured call could be replayed for as long as the secret lives: the same reset email sent over
 * and over, or an email change re-offered after the person decided against it.
 */
const TOLERANCE_SECONDS = 300;

/** True when the timestamp is close enough to now, in either direction, to be this call. */
function isRecent(timestamp: string, now: number): boolean {
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  // Ahead as well as behind: a clock that runs fast is skew, but far ahead is a replay too.
  return Math.abs(now / 1000 - sent) <= TOLERANCE_SECONDS;
}

/** The signature covers the id, the timestamp and the body, exactly as sent. */
export async function isSigned(
  headers: Headers,
  body: string,
  now: number = Date.now(),
): Promise<boolean> {
  const secret = Deno.env.get('SB_AUTH_HOOK_SECRET');
  if (!secret) {
    console.error('SB_AUTH_HOOK_SECRET is not set, so nothing can be verified');
    return false;
  }

  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures) return false;
  if (!isRecent(timestamp, now)) return false;

  // The configured secret is base64 behind a `v1,whsec_` label, depending on who wrote it.
  const raw = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(raw), (character) => character.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));

  // Several signatures may be offered during a secret rotation; any one matching is enough.
  // Compared in constant time, so the answer cannot be built up one byte at a time.
  return signatures
    .split(' ')
    .map((entry) => entry.split(',').at(-1) ?? '')
    .some((candidate) => timingSafeEqual(candidate, expected));
}
