#!/usr/bin/env node
/** Fails when a scheduled job names an Edge Function or a SQL function that does not exist. */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEDULES = ['supabase/schemas/96_schedules.sql', 'supabase/schemas/97_execution_mode.sql'];
const SCHEMAS = 'supabase/schemas';
const VERCEL = 'vercel.json';

/**
 * Each job with the body it runs. The target is read out of the body rather than assumed from the
 * job name, because a job called dream-worker that invokes a mistyped one would otherwise pass.
 */
export function scheduledJobs(source) {
  const pattern =
    /cron\.schedule\(\s*'([a-z0-9-]+)'\s*,\s*'[^']*'\s*,\s*(?:\$job\$([\s\S]*?)\$job\$|'((?:[^']|'')*)')/g;
  return [...source.matchAll(pattern)].map((match) => ({
    name: match[1],
    body: (match[2] ?? match[3].replaceAll("''", "'")).trim(),
  }));
}

/** Every function the declarative schema defines, so a job calling one can be checked. */
function declaredFunctions() {
  const names = new Set();
  for (const file of readdirSync(resolve(ROOT, SCHEMAS))) {
    if (!file.endsWith('.sql')) continue;
    const source = readFileSync(join(ROOT, SCHEMAS, file), 'utf8');
    for (const match of source.matchAll(/create or replace function public\.([a-z0-9_]+)/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

/** What a job body actually calls: an Edge Function through invoke_worker, or a SQL function. */
function targetOf(body) {
  const worker = /invoke_worker\(\s*'([a-z0-9-]+)'/.exec(body);
  if (worker) return { kind: 'edge', name: worker[1] };

  const sql = /select\s+public\.([a-z0-9_]+)\s*\(/i.exec(body);
  if (sql) return { kind: 'sql', name: sql[1] };

  return null;
}

function main() {
  const jobs = SCHEDULES.flatMap((file) =>
    scheduledJobs(readFileSync(resolve(ROOT, file), 'utf8')),
  );

  if (jobs.length === 0) {
    console.error(`scheduled workers FAILED: ${SCHEDULES} schedules nothing`);
    process.exit(1);
  }

  const functions = declaredFunctions();
  const failures = [];

  for (const job of jobs) {
    const target = targetOf(job.body);
    if (!target) {
      failures.push(`${job.name}  runs something this check cannot read: ${job.body}`);
      continue;
    }

    if (target.kind === 'edge') {
      const path = `supabase/functions/${target.name}/index.ts`;
      if (!existsSync(resolve(ROOT, path))) failures.push(`${job.name}  expected ${path}`);
      continue;
    }

    if (!functions.has(target.name)) {
      failures.push(`${job.name}  calls public.${target.name}(), which ${SCHEMAS} does not define`);
    }
  }

  if (failures.length > 0) {
    console.error(`scheduled workers FAILED: ${failures.length} job(s) name a missing target\n`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }

  // A cron here would run the workers a second time alongside the database schedule. No file
  // means no crons: the Vercel project's root is web/, so this file only exists if someone adds it.
  const vercelPath = resolve(ROOT, VERCEL);
  const vercel = existsSync(vercelPath) ? JSON.parse(readFileSync(vercelPath, 'utf8')) : {};
  if ((vercel.crons ?? []).length > 0) {
    console.error(`scheduled workers FAILED: ${VERCEL} declares crons as well`);
    console.error('Two schedulers for the same workers means every job runs twice.');
    process.exit(1);
  }

  console.log(
    `scheduled workers: ${jobs.length}, every target present (${jobs.map((j) => j.name).join(', ')})`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
