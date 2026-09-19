import assert from 'node:assert/strict';
import test from 'node:test';

test('history replay repairs interruption after every persistence operation without duplicates', async () => {
  const { seedNight } = await import('../seed-dreams.mjs');
  const { readFileSync } = await import('node:fs');
  const dreams = JSON.parse(
    readFileSync(new URL('../../supabase/corpus/dreams/manifest.json', import.meta.url), 'utf8'),
  );
  const selected = dreams.find((dream) => dream.links.length > 0);
  const references = [
    ...new Set([...selected.cited, ...selected.links.flatMap(({ a, b }) => [a, b])]),
  ];
  const input = {
    org: { id: 'isolated-test-org' },
    spaces: { [selected.space]: 'isolated-test-space' },
    dream: { ...selected, corpusNight: selected.night },
    corpus: new Map(
      references.map((externalId, index) => [
        externalId,
        {
          id: `document-${index}`,
          opener: { id: `chunk-${index}`, token_count: 10, embedding: [0.1, 0.2] },
        },
      ]),
    ),
  };
  const harness = (interruptAfter = -1) => {
    const tables = new Map();
    const objects = new Map();
    const jobs = new Map();
    let operations = 0;
    const persisted = () => {
      operations += 1;
      if (operations === interruptAfter)
        throw new Error('simulated interruption after persistence');
    };
    const rowsFor = (table) => {
      if (!tables.has(table)) tables.set(table, new Map());
      return tables.get(table);
    };
    const db = {
      storage: {
        from: () => ({
          upload: async (path, body) => {
            objects.set(path, body);
            persisted();
            return { error: null };
          },
        }),
      },
      rpc: async (name, { p_document }) => {
        assert.equal(name, 'enqueue_document');
        // This fake models the separately tested atomic RPC's reuse of an active job.
        jobs.set(p_document.id, { document_id: p_document.id, status: 'queued' });
        persisted();
        return { data: [], error: null };
      },
      from: (table) => ({
        upsert: (rows, options) => {
          const store = rowsFor(table);
          for (const row of Array.isArray(rows) ? rows : [rows]) {
            const key = options?.onConflict
              ? options.onConflict
                  .split(',')
                  .map((column) => row[column])
                  .join(':')
              : row.id;
            store.set(key, { ...store.get(key), ...row });
          }
          persisted();
          const result = { data: rows, error: null };
          return { ...result, select: () => ({ single: async () => result }) };
        },
        update: (patch) => ({
          eq: async (column, value) => {
            const store = rowsFor(table);
            for (const [key, row] of store)
              if (row[column] === value) store.set(key, { ...row, ...patch });
            persisted();
            return { data: null, error: null };
          },
        }),
      }),
    };
    return { db, tables, objects, jobs, count: () => operations };
  };
  const baseline = harness();
  await seedNight(baseline.db, input);
  assert.equal(baseline.tables.get('dream_runs').size, 3);
  assert.equal(baseline.tables.get('documents').size, 1);
  assert.equal(baseline.jobs.size, 1);
  for (let step = 1; step <= baseline.count(); step += 1) {
    const interrupted = harness(step);
    await assert.rejects(seedNight(interrupted.db, input), /simulated interruption/);
    await seedNight(interrupted.db, input);
    await seedNight(interrupted.db, input);
    assert.deepEqual(
      interrupted.tables,
      baseline.tables,
      `database state after interruption ${step}`,
    );
    assert.deepEqual(interrupted.objects, baseline.objects, `storage after interruption ${step}`);
    assert.deepEqual(interrupted.jobs, baseline.jobs, `jobs after interruption ${step}`);
  }
});
