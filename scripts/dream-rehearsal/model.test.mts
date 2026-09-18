import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  batchUrl,
  manifestSchema,
  options,
  spaceName,
  summarize,
  targetUrl,
  verifyOwnership,
} from './model.mts';
import type { Manifest, RunStatus } from './model.mts';

function fixture(): Manifest {
  return manifestSchema.parse({
    version: 1,
    batchId: randomUUID(),
    createdAt: '2026-09-18T10:00:00.000Z',
    targetUrl: 'http://localhost:55321',
    webUrl: 'http://localhost:3000',
    sourceSpaceId: randomUUID(),
    orgId: randomUUID(),
    userId: randomUUID(),
    spaces: [0, 1].map(() => ({
      id: randomUUID(),
      runId: randomUUID(),
      documents: [
        {
          id: randomUUID(),
          sourceId: randomUUID(),
          chunks: [{ id: randomUUID(), sourceId: randomUUID() }],
        },
      ],
    })),
  });
}

function run(id: string, overrides: Partial<RunStatus> = {}): RunStatus {
  return {
    id,
    status: 'succeeded',
    created_at: '2026-09-18T10:01:00.000Z',
    started_at: '2026-09-18T10:01:01.000Z',
    finished_at: '2026-09-18T10:02:00.000Z',
    output_document_id: randomUUID(),
    input_document_count: 3,
    ...overrides,
  };
}

test('prepare requires explicit valid user, source space, manifest, and bounded count', () => {
  const required = [
    'prepare',
    '--manifest',
    '/tmp/run.json',
    '--source-space',
    randomUUID(),
    '--user',
    randomUUID(),
  ];
  assert.equal(options(required).count, 24);
  assert.throws(() => options(required.concat('--count', '0')));
  assert.throws(() => options(required.concat('--count', '101')));
  assert.throws(() => options(required.concat('--manifest', '/tmp/other.json')));
  assert.throws(() => options(['prepare', '--manifest', '/tmp/run.json']));
  assert.throws(() =>
    options(['cleanup', '--manifest', '/tmp/run.json', '--source-space', randomUUID()]),
  );
  assert.throws(() => targetUrl('https://secret:password@example.com'));
  assert.throws(() => targetUrl('https://example.com?key=secret'));
  assert.throws(() => targetUrl(undefined));
});

test('manifest rejects duplicate owned IDs and the source space as a cleanup target', () => {
  const manifest = fixture();
  assert.throws(() =>
    manifestSchema.parse({ ...manifest, spaces: [manifest.spaces[0], manifest.spaces[0]] }),
  );
  assert.throws(() => manifestSchema.parse({ ...manifest, sourceSpaceId: manifest.spaces[0].id }));
});

test('cleanup requires matching database, organization, space kind, name and ownership marker', () => {
  const manifest = fixture();
  const space = {
    id: manifest.spaces[0].id,
    name: spaceName(manifest, 0),
    org_id: manifest.orgId,
    kind: 'team',
    description: `Dream rehearsal batch ${manifest.batchId}`,
  };
  assert.doesNotThrow(() => verifyOwnership(manifest, manifest.targetUrl, [space]));
  assert.doesNotThrow(() => verifyOwnership(manifest, manifest.targetUrl, []));
  for (const unsafe of [
    { ...space, name: 'Engineering' },
    { ...space, org_id: randomUUID() },
    { ...space, id: manifest.sourceSpaceId },
    { ...space, kind: 'org' },
    { ...space, description: null },
  ]) {
    assert.throws(() => verifyOwnership(manifest, manifest.targetUrl, [unsafe]));
  }
  assert.throws(() => verifyOwnership(manifest, 'https://another-project.supabase.co', [space]));
});

test('completed batch timing excludes preparation time and remains fixed after completion', () => {
  const manifest = fixture();
  const runs = manifest.spaces.map((space) => run(space.runId));
  const output = runs[0].output_document_id;
  assert.ok(output);
  const result = summarize(
    manifest,
    [...runs, run(randomUUID())],
    new Set([output]),
    Date.parse('2026-09-18T11:00:00Z'),
  );
  assert.deepEqual(result, {
    requested: 2,
    missing: 0,
    queued: 0,
    running: 0,
    completed: 2,
    failed: 0,
    timeout: 0,
    nonemptyOutputs: 1,
    elapsedSeconds: 60,
    completedPerMinute: 2,
    isFinished: true,
    runs: runs.map((item) => ({
      id: item.id,
      status: item.status,
      inputDocuments: 3,
      outputDocumentId: item.output_document_id,
    })),
  });
  assert.equal(
    batchUrl(manifest),
    `${manifest.webUrl}/dreams?runs=${manifest.spaces.map((space) => space.runId).join(',')}`,
  );
});

test('failures and timeouts never count as successful throughput or nonempty outputs', () => {
  const manifest = fixture();
  const result = summarize(
    manifest,
    manifest.spaces.map((space, index) =>
      run(space.runId, { status: index ? 'timeout' : 'failed' }),
    ),
    new Set(),
  );
  assert.equal(result.completedPerMinute, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.timeout, 1);
  assert.equal(result.nonemptyOutputs, 0);
});

test('missing and still queued runs keep the batch incomplete and its elapsed timer running', () => {
  const manifest = fixture();
  const result = summarize(
    manifest,
    [
      run(manifest.spaces[0].runId, {
        status: 'queued',
        started_at: null,
        finished_at: null,
        output_document_id: null,
      }),
    ],
    new Set(),
    Date.parse('2026-09-18T10:01:30.000Z'),
  );
  assert.equal(result.isFinished, false);
  assert.equal(result.missing, 1);
  assert.equal(result.queued, 1);
  assert.equal(result.elapsedSeconds, 30);
});
