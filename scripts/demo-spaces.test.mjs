import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DEMO_TEAM_SPACES } from './demo-spaces.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../supabase/corpus/manifest.json', import.meta.url)),
);

test('the Launch Week corpus uses the four shared source spaces', () => {
  assert.equal(DEMO_TEAM_SPACES.length, 30);
  assert.equal(manifest.length, 32);
  assert.deepEqual(
    new Set(manifest.map((entry) => entry.space)),
    new Set(['company', 'engineering', 'marketing', 'finance']),
  );
});

test('the corpus includes all four simulated connected sources', () => {
  assert.deepEqual(
    new Set(manifest.map((entry) => entry.source)),
    new Set(['notion', 'slack', 'drive', 'linear']),
  );
});

test('every source body is distinct and listed once', () => {
  const bodies = manifest.map((entry) =>
    readFileSync(new URL(`../supabase/corpus/${entry.path}`, import.meta.url), 'utf8'),
  );
  assert.equal(new Set(bodies).size, manifest.length);
  assert.equal(new Set(manifest.map((entry) => entry.path)).size, manifest.length);
});

test('validation rejects a malformed source body', async () => {
  const { cpSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { checkCorpus } = await import('./check-corpus.mjs');
  const temporary = mkdtempSync(join(tmpdir(), 'corpus-validation-'));
  try {
    cpSync(new URL('../supabase/corpus/', import.meta.url), temporary, { recursive: true });
    const entry = manifest.find(({ space }) => space === 'company');
    writeFileSync(join(temporary, entry.path), 'missing title');
    assert.ok(checkCorpus(temporary).failures.includes(`${entry.path}: no title`));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
