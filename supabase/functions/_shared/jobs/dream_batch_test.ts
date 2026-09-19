import { assertEquals } from '@std/assert';

import { stubDb, type StubRequest } from '../testing/stub_db.ts';
import { runDreamBatch } from './dream_batch.ts';
import type { DreamResult, DreamRunRecord } from './dream.ts';
import type { JobDeps } from './types.ts';

const ORG = '44444444-4444-4444-8444-444444444444';
const SPACE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-09-09T12:00:00.000Z');

function dreamRun(id: string, kind: DreamRunRecord['kind'] = 'digest'): DreamRunRecord {
  return { id, org_id: ORG, space_id: SPACE, kind };
}

function jobDeps(db: JobDeps['db']): JobDeps {
  return {
    db,
    http: {
      fetch: () => Promise.reject(new Error('the batch makes no direct http call')),
      now: () => new Date(NOW.getTime()),
    },
    models: {
      embed: () => Promise.reject(new Error('the batch calls no model')),
      complete: () => Promise.reject(new Error('the batch calls no model')),
    },
    uploads: { read: () => Promise.reject(new Error('the batch reads no uploads')) },
  };
}

/** A claim is a filtered PATCH: the rows it matched are the rows this caller won. */
function claimsAllBut(lost: string[]) {
  return (request: StubRequest): { body: unknown } => {
    const id = /id=eq\.([^&]+)/.exec(request.query)?.[1] ?? '';
    return { body: lost.includes(id) ? [] : [{ id }] };
  };
}

const SUCCEEDED: DreamResult = {
  kind: 'succeeded',
  produced: 1,
  inputDocumentCount: 1,
  outputDocumentId: null,
};

Deno.test('every run the caller claimed comes back, in the order it was given', async () => {
  const stub = stubDb(claimsAllBut([]));
  try {
    const runs = [dreamRun('run-a'), dreamRun('run-b'), dreamRun('run-c')];
    const outcome = await runDreamBatch(runs, jobDeps(stub.db), () => Promise.resolve(SUCCEEDED));
    assertEquals(outcome.results.map((result) => result.run_id), ['run-a', 'run-b', 'run-c']);
    assertEquals(outcome.contended, 0);
  } finally {
    await stub.close();
  }
});

Deno.test('a run another worker took is counted, not run twice', async () => {
  const stub = stubDb(claimsAllBut(['run-b']));
  const ran: string[] = [];
  try {
    const runs = [dreamRun('run-a'), dreamRun('run-b'), dreamRun('run-c')];
    const outcome = await runDreamBatch(runs, jobDeps(stub.db), (run) => {
      ran.push(run.id);
      return Promise.resolve(SUCCEEDED);
    });
    assertEquals(ran.sort(), ['run-a', 'run-c']);
    assertEquals(outcome.contended, 1);
    assertEquals(outcome.results.map((result) => result.run_id), ['run-a', 'run-c']);
  } finally {
    await stub.close();
  }
});

// The point of the batch. Each run here finishes only once all three have started, so a loop that
// waits for one run before starting the next never reaches the third and the race below reports it.
Deno.test('the runs are in flight together rather than one after another', async () => {
  const stub = stubDb(claimsAllBut([]));
  let started = 0;
  let allStarted = () => {};
  const together = new Promise<void>((resolve) => {
    allStarted = resolve;
  });
  const timer = Promise.withResolvers<'sequential'>();
  const handle = setTimeout(() => timer.resolve('sequential'), 2000);

  try {
    const runs = [dreamRun('run-a'), dreamRun('run-b'), dreamRun('run-c')];
    const batch = runDreamBatch(runs, jobDeps(stub.db), async () => {
      started += 1;
      if (started === runs.length) allStarted();
      await together;
      return SUCCEEDED;
    });

    assertEquals(
      await Promise.race([batch.then(() => 'together' as const), timer.promise]),
      'together',
    );
  } finally {
    clearTimeout(handle);
    timer.resolve('sequential');
    await stub.close();
  }
});

Deno.test('an unexpected run failure does not discard a sibling result', async () => {
  const stub = stubDb(claimsAllBut([]));
  try {
    const outcome = await runDreamBatch(
      [dreamRun('run-a'), dreamRun('run-b')],
      jobDeps(stub.db),
      (run) => {
        if (run.id === 'run-a') throw new Error('unexpected');
        return Promise.resolve(SUCCEEDED);
      },
    );
    assertEquals(outcome.results.map((result) => result.kind), ['failed', 'succeeded']);
    assertEquals(
      stub.requests.some((request) => request.query.includes('status=eq.running')),
      true,
    );
  } finally {
    await stub.close();
  }
});

Deno.test('two workers observing the same queued run execute it once', async () => {
  let queued = true;
  let executed = 0;
  const stub = stubDb(() => {
    const won = queued;
    queued = false;
    return { body: won ? [{ id: 'run-a' }] : [] };
  });
  try {
    const runOne = (): Promise<DreamResult> => {
      executed++;
      return Promise.resolve(SUCCEEDED);
    };
    const outcomes = await Promise.all([
      runDreamBatch([dreamRun('run-a')], jobDeps(stub.db), runOne),
      runDreamBatch([dreamRun('run-a')], jobDeps(stub.db), runOne),
    ]);
    assertEquals(executed, 1);
    assertEquals(outcomes.reduce((total, outcome) => total + outcome.contended, 0), 1);
  } finally {
    await stub.close();
  }
});

Deno.test('a failed claim waits for already started siblings before rejecting the batch', async () => {
  let siblingFinished = false;
  const stub = stubDb((request) =>
    request.query.includes('id=eq.run-a')
      ? { status: 500, body: { message: 'database unavailable' } }
      : { body: [{ id: 'run-b' }] }
  );
  try {
    await runDreamBatch([dreamRun('run-a'), dreamRun('run-b')], jobDeps(stub.db), async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      siblingFinished = true;
      return SUCCEEDED;
    }).then(() => {
      throw new Error('the claim failure must reach the polling loop');
    }, () => {
      assertEquals(siblingFinished, true);
    });
  } finally {
    await stub.close();
  }
});
