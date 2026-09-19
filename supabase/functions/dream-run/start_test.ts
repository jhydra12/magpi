import { assertEquals, assertRejects } from '@std/assert';
import { ApiError } from '../_shared/errors.ts';
import { stubDb } from '../_shared/testing/stub_db.ts';
import { authorizeDream, startManualDream } from './start.ts';
const ORG = '44444444-4444-4444-8444-444444444444';
const SPACE = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';
const INPUT = { orgId: ORG, spaceId: SPACE, kind: 'digest', triggeredBy: USER } as const;
const DREAM_ROWS = ['entities', 'digest', 'connections'].map((kind, index) => ({
  id: `66666666-6666-4666-8666-66666666666${index}`,
  org_id: ORG,
  space_id: SPACE,
  kind,
}));
for (const kind of [undefined, 'all', 'digest'] as const) {
  Deno.test(`manual ${kind ?? 'default'} submission uses one authorized atomic enqueue`, async () => {
    const rows = kind === 'digest' ? DREAM_ROWS.filter((row) => row.kind === kind) : DREAM_ROWS;
    const stub = stubDb(() => ({ body: rows.toReversed() }));
    try {
      assertEquals(await startManualDream(stub.db, { ...INPUT, kind }), rows);
      assertEquals(stub.requests.length, 1);
      assertEquals(stub.requests[0].table, 'rpc/enqueue_dream');
      assertEquals(stub.requests[0].body, {
        p_org_id: ORG,
        p_space_id: SPACE,
        p_user_id: USER,
        p_kinds: rows.map((row) => row.kind),
      });
    } finally {
      await stub.close();
    }
  });
}
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

Deno.test('forbidden Dream requests do not consume another space quota', async () => {
  const stub = stubDb((request) =>
    request.table === 'rpc/consume_rate_limit'
      ? { body: { allowed: true, remaining: 199, retry_after_s: 0 } }
      : { body: null }
  );
  try {
    await assertRejects(() => authorizeDream(stub.db, USER, SPACE), ApiError);
    assertEquals(
      stub.requests.filter((r) => r.table === 'rpc/consume_rate_limit').map((r) => r.body),
      [
        { p_bucket: `dream-run:user:${USER}`, p_limit: 200, p_window_s: 3600 },
      ],
    );
  } finally {
    await stub.close();
  }
});
