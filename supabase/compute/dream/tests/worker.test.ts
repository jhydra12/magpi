import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { IngestJobRecord } from '../../../functions/_shared/jobs/ingest.ts';
import { createIngestionWorker, type WorkerDependencies } from '../src/worker.ts';

const job: IngestJobRecord = {
  id: 'job',
  org_id: 'org',
  space_id: 'space',
  document_id: 'document',
  connection_id: null,
  attempts: 1,
};

function dependencies(overrides: Partial<WorkerDependencies> = {}): WorkerDependencies {
  return {
    claim: async () => [],
    run: async () => [],
    wait: async () => {},
    reportError: () => {},
    ...overrides,
  };
}

test('claims no more than concurrency and finishes a batch before the next claim', async () => {
  const calls: string[] = [];
  const worker = createIngestionWorker(
    dependencies({
      claim: async (limit) => {
        assert.equal(limit, 8);
        calls.push('claim');
        if (calls.length > 1) {
          worker.stop();
          return [];
        }
        return [job];
      },
      run: async () => {
        calls.push('start');
        await Promise.resolve();
        calls.push('finish');
        return [{ job_id: job.id, kind: 'succeeded', chunkCount: 1 }];
      },
    }),
  );
  await worker.start();
  assert.deepEqual(calls, ['claim', 'start', 'finish', 'claim']);
  assert.equal(worker.status().succeeded, 1);
});

test('an empty queue waits five seconds before polling again', async () => {
  const worker = createIngestionWorker(
    dependencies({
      wait: async (milliseconds) => {
        assert.equal(milliseconds, 5_000);
        worker.stop();
      },
    }),
  );
  await worker.start();
  assert.equal(worker.status().processed, 0);
  assert.equal(worker.status().ready, true);
});

test('provider retries wait two minutes before another claim', async () => {
  const worker = createIngestionWorker(
    dependencies({
      claim: async () => [job],
      run: async () => [
        {
          job_id: job.id,
          kind: 'retrying',
          stage: 'fetch',
          detail: 'Please wait',
          rateLimited: true,
        },
      ],
      wait: async (milliseconds) => {
        assert.equal(milliseconds, 120_000);
        worker.stop();
      },
    }),
  );
  await worker.start();
  assert.equal(worker.status().retrying, 1);
});

test('a claim failure is reported and retried after two minutes', async () => {
  const failure = new Error('Database unavailable');
  const reported: unknown[] = [];
  const worker = createIngestionWorker(
    dependencies({
      claim: async () => {
        throw failure;
      },
      reportError: (error) => {
        reported.push(error);
      },
      wait: async (milliseconds) => {
        assert.equal(milliseconds, 120_000);
        worker.stop();
      },
    }),
  );
  await worker.start();
  assert.deepEqual(reported, [failure]);
  assert.equal(worker.status().ready, false);
});

test('shutdown finishes already claimed jobs and prevents another claim', async () => {
  const calls: string[] = [];
  const worker = createIngestionWorker(
    dependencies({
      claim: async () => {
        calls.push('claim');
        worker.stop();
        return [job];
      },
      run: async () => {
        calls.push('finish');
        return [{ job_id: job.id, kind: 'unchanged' }];
      },
    }),
  );
  await worker.start();
  assert.deepEqual(calls, ['claim', 'finish']);
  assert.equal(worker.status().running, false);
  assert.equal(worker.status().stopping, true);
  assert.equal(worker.status().processed, 1);
});
