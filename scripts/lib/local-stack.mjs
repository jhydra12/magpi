/**
 * The keys the running local stack issues for itself. The hosted project's versions of these
 * are wrong for this machine, so a copy from it must not overwrite them.
 * Changing the signing key regenerates the two JWT-format ones, which is how they go stale.
 */

import { spawnSync } from 'node:child_process';

/** Written by `supabase start`, not by a person. A hosted project's copies are for another stack. */
export const STACK_KEYS = [
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SB_SERVICE_ROLE_KEY',
  'SB_SUPABASE_URL',
];

/** Those, plus the ones that are per-machine or per-checkout rather than shared. */
export const LOCAL_ONLY = new Set([
  ...STACK_KEYS,
  'SB_TOKEN_ENC_KEY',
  'SB_FUNCTIONS_BASE_URL',
  'SB_WEB_BASE_URL',
  'SB_DEMO_LOGIN',
]);

/** The header and payload of a JWT, or null when it is not one. */
function readToken(value) {
  const parts = String(value).split('.');
  if (parts.length !== 3) return null;

  try {
    const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return { header: decode(parts[0]), payload: decode(parts[1]) };
  } catch {
    return null;
  }
}

/**
 * True when a token already in a file does the same job as a freshly minted one. ES256 signatures
 * are non-deterministic, so the same claims signed twice are two different strings, and comparing
 * the strings would report every key as changed on every pull.
 */
export function isSameToken(existing, fresh) {
  const was = readToken(existing);
  const now = readToken(fresh);
  if (!was || !now) return existing === fresh;

  return (
    was.header.kid === now.header.kid &&
    was.payload.role === now.payload.role &&
    was.payload.iss === now.payload.iss &&
    // An expired one is replaced however well it matches.
    typeof was.payload.exp === 'number' &&
    was.payload.exp * 1000 > Date.now()
  );
}

/** What the stack is serving right now, or null when it is not running. */
export function fromLocalStack(cwd) {
  const child = spawnSync('supabase', ['status', '-o', 'json'], { cwd, encoding: 'utf8' });
  if (child.status !== 0) return null;

  try {
    const status = JSON.parse(child.stdout);
    return {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
      SB_SUPABASE_URL: status.API_URL,
      SB_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    };
  } catch {
    return null;
  }
}
