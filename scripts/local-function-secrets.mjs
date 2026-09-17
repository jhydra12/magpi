#!/usr/bin/env node
/** Writes the running local stack's keys into the gitignored edge function env file. */

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local facts beat shared secrets: the hosted project's copies of these belong to it.
import { fromLocalStack, isSameToken } from './lib/local-stack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'supabase/.env.local');

/** Local stack defaults. Both of these are public in supabase/config.toml. */
const LOCAL_DEFAULTS = {
  SB_SUPABASE_URL: 'http://127.0.0.1:55321',
  SB_TOKEN_ENC_KEY_ID: '1',
};

/** AES-256-GCM key for stored tokens. Generated once per machine and reused so old rows decrypt. */
function localEncryptionKey() {
  if (existsSync(OUT)) {
    const existing = /^SB_TOKEN_ENC_KEY=(.+)$/m.exec(readFileSync(OUT, 'utf8'));
    if (existing) return existing[1];
  }
  return randomBytes(32).toString('base64');
}

/** What the file already holds, which is the floor: this script never drops a key. */
function existing() {
  if (!existsSync(OUT)) return {};

  const values = {};
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function main() {
  const was = existing();
  const local = fromLocalStack(ROOT);

  // Start from what is there, so a run with the stack down leaves every other secret in place.
  const merged = {
    ...LOCAL_DEFAULTS,
    ...was,
    SB_TOKEN_ENC_KEY: localEncryptionKey(),
    ...(local ?? {}),
  };

  // Keep a token that still does its job rather than minting a second one that says the same
  // thing: ES256 signatures differ every time, and rewriting them churns both env files.
  for (const key of Object.keys(local ?? {})) {
    if (was[key] && isSameToken(was[key], merged[key])) merged[key] = was[key];
  }

  const lines = Object.entries(merged)
    .map(([key, value]) => `${key}=${String(value).replace(/\n/g, '\\n')}`)
    .sort();

  writeFileSync(OUT, `${lines.join('\n')}\n`, { mode: 0o600 });

  console.log(`wrote ${OUT} (${lines.length} keys)`);
  if (!local) console.log('  the local stack is not running, so its own keys were left alone');
}

main();
