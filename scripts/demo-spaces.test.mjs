import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DEMO_TEAM_SPACES } from './demo-spaces.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../supabase/corpus/manifest.json', import.meta.url)),
);

test('the keynote corpus has thirty additional spaces with twelve documents each', () => {
  assert.equal(DEMO_TEAM_SPACES.length, 30);
  for (const { key } of DEMO_TEAM_SPACES) {
    assert.equal(manifest.filter((entry) => entry.space === key).length, 12, key);
  }
});

test('every generated space uses all four synced providers', () => {
  for (const { key } of DEMO_TEAM_SPACES) {
    const entries = manifest.filter((entry) => entry.space === key);
    assert.deepEqual(
      new Set(entries.map((entry) => entry.source)),
      new Set(['notion', 'slack', 'drive', 'linear']),
    );
  }
});

test('every added space has distinct source text and valid neighbor references', () => {
  for (const [index, { key }] of DEMO_TEAM_SPACES.entries()) {
    const entries = manifest.filter((entry) => entry.space === key);
    const bodies = entries.map((entry) =>
      readFileSync(new URL(`../supabase/corpus/${entry.path}`, import.meta.url), 'utf8'),
    );
    assert.equal(new Set(bodies).size, entries.length, key);
    const neighbor = DEMO_TEAM_SPACES[(index + 1) % DEMO_TEAM_SPACES.length];
    for (const body of bodies) assert.ok(body.includes(neighbor.name), key);
  }
});

test('validation rejects a malformed body in an added space', async () => {
  const { cpSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { checkCorpus } = await import('./check-corpus.mjs');
  const temporary = mkdtempSync(join(tmpdir(), 'corpus-validation-'));
  try {
    cpSync(new URL('../supabase/corpus/', import.meta.url), temporary, { recursive: true });
    const entry = manifest.find(({ space }) => space === DEMO_TEAM_SPACES[0].key);
    writeFileSync(join(temporary, entry.path), 'missing title');
    assert.ok(checkCorpus(temporary).failures.includes(`${entry.path}: no title`));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
