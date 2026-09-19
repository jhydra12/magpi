#!/usr/bin/env node
/**
 * Runs the light gate with --light, otherwise the full gate. --strict fails on a skipped step.
 * --verbose streams every step's output; without it only a failing step's output is shown.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = new Set(process.argv.slice(2));
const isLight = args.has('--light');
const isStrict = args.has('--strict');
/** Show every step's output, the way this used to behave, for when a failure needs context. */
const isVerbose = args.has('--verbose');

const LIGHT_STEPS = [
  { name: 'format check (web)', cmd: 'pnpm', argv: ['format:check'] },
  {
    name: 'format check (functions)',
    cmd: 'pnpm',
    argv: ['format:check:functions'],
    needs: 'deno',
  },
  { name: 'lint (web)', cmd: 'pnpm', argv: ['lint:web'] },
  { name: 'lint (functions)', cmd: 'pnpm', argv: ['lint:functions'], needs: 'deno' },
  { name: 'typecheck (web)', cmd: 'pnpm', argv: ['typecheck:web'] },
  { name: 'typecheck (functions)', cmd: 'pnpm', argv: ['typecheck:functions'], needs: 'deno' },
  { name: 'web unit tests', cmd: 'pnpm', argv: ['test'] },
  { name: 'function unit tests', cmd: 'pnpm', argv: ['test:functions'], needs: 'deno' },
  { name: 'Compute tests', cmd: 'pnpm', argv: ['compute:test'] },
  { name: 'Dream rehearsal tests', cmd: 'pnpm', argv: ['dream:rehearsal:test'] },
  { name: 'seed and corpus tests', cmd: 'pnpm', argv: ['test:seeds'] },
  { name: 'workflow contract', cmd: 'node', argv: ['scripts/workflow-contract-check.mjs'] },
  { name: 'raw color', cmd: 'node', argv: ['scripts/check-raw-color.mjs'] },
  { name: 'scheduled workers', cmd: 'node', argv: ['scripts/check-scheduled-workers.mjs'] },
  { name: 'upload types', cmd: 'node', argv: ['scripts/check-upload-types.mjs'] },
  { name: 'secrets agree', cmd: 'node', argv: ['scripts/check-secrets.mjs'] },
  { name: 'compat tokens', cmd: 'node', argv: ['scripts/check-compat-tokens.mjs'] },
  { name: 'corpus', cmd: 'node', argv: ['scripts/check-corpus.mjs'] },
  { name: 'graph browser regression', cmd: 'pnpm', argv: ['test:graph'] },
  { name: 'web build', cmd: 'pnpm', argv: ['build'] },
];

const FULL_STEPS = [
  { name: 'mobile-spec contract', cmd: 'node', argv: ['scripts/mobile-spec-check.mjs'] },
  { name: 'coverage thresholds', cmd: 'pnpm', argv: ['test:coverage'] },
  { name: 'pgTAP', cmd: 'node', argv: ['scripts/db-test.mjs'], needs: 'supabase' },
  {
    name: 'integration',
    cmd: 'node',
    argv: ['scripts/integration-test.mjs'],
    needs: 'supabase-keys',
  },
  { name: 'e2e and lifecycle', cmd: 'pnpm', argv: ['test:e2e'], needs: 'playwright-keys' },
];

/** Redrawing needs a terminal. A log file or CI gets plain lines in the same order. */
const isTty = Boolean(process.stdout.isTTY) && !process.env.CI;

