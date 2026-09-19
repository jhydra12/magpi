import { describe, expect, it } from 'vitest';

import {
  fetchAnswerLatency,
  fetchDeadContent,
  fetchIngestHealth,
  fetchPlanUsage,
  fetchTopQuestions,
  type AnalyticsClient,
} from './queries';

type StubResponse = {
  readonly data?: unknown;
  readonly count?: number;
  readonly error?: { readonly message: string };
};

type RecordedCall = readonly [string, ...unknown[]];

type Stub = {
  readonly client: AnalyticsClient;
  readonly callsFor: (source: string) => readonly RecordedCall[];
  /** One entry per `.from()`, in call order, holding that query's whole chain. */
  readonly tableQueries: () => readonly (readonly RecordedCall[])[];
};

/** A postgrest builder that records the chain instead of talking to a database. */
function createStub(responses: Readonly<Record<string, readonly StubResponse[]>>): Stub {
  const calls = new Map<string, RecordedCall[]>();
  const queues = new Map<string, StubResponse[]>(
    Object.entries(responses).map(([source, list]) => [source, [...list]]),
  );

  function builderFor(source: string, initial: RecordedCall): unknown {
    const recorded = calls.get(source) ?? [];
    recorded.push(initial);
    calls.set(source, recorded);

    // Claimed when the builder is created, so concurrent queries read back in source order.
    const next = queues.get(source)?.shift();
    if (!next) throw new Error(`stub has no response left for ${source}`);
    const settled = {
      data: next.data ?? null,
      count: next.count ?? null,
      error: next.error ?? null,
    };

    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(settled).then(resolve),
    };

    for (const method of [
      'select',
      'eq',
      'in',
      'is',
      'gte',
      'lte',
      'range',
      'order',
      'limit',
      'single',
    ]) {
      builder[method] = (...args: unknown[]) => {
        recorded.push([method, ...args]);
        return builder;
      };
    }

    return builder;
  }

  const client = {
    from: (table: string) => builderFor(table, ['from', table]),
    rpc: (name: string, args: unknown) => builderFor(name, ['rpc', name, args]),
  } as unknown as AnalyticsClient;

  // Table reads only. An rpc closes the current group rather than opening an empty one.
  function tableQueries(): readonly (readonly RecordedCall[])[] {
    const queries: RecordedCall[][] = [];
    let current: RecordedCall[] | null = null;

    for (const recorded of calls.values()) {
      for (const call of recorded) {
        if (call[0] === 'from') {
          current = [call];
          queries.push(current);
        } else if (call[0] === 'rpc') {
          current = null;
        } else {
          current?.push(call);
        }
      }
    }
    return queries;
  }

  return { client, callsFor: (source) => calls.get(source) ?? [], tableQueries };
}

const ORG = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-09T14:20:00.000Z');

