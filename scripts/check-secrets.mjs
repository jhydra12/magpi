#!/usr/bin/env node
/**
 * Fails when the two local env files disagree about a secret. Both are copies of the same
 * hosted-project credentials, and a copy that has been hand-edited is how a key from another
 * project ends up billing this one.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCAL_ONLY } from './lib/local-stack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Both copies, and what writes each one, so a failure can say how to fix it. */
const COPIES = [
  { path: 'web/.env.local', written: 'by hand, from the file a person handed over' },
  { path: 'supabase/.env.local', written: 'node scripts/local-function-secrets.mjs' },
];

/** `KEY=value` and `KEY="value"` both, since the two writers quote differently. */
function readEnv(path) {
  const full = resolve(ROOT, path);
  if (!existsSync(full)) return null;

  const values = new Map();
  for (const line of readFileSync(full, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values.set(match[1], match[2].replace(/^"(.*)"$/, '$1'));
  }
  return values;
}

/** Enough of a secret to tell two apart, and not enough to be worth reading over a shoulder. */
function fingerprint(value) {
  if (value.length <= 12) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 8)}…${value.slice(-4)} (${value.length} chars)`;
}

function main() {
  const files = COPIES.map((copy) => ({ ...copy, values: readEnv(copy.path) }));
  const present = files.filter((file) => file.values !== null);
  if (present.length < 2) {
    console.log('secrets: fewer than two env files are here, nothing to compare');
    return;
  }

  // Every key the two copies share has to hold the same value in both.
  const [web, functions] = present;
  const failures = [];
  for (const [key, value] of web.values) {
    if (LOCAL_ONLY.has(key)) continue;
    const other = functions.values.get(key);
    if (other !== undefined && other !== value) {
      failures.push(
        `${key} differs between the two copies\n` +
          `      ${web.path}: ${fingerprint(value)} (written ${web.written})\n` +
          `      ${functions.path}: ${fingerprint(other)} (written ${functions.written})`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(`secrets FAILED: ${failures.length} value(s) drifted\n`);
    for (const failure of failures) console.error(`  ${failure}\n`);
    process.exit(1);
  }

  console.log(`secrets: ${web.path} and ${functions.path} agree with each other`);
}

main();