const paint = (code, text) => (isTty ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = (text) => paint('2', text);
const green = (text) => paint('32', text);
const red = (text) => paint('31', text);
const yellow = (text) => paint('33', text);

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BAR_WIDTH = 24;

function bar(done, total) {
  const filled = Math.round((done / total) * BAR_WIDTH);
  return `${'█'.repeat(filled)}${dim('░'.repeat(BAR_WIDTH - filled))}`;
}

const NAME_WIDTH = Math.max(...[...LIGHT_STEPS, ...FULL_STEPS].map((s) => s.name.length));

function hasBinary(bin) {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0;
}

function isAvailable(need) {
  if (!need) return true;
  if (need === 'deno') return hasBinary('deno');
  if (need === 'supabase') return hasBinary('supabase');
  // The service role key never lives in the repo. Without it the step cannot sign anybody in, so
  // it is missing a prerequisite rather than failing, the same as a missing binary.
  if (need === 'supabase-keys') {
    return hasBinary('supabase') && Boolean(process.env.SB_SERVICE_ROLE_KEY);
  }
  if (need === 'playwright') return existsSync(resolve(ROOT, 'playwright.config.ts'));
  // Its fixtures create accounts, so it needs the same key the integration step does.
  if (need === 'playwright-keys') {
    return (
      existsSync(resolve(ROOT, 'playwright.config.ts')) && Boolean(process.env.SB_SERVICE_ROLE_KEY)
    );
  }
  return true;
}

/** Runs one step, holding its output until it is known whether anyone needs to read it. */
function run(step) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = spawn(step.cmd, step.argv, {
      cwd: ROOT,
      stdio: isVerbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      output += chunk;
    });

    child.on('close', (code) => {
      resolveRun({
        ok: code === 0,
        seconds: ((Date.now() - started) / 1000).toFixed(1),
        output,
      });
    });
  });
}

function line(marker, name, trailer) {
  return `  ${marker}  ${name.padEnd(NAME_WIDTH)}  ${trailer}`;
}

/** Holds one redrawing line while a step runs, and leaves nothing behind when it stops. */
function liveLine() {
  if (!isTty) return { update() {}, clear() {} };

  return {
    update(text) {
      process.stdout.write(`\r\u001b[2K${text}`);
    },
    clear() {
      process.stdout.write('\r\u001b[2K');
    },
  };
}

async function main() {
  const steps = isLight ? [...LIGHT_STEPS] : [...LIGHT_STEPS, ...FULL_STEPS];
  const label = isLight ? 'light gate' : 'full gate';

  console.log(`\n${label}, ${steps.length} steps${isStrict ? ', strict' : ''}\n`);

  const results = [];
  let failure = null;

  for (const [index, step] of steps.entries()) {
    if (!isAvailable(step.needs)) {
      if (isStrict) {
        console.error(
          red(`\n${label} FAILED: ${step.name} needs ${step.needs}, which is not here`),
        );
        process.exit(1);
      }
      console.log(line(dim('skip'), step.name, dim(`${step.needs} is not here`)));
      results.push({ name: step.name, state: 'skipped' });
      continue;
    }

    const live = liveLine();
    let frame = 0;
    const started = Date.now();
    const tick = setInterval(() => {
      frame += 1;
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      live.update(
        line(
          yellow(SPINNER[frame % SPINNER.length]),
          step.name,
          `${bar(index, steps.length)} ${dim(`${index + 1}/${steps.length}`)}  ${dim(`${elapsed}s`)}`,
        ),
      );
    }, 80);

    const outcome = await run(step);
    clearInterval(tick);
    live.clear();

    if (outcome.ok) {
      console.log(line(green('ok  '), step.name, dim(`${outcome.seconds}s`)));
      results.push({ name: step.name, state: 'passed' });
      continue;
    }

    console.log(line(red('FAIL'), step.name, dim(`${outcome.seconds}s`)));
    results.push({ name: step.name, state: 'failed' });
    failure = { step, output: outcome.output };
    break;
  }

  const skipped = results.filter((r) => r.state === 'skipped').length;
  const notRun = steps.length - results.length;

  if (failure) {
    // The only output anyone reads is the output of the thing that broke.
    if (!isVerbose) {
      const rule = '─'.repeat(Math.min(process.stdout.columns ?? 80, 100));
      console.error(`\n${rule}\n${failure.step.name}\n${rule}`);
      console.error(failure.output.trimEnd() || '(the step wrote nothing before it failed)');
      console.error(rule);
    }
    console.error(red(`\n${label} FAILED at ${failure.step.name}`));
    if (notRun > 0) console.error(dim(`${notRun} step(s) after it did not run`));
    process.exit(1);
  }

  const tail = skipped > 0 ? `, ${skipped} skipped` : ', nothing skipped';
  console.log(green(`\n${label} passed${tail}\n`));
}

await main();