describe('ingest health', () => {
  it('reports documents pulled and the reason the last job died, per connection', async () => {
    const stub = createStub({
      connections: [
        {
          data: [
            {
              id: 'c1',
              provider: 'notion',
              status: 'error',
              status_detail: 'token expired',
              last_synced_at: '2026-09-08T02:00:00.000Z',
              documents: [{ count: 42 }],
            },
          ],
        },
      ],
      ingest_jobs: [
        {
          data: [
            {
              connection_id: 'c1',
              status: 'timeout',
              stage: 'embed',
              error: 'wall clock exceeded',
              updated_at: '2026-09-08T02:04:00.000Z',
            },
            {
              connection_id: 'c1',
              status: 'failed',
              stage: 'fetch',
              error: '401 from Notion',
              updated_at: '2026-09-07T02:00:00.000Z',
            },
          ],
        },
      ],
    });

    const rows = await fetchIngestHealth(stub.client, ORG);

    expect(rows).toEqual([
      {
        connectionId: 'c1',
        provider: 'notion',
        status: 'error',
        statusDetail: 'token expired',
        lastSyncedAt: '2026-09-08T02:00:00.000Z',
        documentsPulled: 42,
        recentFailures: 2,
        latestFailure: { status: 'timeout', stage: 'embed', error: 'wall clock exceeded' },
      },
    ]);
  });

  it('asks only for the failed and timed out jobs of one organization', async () => {
    const stub = createStub({
      connections: [{ data: [] }],
      ingest_jobs: [{ data: [] }],
    });

    await fetchIngestHealth(stub.client, ORG);

    expect(stub.callsFor('ingest_jobs')).toContainEqual(['eq', 'org_id', ORG]);
    expect(stub.callsFor('ingest_jobs')).toContainEqual(['in', 'status', ['failed', 'timeout']]);
    expect(stub.callsFor('connections')).toContainEqual(['eq', 'org_id', ORG]);
  });

  it('reports a healthy connection with no failure', async () => {
    const stub = createStub({
      connections: [
        {
          data: [
            {
              id: 'c1',
              provider: 'linear',
              status: 'active',
              status_detail: null,
              last_synced_at: null,
              documents: [],
            },
          ],
        },
      ],
      ingest_jobs: [{ data: [] }],
    });

    const rows = await fetchIngestHealth(stub.client, ORG);

    expect(rows[0].documentsPulled).toBe(0);
    expect(rows[0].recentFailures).toBe(0);
    expect(rows[0].latestFailure).toBeNull();
  });

  it('throws when the database refuses the query', async () => {
    const stub = createStub({
      connections: [{ error: { message: 'permission denied' } }],
      ingest_jobs: [{ data: [] }],
    });

    await expect(fetchIngestHealth(stub.client, ORG)).rejects.toThrow('permission denied');
  });
});

describe('answer latency', () => {
  it('buckets assistant answers by day', async () => {
    const stub = createStub({
      messages: [
        {
          data: [
            { created_at: '2026-09-09T09:00:00.000Z', latency_ms: 300 },
            { created_at: '2026-09-09T10:00:00.000Z', latency_ms: 1200 },
          ],
        },
      ],
    });

    const days = await fetchAnswerLatency(stub.client, ORG, { days: 2, now: NOW });

    expect(days).toHaveLength(2);
    expect(days[1]).toEqual({ day: '2026-09-09', queries: 2, p50Ms: 300, p95Ms: 1200 });
  });

  it('reads only assistant turns inside this organization', async () => {
    const stub = createStub({ messages: [{ data: [] }] });

    await fetchAnswerLatency(stub.client, ORG, { days: 30, now: NOW });

    const calls = stub.callsFor('messages');
    expect(calls).toContainEqual(['eq', 'conversations.org_id', ORG]);
    expect(calls).toContainEqual(['eq', 'role', 'assistant']);
    expect(calls).toContainEqual(['gte', 'created_at', '2026-08-11T00:00:00.000Z']);
  });

  it('throws when the database refuses the query', async () => {
    const stub = createStub({ messages: [{ error: { message: 'nope' } }] });

    await expect(fetchAnswerLatency(stub.client, ORG, { days: 7, now: NOW })).rejects.toThrow(
      'nope',
    );
  });
});

describe('top questions', () => {
  it('ranks what people actually asked', async () => {
    const stub = createStub({
      messages: [
        {
          data: [
            { content: 'Where is the runbook?', created_at: '2026-09-09T09:00:00.000Z' },
            { content: 'where is the runbook', created_at: '2026-09-08T09:00:00.000Z' },
            { content: 'How do I rotate a key?', created_at: '2026-09-07T09:00:00.000Z' },
          ],
        },
      ],
    });

    const top = await fetchTopQuestions(stub.client, ORG, { days: 30, limit: 10, now: NOW });

    expect(top[0]).toEqual({
      question: 'Where is the runbook?',
      askedCount: 2,
      lastAskedAt: '2026-09-09T09:00:00.000Z',
    });
    expect(top).toHaveLength(2);
  });

  it('reads only user turns inside this organization', async () => {
    const stub = createStub({ messages: [{ data: [] }] });

    await fetchTopQuestions(stub.client, ORG, { days: 30, limit: 10, now: NOW });

    const calls = stub.callsFor('messages');
    expect(calls).toContainEqual(['eq', 'conversations.org_id', ORG]);
    expect(calls).toContainEqual(['eq', 'role', 'user']);
  });

  it('throws when the database refuses the query', async () => {
    const stub = createStub({ messages: [{ error: { message: 'nope' } }] });

    await expect(
      fetchTopQuestions(stub.client, ORG, { days: 30, limit: 10, now: NOW }),
    ).rejects.toThrow('nope');
  });
});

