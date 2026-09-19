import assert from 'node:assert/strict';
import test from 'node:test';
import { cutoverDreams } from './dream-cutover.mjs';
import { fixtureId, fixtureDocument } from './seed-fixtures.mjs';
import { drainIngestion, pendingCounts } from './seed-drain.mjs';
import { seedSource, readAllPages } from './seed-source.mjs';

const clear = { queued: 0, running: 0, failed: 0, timeout: 0 };
test('drain waits for running work and queued retries before reporting completion', async () => {
  const states = [{ ...clear, running: 1 }, { ...clear, queued: 1 }, clear];
  const pending = [...states];
  const result = await drainIngestion({
    snapshot: async () => pending.shift(),
    runBatch: async () => ({ claimed: 0 }),
    wait: async () => {},
  });
  assert.deepEqual(result, clear);
});
test('drain rejects a stalled worker at its budget', async () => {
  await assert.rejects(
    drainIngestion({
      snapshot: async () => ({ ...clear, queued: 1 }),
      runBatch: async () => {},
      wait: async () => {},
      maxPasses: 2,
    }),
    /incomplete/,
  );
});
test('drain rejects failed jobs rather than reporting an empty queue', async () => {
  await assert.rejects(
    drainIngestion({
      snapshot: async () => ({ ...clear, failed: 1 }),
      runBatch: async () => {},
      wait: async () => {},
    }),
    /failed/,
  );
});
test('pagination returns sources beyond the API row limit', async () => {
  const expected = Array.from({ length: 1203 }, (_, id) => ({ id }));
  assert.deepEqual(
    await readAllPages(() => ({
      range: async (start, end) => ({ data: expected.slice(start, end + 1), error: null }),
    })),
    expected,
  );
});
test('source replay restores queue persistence after interruption following upload', async () => {
  const stored = new Map();
  const records = new Map();
  const db = {
    storage: {
      from: () => ({
        upload: async (path, body) => {
          stored.set(path, body);
          return { data: {}, error: null };
        },
      }),
    },
    rpc: async (_name, { p_document }) => {
      records.set(p_document.external_id, p_document);
      return { data: [], error: null };
    },
  };
  const input = {
    bucket: 'documents',
    body: 'new body',
    row: { external_id: 'source', storage_path: 'org/source' },
  };
  await assert.rejects(
    seedSource({ ...db, rpc: async () => ({ error: { message: 'interrupted' } }) }, input),
    /interrupted/,
  );
  await seedSource(db, input);
  await seedSource(db, { ...input, body: 'updated body' });
  assert.equal(stored.get('org/source'), 'updated body');
  assert.equal(records.size, 1);
});

test('fixture identities are stable per item and distinct across organizations', () => {
  assert.equal(fixtureId('org-a:night:kind'), fixtureId('org-a:night:kind'));
  assert.notEqual(fixtureId('org-a:night:kind'), fixtureId('org-b:night:kind'));
  assert.match(
    fixtureId('org-a:night:kind'),
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
test('fixtures reject missing or unprocessed source references', () => {
  assert.throws(() => fixtureDocument(new Map(), 'missing'), /Missing ingested/);
  assert.throws(
    () => fixtureDocument(new Map([['source', { opener: null }]]), 'source'),
    /Missing ingested/,
  );
});

test('successful retries resolve historical failures without hiding unfinished documents', () => {
  assert.deepEqual(
    pendingCounts([
      { document_id: 'a', status: 'succeeded' },
      { document_id: 'b', status: 'queued' },
      { document_id: 'a', status: 'failed' },
      { document_id: 'b', status: 'succeeded' },
    ]),
    { queued: 1, running: 0, failed: 0, timeout: 0 },
  );
});

test('manual cutover stops Edge claims and waits for active work before deployment', async () => {
  const events = [];
  const active = [1, 0];
  await cutoverDreams({
    setMode: async (mode) => events.push(mode),
    activeRuns: async () => active.shift(),
    deploy: async () => events.push('deploy-one'),
    wait: async () => events.push('wait'),
  });
  assert.deepEqual(events, ['compute', 'wait', 'deploy-one']);
});
test('manual cutover restores Edge if deployment fails or processing never finishes', async () => {
  for (const failure of ['deploy', 'timeout']) {
    const modes = [];
    await assert.rejects(
      cutoverDreams({
        setMode: async (mode) => modes.push(mode),
        activeRuns: async () => (failure === 'timeout' ? 1 : 0),
        deploy: async () => {
          throw new Error('deployment failed');
        },
        wait: async () => {},
        maxPolls: 1,
      }),
    );
    assert.deepEqual(modes, ['compute', 'edge']);
  }
});
