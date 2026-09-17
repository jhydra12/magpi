#!/usr/bin/env node
/** Sets the two Vault secrets the scheduled workers read at fire time. */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';

/** The gateway as the database container sees it, since 127.0.0.1 inside Postgres is Postgres. */
const LOCAL_BASE = 'http://host.docker.internal:55321';

function setSecret(name, value) {
  // Delete then recreate, because vault.create_secret refuses a duplicate name.
  const sql = `
    delete from vault.secrets where name = ${literal(name)};
    select vault.create_secret(${literal(value)}, ${literal(name)});
  `;
  execFileSync('psql', [DB_URL, '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
  const base = process.env.WORKER_BASE_URL ?? LOCAL_BASE;
  const key = process.env.SB_SERVICE_ROLE_KEY;

  if (!key) {
    console.error('SB_SERVICE_ROLE_KEY is not set. Run with node --env-file=supabase/.env.local.');
    process.exit(1);
  }

  setSecret('worker_base_url', base);
  setSecret('worker_service_key', key);

  console.log(`scheduled workers now call ${base}`);
  console.log('cron.job holds the schedule; the key stays in Vault');
}

main();