describe('dead content', () => {
  it('counts what has never been retrieved and samples the oldest of it', async () => {
    const stub = createStub({
      documents: [
        { count: 120 },
        { count: 74 },
        {
          data: [
            {
              id: 'd1',
              title: 'Q1 offsite notes',
              space_id: 's1',
              origin: 'sync',
              created_at: '2026-02-01T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    const dead = await fetchDeadContent(stub.client, ORG, { sampleSize: 10 });

    expect(dead.totalDocuments).toBe(120);
    expect(dead.neverRetrieved).toBe(74);
    expect(dead.samples).toEqual([
      {
        id: 'd1',
        title: 'Q1 offsite notes',
        spaceId: 's1',
        origin: 'sync',
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
  });

  it('filters the sample to documents with no retrieval', async () => {
    const stub = createStub({ documents: [{ count: 0 }, { count: 0 }, { data: [] }] });

    await fetchDeadContent(stub.client, ORG, { sampleSize: 10 });

    expect(stub.callsFor('documents')).toContainEqual(['is', 'last_retrieved_at', null]);
  });

  it('throws when the database refuses the query', async () => {
    const stub = createStub({
      documents: [{ error: { message: 'nope' } }, { count: 0 }, { data: [] }],
    });

    await expect(fetchDeadContent(stub.client, ORG, { sampleSize: 10 })).rejects.toThrow('nope');
  });
});

describe('usage against plan', () => {
  it('reads metered usage rather than counting documents', async () => {
    const stub = createStub({
      organizations: [
        {
          data: {
            plan: 'free',
            seats: 1,
            stripe_customer_id: null,
            stripe_subscription_id: null,
          },
        },
      ],
      org_members: [{ count: 3 }],
      org_usage_totals: [{ data: { documents: 88, queries: 140, storage_bytes: 1_400_000_000 } }],
      plan_document_limit: [{ data: 200 }],
      plan_monthly_query_limit: [{ data: 500 }],
    });

    const usage = await fetchPlanUsage(stub.client, ORG, { now: NOW });

    expect(usage).toEqual({
      plan: 'free',
      documents: { used: 88, limit: 200 },
      queries: { used: 140, limit: 500 },
      seats: { used: 3, limit: 1 },
      storageBytes: { used: 1_400_000_000, limit: null },
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    expect(stub.callsFor('documents')).toEqual([]);
  });

  it('counts queries from the start of the current month', async () => {
    const stub = createStub({
      organizations: [
        {
          data: {
            plan: 'team',
            seats: 5,
            stripe_customer_id: 'cus_1',
            stripe_subscription_id: 'sub_1',
          },
        },
      ],
      org_members: [{ count: 5 }],
      org_usage_totals: [{ data: { documents: 0, queries: 0, storage_bytes: 0 } }],
      plan_document_limit: [{ data: 25000 }],
      plan_monthly_query_limit: [{ data: 50000 }],
    });

    const usage = await fetchPlanUsage(stub.client, ORG, { now: NOW });

    // The window is the database function's argument, so a monthly limit is not read over all time.
    expect(stub.callsFor('org_usage_totals')).toContainEqual([
      'rpc',
      'org_usage_totals',
      { p_org_id: ORG, p_month_start: '2026-09-01T00:00:00.000Z' },
    ]);
    expect(usage.documents.used).toBe(0);
    expect(usage.stripeCustomerId).toBe('cus_1');
  });

  it('throws when the organization cannot be read', async () => {
    const stub = createStub({
      organizations: [{ error: { message: 'permission denied' } }],
      org_members: [{ count: 0 }],
      org_usage_totals: [{ data: { documents: 0, queries: 0, storage_bytes: 0 } }],
    });

    await expect(fetchPlanUsage(stub.client, ORG, { now: NOW })).rejects.toThrow(
      'permission denied',
    );
  });
});

describe('organization scoping', () => {
  /** Every table query any panel issues has to filter on the organization id. */
  const panels: readonly (readonly [string, (stub: Stub) => Promise<unknown>])[] = [
    ['ingest health', (stub) => fetchIngestHealth(stub.client, ORG)],
    ['answer latency', (stub) => fetchAnswerLatency(stub.client, ORG, { days: 7, now: NOW })],
    [
      'top questions',
      (stub) => fetchTopQuestions(stub.client, ORG, { days: 7, limit: 5, now: NOW }),
    ],
    ['dead content', (stub) => fetchDeadContent(stub.client, ORG, { sampleSize: 5 })],
    ['plan usage', (stub) => fetchPlanUsage(stub.client, ORG, { now: NOW })],
  ];

  function emptyStub(): Stub {
    const empty = { data: [] };
    return createStub({
      connections: [empty],
      ingest_jobs: [empty],
      messages: [empty],
      documents: [{ count: 0 }, { count: 0 }, empty],
      organizations: [
        {
          data: { plan: 'free', seats: 1, stripe_customer_id: null, stripe_subscription_id: null },
        },
      ],
      org_members: [{ count: 0 }],
      org_usage_totals: [{ data: { documents: 0, queries: 0, storage_bytes: 0 } }],
      plan_document_limit: [{ data: 200 }],
      plan_monthly_query_limit: [{ data: 500 }],
    });
  }

  // The meters moved to an rpc, which tableQueries does not see, so this covers them.
  it('scopes the usage totals to one organization through its argument', async () => {
    const stub = emptyStub();
    await fetchPlanUsage(stub.client, ORG, { now: NOW });

    const [call] = stub.callsFor('org_usage_totals');
    expect(call?.[2]).toMatchObject({ p_org_id: ORG });
  });

  for (const [name, run] of panels) {
    it(`filters every table query in ${name} to one organization`, async () => {
      const stub = emptyStub();
      await run(stub);

      const queries = stub.tableQueries();
      expect(queries.length).toBeGreaterThan(0);

      for (const query of queries) {
        const filters = query.filter((call) => call[0] === 'eq' && call[2] === ORG);
        expect({ table: query[0][1], filters: filters.length }).toEqual({
          table: query[0][1],
          filters: 1,
        });
      }
    });
  }
});

it('includes activity after the first thousand messages', async () => {
  const stub = createStub({
    messages: [
      {
        data: Array.from({ length: 1000 }, () => ({
          created_at: '2026-09-08T09:00:00.000Z',
          latency_ms: 100,
        })),
      },
      { data: [{ created_at: '2026-09-09T09:00:00.000Z', latency_ms: 200 }] },
    ],
  });
  const days = await fetchAnswerLatency(stub.client, ORG, { days: 2, now: NOW });
  expect(days.map((day) => day.queries)).toEqual([1000, 1]);
});
it('ranks questions using every page in the requested period', async () => {
  const stub = createStub({
    messages: [
      {
        data: Array.from({ length: 1000 }, () => ({
          created_at: '2026-09-08T09:00:00.000Z',
          content: 'Question',
        })),
      },
      { data: [{ created_at: '2026-09-09T09:00:00.000Z', content: 'Question' }] },
    ],
  });
  const rows = await fetchTopQuestions(stub.client, ORG, { days: 2, limit: 10, now: NOW });
  expect(rows[0].askedCount).toBe(1001);
});
