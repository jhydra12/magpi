import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDreamWorker, type DreamWorkerDependencies } from '../src/dream-worker.ts';
import { dreamBudgetMs, timedFetch } from '../src/dream-runtime.ts';

function dependencies(overrides: Partial<DreamWorkerDependencies> = {}): DreamWorkerDependencies {
  return {
    drain: async () => ({ results: [], contended: 0, selected: 0 }),
    wait: async () => {},
    reportError: () => {},
    ...overrides,
  };
}

test('Dream claims one run by default and immediately retries after losing a claim', async () => {
  let calls = 0;
  const worker = createDreamWorker(
    dependencies({
      drain: async (limit) => {
        assert.equal(limit, 1);
        calls++;
        if (calls === 2) worker.stop();
        return { results: [], contended: 1, selected: 1 };
      },
      wait: async () => {
        assert.fail('a contended queue still has work');
      },
    }),
  );
  await worker.start();
  assert.equal(calls, 2);
  assert.equal(worker.status().contended, 2);
});

test('Dream waits only when its queue is empty', async () => {
  const worker = createDreamWorker(
    dependencies({
      wait: async (delay) => {
        assert.equal(delay, 5_000);
        worker.stop();
      },
    }),
  );
  await worker.start();
  assert.equal(worker.status().ready, true);
});

test('Dream shutdown waits for the current batch and makes no further claim', async () => {
  let calls = 0;
  const worker = createDreamWorker(
    dependencies({
      drain: async (limit) => {
        assert.equal(limit, 2);
        calls++;
        worker.stop();
        await Promise.resolve();
        return {
          selected: 2,
          contended: 0,
          results: [
            { run_id: 'a', kind: 'failed', detail: 'failed' },
            {
              run_id: 'b',
              kind: 'succeeded',
              inputDocumentCount: 1,
              produced: 1,
              outputDocumentId: 'doc',
            },
          ],
        };
      },
    }),
    2,
  );
  await worker.start();
  assert.equal(calls, 1);
  assert.equal(worker.status().succeeded, 1);
  assert.equal(worker.status().failed, 1);
  assert.equal(worker.status().running, false);
});

test('Dream reports a queue failure and waits before retrying', async () => {
  const errors: unknown[] = [];
  const worker = createDreamWorker(
    dependencies({
      drain: async () => {
        throw new Error('offline');
      },
      reportError: (error) => {
        errors.push(error);
      },
      wait: async (delay) => {
        assert.equal(delay, 5_000);
        worker.stop();
      },
    }),
  );
  await worker.start();
  assert.equal(errors.length, 1);
  assert.equal(worker.status().ready, false);
});

test('Dream rejects budgets and concurrency that cannot finish before abandonment', () => {
  assert.equal(dreamBudgetMs(undefined), 300_000);
  assert.throws(() => dreamBudgetMs('900000'));
  assert.throws(() => dreamBudgetMs('NaN'));
  assert.throws(() => createDreamWorker(dependencies(), 0));
  assert.throws(() => createDreamWorker(dependencies(), 33));
});

test('bounded fetch preserves caller cancellation and the job deadline', async () => {
  const caller = new AbortController();
  const deadline = new AbortController();
  const observed: AbortSignal[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.signal) observed.push(init.signal);
    return new Response('ok');
  };
  await timedFetch(
    fetcher,
    60_000,
    deadline.signal,
  )('https://example.test', { signal: caller.signal });
  caller.abort();
  assert.equal(observed[0].aborted, true);
  await timedFetch(fetcher, 60_000, deadline.signal)('https://example.test');
  deadline.abort();
  assert.equal(observed[1].aborted, true);
});

test('bounded fetch aborts a request that stops responding', async () => {
  const fetcher: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('request aborted')), {
        once: true,
      });
    });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(timedFetch(fetcher, 5)('https://example.test'), /request aborted/);
  } finally {
    clearTimeout(keepAlive);
  }
});
