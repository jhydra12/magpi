#!/usr/bin/env node
/** Fails when an automatic workflow runs heavy commands, native runners or a matrix. */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = resolve(ROOT, '.github/workflows');

/** Commands needing a database, browser or native toolchain, listed by script name and by path. */
const HEAVY_COMMANDS = [
  'supabase start',
  'supabase db',
  'supabase test',
  'playwright',
  'test:e2e',
  'test:integration',
  'test:db',
  'pnpm gate',
  'scripts/gate.mjs',
  'scripts/db-test.mjs',
  'scripts/integration-test.mjs',
  'xcodebuild',
  'gradlew',
  'emulator',
];

/**
 * Invocations an automatic workflow may make despite matching the list above. The light gate
 * is the one heavy suite hosted CI runs. `supabase db push` reaches the linked project over the
 * network and starts no database of its own, so it is a deploy, and the deploy runs on push.
 */
const ALLOWED_INVOCATIONS = [
  'scripts/gate.mjs --light',
  'supabase db push',
  'pnpm exec playwright install --with-deps chromium',
];

const HOSTED_RUNNERS_ALLOWED = ['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04'];
const NATIVE_RUNNER_PREFIXES = ['macos', 'windows'];

function readWorkflows() {
  return readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ file: f, text: readFileSync(join(WORKFLOWS, f), 'utf8') }));
}

/** Triggers that fire without a person asking, matched at any indent and in flow form. */
function automaticTriggers(text) {
  const onBlock = text.split(/^jobs:/m)[0];
  return ['push', 'pull_request', 'schedule'].filter(
    (trigger) =>
      // Block form at any indent: `  push:`
      new RegExp(`^\\s+${trigger}:`, 'm').test(onBlock) ||
      // Flow form: `on: [push, pull_request]` or `on: push`
      new RegExp(`^on:.*(\\[|\\s)${trigger}\\b`, 'm').test(onBlock),
  );
}

function runsOn(text) {
  return [...text.matchAll(/runs-on:\s*(\S+)/g)].map((m) => m[1].replace(/['"]/g, ''));
}

function hasMatrix(text) {
  return /^\s*strategy:/m.test(text) && /^\s*matrix:/m.test(text);
}

function main() {
  const failures = [];

  for (const { file, text } of readWorkflows()) {
    const automatic = automaticTriggers(text);
    if (automatic.length === 0) continue;

    // Strip the allowed invocations before matching heavy commands.
    const remaining = ALLOWED_INVOCATIONS.reduce((t, allowed) => t.split(allowed).join(''), text);

    for (const command of HEAVY_COMMANDS) {
      if (remaining.includes(command)) {
        failures.push(`${file}: runs \`${command}\` on ${automatic.join(', ')}`);
      }
    }

    for (const runner of runsOn(text)) {
      if (NATIVE_RUNNER_PREFIXES.some((p) => runner.startsWith(p))) {
        failures.push(`${file}: native runner ${runner} on ${automatic.join(', ')}`);
      } else if (!HOSTED_RUNNERS_ALLOWED.includes(runner) && !runner.startsWith('${{')) {
        failures.push(`${file}: unexpected runner ${runner}`);
      }
    }

    if (hasMatrix(text)) {
      failures.push(`${file}: matrix expansion on ${automatic.join(', ')}`);
    }
  }

  const deploy = readFileSync(join(WORKFLOWS, 'deploy.yml'), 'utf8');
  if (
    !/checks:\s*\n\s*uses: \.\/\.github\/workflows\/light-gate\.yml/.test(deploy) ||
    !/deploy:\s*\n\s*needs: checks/.test(deploy)
  ) {
    failures.push('deploy.yml must require the reusable gate for this commit');
  }

  if (!/name: Production release ready\s*\n\s*needs: \[checks, deploy\]/.test(deploy)) {
    failures.push('production release check must wait for validation and Supabase deploy');
  }

  if (failures.length > 0) {
    console.error('workflow contract FAILED\n');
    for (const f of failures) console.error(`  ${f}`);
    console.error('\nHosted triggers run the light gate only. Full suites are manual.');
    process.exit(1);
  }

  console.log('workflow contract: hosted triggers stay light');
}

main();
