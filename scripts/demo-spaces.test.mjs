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
