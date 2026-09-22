import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectHostedDemoFiles, removeHostedDemoFiles } from './clear-hosted-demo-files.mjs';

const ORG_ID = '2486af3d-49b5-4775-817d-ddf2f0e49cae';
const SPACE_ID = 'f4f5c57e-9f72-4bb6-adf3-f0e87840360f';

function document(id, storagePath, spaceId = SPACE_ID) {
  return { id: String(id), space_id: spaceId, storage_path: storagePath };
}

function fakeDatabase({
  documents = [],
  spaces = [{ id: SPACE_ID }],
  activeDreams = 0,
  activeIngests = 0,
  removeErrorAt = 0,
} = {}) {
  const removedBatches = [];
  const rowsByTable = { documents, spaces };
  const db = {
    removedBatches,
    from(table) {
      const query = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        order() {
          return this;
        },
        single() {
          return Promise.resolve({
            data: { id: ORG_ID, slug: 'jane-a4b1b777' },
            error: null,
          });
        },
        range(start, end) {
          return Promise.resolve({ data: rowsByTable[table].slice(start, end + 1), error: null });
        },
        then(resolve, reject) {
          const count = table === 'dream_runs' ? activeDreams : activeIngests;
          return Promise.resolve({ count, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'documents');
        return {
          async remove(paths) {
            removedBatches.push(paths);
            if (removeErrorAt === removedBatches.length) {
              return { data: null, error: { message: 'Storage unavailable' } };
            }
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };
  return db;
}

test('preview includes organization and personal-space files without removing either', async () => {
  const db = fakeDatabase({
    documents: [
      document(1, `${ORG_ID}/corpus/plan.md`),
      document(2, `${SPACE_ID}/ingest-0822.md`),
      document(3, `${SPACE_ID}/ingest-0822.md`),
      document(4, null),
    ],
  });
  const inventory = await inspectHostedDemoFiles(db);

  assert.equal(inventory.documentCount, 4);
  assert.equal(inventory.uniqueFileCount, 2);
  assert.equal(inventory.orgPaths, 1);
  assert.equal(inventory.spacePaths, 1);
  assert.equal(inventory.withoutFile, 1);
  assert.deepEqual(db.removedBatches, []);
});

test('preview reads every document page', async () => {
  const db = fakeDatabase({
    documents: Array.from({ length: 1001 }, (_, index) =>
      document(index, `${ORG_ID}/corpus/${index}.md`),
    ),
  });

  const inventory = await inspectHostedDemoFiles(db);
  assert.equal(inventory.documentCount, 1001);
  assert.equal(inventory.uniqueFileCount, 1001);
});

test('cleanup rejects paths outside the document organization or space', async () => {
  const db = fakeDatabase({ documents: [document(1, 'other-space/file.md')] });
  await assert.rejects(inspectHostedDemoFiles(db), /outside its organization or space/);
  assert.deepEqual(db.removedBatches, []);
});

test('cleanup rejects Storage path traversal', async () => {
  const db = fakeDatabase({ documents: [document(1, `${SPACE_ID}/../other.md`)] });
  await assert.rejects(inspectHostedDemoFiles(db), /outside its organization or space/);
  assert.deepEqual(db.removedBatches, []);
});

test('cleanup rejects documents attached to an unknown space', async () => {
  const db = fakeDatabase({ documents: [document(1, `${ORG_ID}/corpus/plan.md`, 'other')] });
  await assert.rejects(inspectHostedDemoFiles(db), /unexpected space/);
});

test('cleanup rejects active work before deleting files', async () => {
  const db = fakeDatabase({
    documents: [document(1, `${ORG_ID}/corpus/plan.md`)],
    activeIngests: 1,
  });
  await assert.rejects(inspectHostedDemoFiles(db), /active ingest jobs/);
  assert.deepEqual(db.removedBatches, []);
});

test('apply requires exact document and file counts', async () => {
  const db = fakeDatabase({ documents: [document(1, `${ORG_ID}/corpus/plan.md`)] });
  const inventory = await inspectHostedDemoFiles(db);

  await assert.rejects(
    removeHostedDemoFiles(db, inventory, 2, 1, () => {}),
    /exactly match/,
  );
  await assert.rejects(
    removeHostedDemoFiles(db, inventory, 1, 2, () => {}),
    /exactly match/,
  );
  assert.deepEqual(db.removedBatches, []);
});

test('apply checks for newly active work before removing files', async () => {
  const path = `${ORG_ID}/corpus/plan.md`;
  const inventory = await inspectHostedDemoFiles(fakeDatabase({ documents: [document(1, path)] }));
  const db = fakeDatabase({ activeDreams: 1 });

  await assert.rejects(
    removeHostedDemoFiles(db, inventory, 1, 1, () => {}),
    /active Dream runs/,
  );
  assert.deepEqual(db.removedBatches, []);
});

test('apply deletes in small Storage API batches and keeps database rows', async () => {
  const documents = Array.from({ length: 101 }, (_, index) =>
    document(index, `${SPACE_ID}/ingest-${index}.md`),
  );
  const db = fakeDatabase({ documents });
  const inventory = await inspectHostedDemoFiles(db);
  const progress = [];

  await removeHostedDemoFiles(db, inventory, 101, 101, (message) => progress.push(message));

  assert.deepEqual(
    db.removedBatches.map((batch) => batch.length),
    [100, 1],
  );
  assert.equal(progress.length, 2);
  assert.equal(documents.length, 101);
});

test('apply stops when the Storage API rejects a batch', async () => {
  const db = fakeDatabase({
    documents: Array.from({ length: 101 }, (_, index) =>
      document(index, `${SPACE_ID}/ingest-${index}.md`),
    ),
    removeErrorAt: 2,
  });
  const inventory = await inspectHostedDemoFiles(db);

  await assert.rejects(
    removeHostedDemoFiles(db, inventory, 101, 101, () => {}),
    /Storage unavailable/,
  );
  assert.deepEqual(
    db.removedBatches.map((batch) => batch.length),
    [100, 1],
  );
});
