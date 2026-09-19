import { assertEquals, assertRejects } from '@std/assert';

import { ApiError } from '../_shared/errors.ts';
import { claimQueuedRow } from '../_shared/jobs/claim.ts';
import { type StubDb, stubDb } from '../_shared/testing/stub_db.ts';
import { startManualDream, startManualRun } from './start.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const ORG = '44444444-4444-4444-8444-444444444444';
const SPACE = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';
const RUN = '66666666-6666-4666-8666-666666666666';

const INPUT = { orgId: ORG, spaceId: SPACE, kind: 'digest', triggeredBy: USER } as const;

/** A stub holding one dream_runs row, answering conditional updates the way PostgREST does. */
function withRuns(): StubDb {
  const rows = new Map<string, Record<string, unknown>>();

  return stubDb((request) => {
    if (request.table !== 'dream_runs') return undefined;

    if (request.method === 'POST') {
      const row = { id: RUN, ...(request.body as Record<string, unknown>) };
      rows.set(RUN, row);
      return { body: row };
    }

    if (request.method === 'PATCH') {
      const row = rows.get(RUN);
      if (!row) return { body: null };
      if (request.query.includes('status=eq.queued') && row.status !== 'queued') {
        return { body: null };
      }
      Object.assign(row, request.body as Record<string, unknown>);
      return { body: { id: RUN } };
    }

    return undefined;
  });
}

function inserted(stub: StubDb): Record<string, unknown> {
  const post = stub.requests.find((request) =>
    request.table === 'dream_runs' && request.method === 'POST'
  );
  return (post?.body ?? {}) as Record<string, unknown>;
}

Deno.test('a manual run waits until exactly one worker claims it', async () => {
  const stub = withRuns();
  try {
    const run = await startManualRun(stub.db, INPUT);

    // Submission creates queued work; a competing worker must lose the second claim.
    const stolen = await claimQueuedRow(stub.db, 'dream_runs', run.id, {
      status: 'running',
      started_at: NOW.toISOString(),
    });

    assertEquals(stolen, true);
    assertEquals(await claimQueuedRow(stub.db, 'dream_runs', run.id, { status: 'running' }), false);
    assertEquals(run.id, RUN);
    assertEquals(run.space_id, SPACE);
    assertEquals(run.kind, 'digest');
  } finally {
    await stub.close();
  }
});

Deno.test('a manual run records its author and has no start time before a worker claims it', async () => {
  const stub = withRuns();
  try {
    await startManualRun(stub.db, INPUT);

    // Waiting in the queue does not count against the processing time budget.
    const row = inserted(stub);
    assertEquals(row.started_at, null);
    assertEquals(row.org_id, ORG);
    assertEquals(row.triggered_by, USER);
    assertEquals(row.status, 'queued');
  } finally {
    await stub.close();
  }
});

Deno.test('a run the database refused is an error the caller can answer', async () => {
  const stub = stubDb((request) =>
    request.table === 'dream_runs' ? { body: { message: 'nope' }, status: 500 } : undefined
  );
  try {
    await assertRejects(() => startManualRun(stub.db, INPUT), ApiError);
  } finally {
    await stub.close();
  }
});

const DREAM_ROWS = ['entities', 'digest', 'connections'].map((kind, index) => ({
  id: `66666666-6666-4666-8666-66666666666${index}`,
  org_id: ORG,
  space_id: SPACE,
  kind,
}));

for (const kind of [undefined, 'all'] as const) {
  Deno.test(`a ${kind ?? 'default'} Dream queues all three tasks together`, async () => {
    const stub = stubDb(() => ({ body: DREAM_ROWS.toReversed() }));
    try {
      const runs = await startManualDream(stub.db, { ...INPUT, kind });
      assertEquals(runs, DREAM_ROWS);
      assertEquals(stub.requests.length, 1);
      const request = stub.requests[0];
      assertEquals(request.method, 'POST');
      assertEquals(request.table, 'dream_runs');
      const body: unknown = request.body;
      if (!Array.isArray(body)) throw new Error('Expected one bulk insert');
      assertEquals(body.length, 3);
      const createdAt: unknown = body[0].created_at;
      assertEquals(typeof createdAt, 'string');
      assertEquals(
        body,
        DREAM_ROWS.map((row) => ({
          org_id: ORG,
          space_id: SPACE,
          kind: row.kind,
          status: 'queued',
          started_at: null,
          triggered_by: USER,
          created_at: createdAt,
        })),
      );
    } finally {
      await stub.close();
    }
  });
}

Deno.test('an explicit single-task Dream still creates only that task', async () => {
  const stub = withRuns();
  try {
    const runs = await startManualDream(stub.db, INPUT);
    assertEquals(runs.length, 1);
    assertEquals(runs[0].kind, 'digest');
    assertEquals(stub.requests.length, 1);
    assertEquals(inserted(stub).kind, 'digest');
  } finally {
    await stub.close();
  }
});

Deno.test('a refused bulk Dream fails without submitting tasks separately', async () => {
  const stub = stubDb(() => ({ body: { message: 'insertion refused' }, status: 400 }));
  try {
    await assertRejects(() => startManualDream(stub.db, { ...INPUT, kind: 'all' }), ApiError);
    assertEquals(stub.requests.length, 1);
  } finally {
    await stub.close();
  }
});

for (
  const rows of [[], DREAM_ROWS.slice(0, 2), [...DREAM_ROWS, DREAM_ROWS[0]], [
    DREAM_ROWS[0],
    DREAM_ROWS[0],
    DREAM_ROWS[2],
  ], DREAM_ROWS.map((row) => ({ ...row, kind: 'digest' }))]
) {
  Deno.test(`a Dream rejects incomplete or duplicate returned jobs: ${JSON.stringify(rows)}`, async () => {
    const stub = stubDb(() => ({ body: rows }));
    try {
      await assertRejects(() => startManualDream(stub.db, { ...INPUT, kind: 'all' }), ApiError);
      assertEquals(stub.requests.length, 1);
    } finally {
      await stub.close();
    }
  });
}
