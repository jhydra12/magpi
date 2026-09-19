import { assert, assertEquals } from '@std/assert';

import { EMBEDDING_DIMENSIONS } from '../models.ts';
import { encryptProviderToken } from '../provider_tokens.ts';
import { envSource } from '../testing/assertions.ts';
import { type StubDb, stubDb, type StubRequest } from '../testing/stub_db.ts';
import { type IngestJobRecord, runIngestJob } from './ingest.ts';
import { capturedErrors, fakeModel, fakeUploads, jumpingClock, steppingClock } from './testing.ts';
import type { JobDeps } from './types.ts';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const ORG = '44444444-4444-4444-8444-444444444444';
const SPACE = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';

const ENV = envSource({
  SB_TOKEN_ENC_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  SB_TOKEN_ENC_KEY_ID: '1',
  SB_NOTION_CLIENT_ID: 'notion-client',
  SB_NOTION_CLIENT_SECRET: 'notion-secret',
});

/** The five stages a job can stop in, in the order it reaches them. */
const INGEST_STAGES = ['fetch', 'extract', 'chunk', 'embed', 'store'];

const JOB: IngestJobRecord = {
  id: 'job-1',
  org_id: ORG,
  space_id: SPACE,
  document_id: 'document-1',
  connection_id: null,
  attempts: 1,
};

function uploadDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'document-1',
    org_id: ORG,
    space_id: SPACE,
    connection_id: null,
    external_id: null,
    title: 'Runbook',
    url: null,
    mime_type: 'text/markdown',
    storage_path: 'uploads/runbook.md',
    content_hash: null,
    version: 1,
    size_bytes: null,
    ...overrides,
  };
}

function replacement(stub: StubDb): Record<string, unknown> {
  return (stub.requests.find((r) => r.table === 'rpc/replace_document_chunks')?.body ??
    {}) as Record<string, unknown>;
}

function writes(stub: StubDb, table: string, method = 'PATCH'): Record<string, unknown>[] {
  if (table === 'documents') {
    return replacement(stub).p_metadata
      ? [replacement(stub).p_metadata as Record<string, unknown>]
      : [];
  }
  return stub.requests
    .filter((request) => request.table === table && request.method === method)
    .map((request) => request.body as Record<string, unknown>);
}

function rowsInserted(stub: StubDb, table: string): Record<string, unknown>[] {
  if (table === 'chunks') return (replacement(stub).p_chunks ?? []) as Record<string, unknown>[];
  return stub.requests
    .filter((request) => request.table === table && request.method === 'POST')
    .flatMap((request) => (Array.isArray(request.body) ? request.body : [request.body]))
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

interface Harness {
  stub: StubDb;
  deps: JobDeps;
}

function harness(options: {
  document?: Record<string, unknown>;
  files?: Record<string, string>;
  reply?: (request: StubRequest) => { body?: unknown; status?: number } | undefined;
  clock?: { now(): Date };
  budgetMs?: number;
  fetch?: typeof fetch;
}): Harness {
  const document = options.document ?? uploadDocument();
  const stub = stubDb((request) => {
    const custom = options.reply?.(request);
    if (custom) return custom;
    if (request.table === 'documents' && request.method === 'GET') return { body: [document] };
    return { body: [] };
  });

  return {
    stub,
    deps: {
      db: stub.db,
      http: {
        now: options.clock?.now ?? (() => NOW),
        fetch: options.fetch ?? (() => Promise.reject(new Error('no network in this test'))),
      },
      models: fakeModel(),
      uploads: fakeUploads(options.files ?? { 'uploads/runbook.md': '# Runbook\n\nRestart it.' }),
      env: ENV,
      budgetMs: options.budgetMs,
    },
  };
}

/** A live Notion connection. The token is really encrypted because the job body decrypts it. */
async function notionConnection(): Promise<Record<string, unknown>> {
  const provider = 'notion';
  return {
    id: 'connection-1',
    org_id: ORG,
    user_id: USER,
    provider,
    external_account_id: 'workspace-1',
    access_token_enc: await encryptProviderToken('ntn_token', { userId: USER, provider }, ENV),
    refresh_token_enc: null,
    scopes: [],
    scope_selection: { kind: 'workspace', available: [], routes: { 'workspace-1': SPACE } },
    status: 'active',
    status_detail: null,
    cursor: null,
    token_expires_at: null,
    last_synced_at: null,
  };
}

/** A document with no bytes of its own, read through a connection. */
function sourceDocument(): Record<string, unknown> {
  return uploadDocument({
    storage_path: null,
    connection_id: 'connection-1',
    external_id: 'page-1',
    mime_type: null,
  });
}

/** The connection path, with a provider that answers however the test needs. */
async function sourceHarness(fetch: typeof globalThis.fetch): Promise<Harness> {
  const connection = await notionConnection();
  return harness({
    document: sourceDocument(),
    reply: (request) =>
      request.table === 'connections' && request.method === 'GET'
        ? { body: [connection] }
        : undefined,
    fetch,
  });
}

Deno.test('an uploaded document is extracted, chunked, embedded and stored', async () => {
  const h = harness({});
  try {
    const result = await runIngestJob(JOB, h.deps);

    assertEquals(result.kind, 'succeeded');
    if (result.kind !== 'succeeded') return;
    assertEquals(result.chunkCount, 1);

    const chunks = rowsInserted(h.stub, 'chunks');
    assertEquals(chunks.length, 1);
    assertEquals(replacement(h.stub).p_document_id, 'document-1');
    assertEquals(chunks[0].ordinal, 0);
    assertEquals((chunks[0].embedding as number[]).length, EMBEDDING_DIMENSIONS);
  } finally {
    await h.stub.close();
  }
});

Deno.test('the job walks every stage so progress is visible while it runs', async () => {
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    // No 'fetch' write: claim_ingest_jobs set the row running and the column defaults to fetch.
    const stages = writes(h.stub, 'ingest_jobs').map((row) => row.stage);
    assertEquals(stages, ['extract', 'chunk', 'embed', 'store', 'store']);
    assertEquals(writes(h.stub, 'ingest_jobs').at(-1)?.status, 'succeeded');
  } finally {
    await h.stub.close();
  }
});

Deno.test('the job body does not rewrite the claim it was handed', async () => {
  // claimed_at is how long a job has been held, so the body must not rewrite it.
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    for (const write of writes(h.stub, 'ingest_jobs')) {
      assertEquals(write.claimed_at, undefined, 'the body overwrote the claim time');
      assertEquals(write.attempts, undefined, 'the body overwrote the attempt count');
    }
  } finally {
    await h.stub.close();
  }
});

Deno.test('chunk replacement and metadata are sent as one transaction', async () => {
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    assertEquals(h.stub.requests.filter((r) => r.table === 'chunks').length, 0);
    assertEquals(
      h.stub.requests.filter((r) => r.table === 'rpc/replace_document_chunks').length,
      1,
    );
    assert(replacement(h.stub).p_metadata);
  } finally {
    await h.stub.close();
  }
});

Deno.test('text that has not changed is not embedded again', async () => {
  // sha256 of the fixture body, so the document arrives already up to date.
  const first = harness({});
  let hash = '';
  try {
    await runIngestJob(JOB, first.deps);
    hash = String(writes(first.stub, 'documents')[0].content_hash);
  } finally {
    await first.stub.close();
  }

  const h = harness({ document: uploadDocument({ content_hash: hash }) });
  try {
    const result = await runIngestJob(JOB, h.deps);
    assertEquals(result.kind, 'unchanged');
    assertEquals(rowsInserted(h.stub, 'chunks').length, 0);
    assertEquals((h.deps.models as ReturnType<typeof fakeModel>).embedCalls.length, 0);
    assertEquals(writes(h.stub, 'ingest_jobs').at(-1)?.status, 'succeeded');
  } finally {
    await h.stub.close();
  }
});

Deno.test('the transaction receives the new document hash', async () => {
  const h = harness({ document: uploadDocument({ version: 3 }) });
  try {
    await runIngestJob(JOB, h.deps);
    const update = writes(h.stub, 'documents')[0];
    assertEquals(replacement(h.stub).p_document_id, 'document-1');
    assert(typeof update.content_hash === 'string' && update.content_hash.length === 64);
  } finally {
    await h.stub.close();
  }
});

Deno.test('ingesting a document meters what the plan meters', async () => {
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    const usage = rowsInserted(h.stub, 'usage_events');
    assertEquals(usage.map((row) => row.kind), [
      'document_ingested',
      'chunk_embedded',
      'storage_bytes',
    ]);
    assertEquals(usage[0].org_id, ORG);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a document with neither bytes nor a source is a legible failure', async () => {
  const h = harness({
    document: uploadDocument({ storage_path: null, connection_id: null, external_id: null }),
  });
  try {
    const result = await runIngestJob(JOB, h.deps);
    assertEquals(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assertEquals(result.stage, 'fetch');

    const final = writes(h.stub, 'ingest_jobs').at(-1);
    assertEquals(final?.status, 'failed');
    assertEquals(final?.error, result.detail);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a file type that cannot be read fails at extract, not at store', async () => {
  const h = harness({
    document: uploadDocument({ mime_type: 'image/png', storage_path: 'uploads/logo.png' }),
    files: { 'uploads/logo.png': 'binary' },
  });
  try {
    const result = await runIngestJob(JOB, h.deps);
    assertEquals(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert(result.detail.includes('image/png'));
    assertEquals(rowsInserted(h.stub, 'chunks').length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a job killed while it was downloading says fetch, not extract', async () => {
  // Fetch is the stage most likely to run long and has no checkpoint of its own after it.
  const h = harness({ clock: steppingClock(NOW, 60_000), budgetMs: 1000 });
  try {
    const result = await runIngestJob(JOB, h.deps);

    assertEquals(result.kind, 'timeout');
    if (result.kind !== 'timeout') return;
    assertEquals(result.stage, 'fetch');
    assertEquals(writes(h.stub, 'ingest_jobs').at(-1)?.stage, 'fetch');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a job that runs out of time says which stage it died in', async () => {
  // Walking the jump forward one reading at a time stops the job at each checkpoint in turn.
  const stages = new Set<string>();

  for (let ticks = 1; ticks <= 20; ticks += 1) {
    const h = harness({ clock: jumpingClock(NOW, ticks), budgetMs: 1_000 });
    try {
      const result = await runIngestJob(JOB, h.deps);
      if (result.kind !== 'timeout') continue;
      stages.add(result.stage);

      const final = writes(h.stub, 'ingest_jobs').at(-1);
      assertEquals(final?.status, 'timeout');
      // The column and the result have to name the same stage.
      assertEquals(final?.stage, result.stage);
      // The message says what the stage column cannot: how long it ran and the budget.
      assert(
        !String(final?.error).includes(result.stage),
        'the message repeats the stage column',
      );
      assert(String(final?.error).includes('budget'), String(final?.error));
    } finally {
      await h.stub.close();
    }
  }

  for (const stage of stages) {
    assert(INGEST_STAGES.includes(stage), `a job named a stage nothing else knows: ${stage}`);
  }
  // Not vacuous: dying only at the first checkpoint proves nothing about later stages.
  assert(stages.size > 1, `only one stage was ever reached: ${[...stages].join(', ')}`);
});

Deno.test('a timed out job stores no chunks', async () => {
  const h = harness({ clock: steppingClock(NOW, 60_000), budgetMs: 1000 });
  try {
    await runIngestJob(JOB, h.deps);
    assertEquals(rowsInserted(h.stub, 'chunks').length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a document from a source is fetched through its connection', async () => {
  const connectionRow = await notionConnection();

  const h = harness({
    document: uploadDocument({
      storage_path: null,
      connection_id: 'connection-1',
      external_id: 'page-1',
      mime_type: null,
    }),
    reply: (request) => {
      if (request.table === 'connections' && request.method === 'GET') {
        return { body: [connectionRow] };
      }
      return undefined;
    },
    fetch: (input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes('/blocks/')
        ? {
          results: [
            { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Ship on Tuesday.' }] } },
          ],
          has_more: false,
        }
        : {
          object: 'page',
          id: 'page-1',
          url: 'https://notion.so/page-1',
          last_edited_time: '2026-09-08T00:00:00.000Z',
          properties: { Name: { type: 'title', title: [{ plain_text: 'Launch plan' }] } },
        };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  });

  try {
    const result = await runIngestJob(
      { ...JOB, connection_id: 'connection-1' },
      h.deps,
    );

    assertEquals(result.kind, 'succeeded');
    const chunks = rowsInserted(h.stub, 'chunks');
    assertEquals(chunks.length, 1);
    assert(String(chunks[0].content).includes('Ship on Tuesday.'));
    // The title and url come from the provider, not from the placeholder row.
    assertEquals(writes(h.stub, 'documents')[0].title, 'Launch plan');
  } finally {
    await h.stub.close();
  }
});

Deno.test('a document whose connection was removed fails without a stack trace', async () => {
  const h = harness({
    document: uploadDocument({
      storage_path: null,
      connection_id: 'connection-gone',
      external_id: 'page-1',
    }),
  });
  try {
    const result = await runIngestJob({ ...JOB, connection_id: 'connection-gone' }, h.deps);
    assertEquals(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert(result.detail.includes('connection'));
  } finally {
    await h.stub.close();
  }
});

Deno.test('an uploaded document records what it weighs and meters the storage', async () => {
  const h = harness({});
  try {
    await runIngestJob(JOB, h.deps);
    const size = new TextEncoder().encode('# Runbook\n\nRestart it.').byteLength;

    assertEquals(writes(h.stub, 'documents')[0].size_bytes, size);
    const usage = rowsInserted(h.stub, 'usage_events');
    assertEquals(usage.map((row) => row.kind), [
      'document_ingested',
      'chunk_embedded',
      'storage_bytes',
    ]);
    assertEquals(usage[2].quantity, size);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a re-import meters only what the file grew by', async () => {
  // The admin page sums these events, so charging the whole file twice overreports storage.
  const h = harness({
    document: uploadDocument({ size_bytes: 10 }),
    files: { 'uploads/runbook.md': '# Runbook\n\nRestart it, twice.' },
  });
  try {
    await runIngestJob(JOB, h.deps);
    const size = new TextEncoder().encode('# Runbook\n\nRestart it, twice.').byteLength;
    assertEquals(rowsInserted(h.stub, 'usage_events')[2].quantity, size - 10);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a synced document weighs its text and meters no storage', async () => {
  // Nothing from a source occupies a bucket, so there is no storage to meter.
  const connectionRow = await notionConnection();

  const h = harness({
    document: uploadDocument({
      storage_path: null,
      connection_id: 'connection-1',
      external_id: 'page-1',
      mime_type: null,
    }),
    reply: (request) =>
      request.table === 'connections' && request.method === 'GET'
        ? { body: [connectionRow] }
        : undefined,
    fetch: (input: string | URL | Request) => {
      const body = String(input).includes('/blocks/')
        ? {
          results: [
            { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Ship on Tuesday.' }] } },
          ],
          has_more: false,
        }
        : {
          object: 'page',
          id: 'page-1',
          url: 'https://notion.so/page-1',
          last_edited_time: '2026-09-08T00:00:00.000Z',
          properties: { Name: { type: 'title', title: [{ plain_text: 'Launch plan' }] } },
        };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  });

  try {
    await runIngestJob({ ...JOB, connection_id: 'connection-1' }, h.deps);
    assertEquals(writes(h.stub, 'documents')[0].size_bytes, 'Ship on Tuesday.'.length);
    assertEquals(
      rowsInserted(h.stub, 'usage_events').map((row) => row.kind),
      ['document_ingested', 'chunk_embedded'],
    );
  } finally {
    await h.stub.close();
  }
});

Deno.test('a source that failed for the moment goes back on the queue', async () => {
  // The driver promises another pass, and claim_ingest_jobs budgets three attempts for it.
  const h = await sourceHarness(() => Promise.resolve(new Response('{}', { status: 500 })));
  try {
    const result = await runIngestJob({ ...JOB, connection_id: 'connection-1' }, h.deps);
    assertEquals(result.kind, 'retrying');

    const final = writes(h.stub, 'ingest_jobs').at(-1);
    assertEquals(final?.status, 'queued');
    // The reason stays on the row, so a job the cap retires has something written.
    assert(String(final?.error).includes('try again'), String(final?.error));
  } finally {
    await h.stub.close();
  }
});

Deno.test('a source that refused the credential is terminal rather than retried', async () => {
  // Reconnecting is the only fix for a revoked token, and the message says so.
  const h = await sourceHarness(() => Promise.resolve(new Response('{}', { status: 401 })));
  try {
    const result = await runIngestJob({ ...JOB, connection_id: 'connection-1' }, h.deps);
    assertEquals(result.kind, 'failed');

    const final = writes(h.stub, 'ingest_jobs').at(-1);
    assertEquals(final?.status, 'failed');
    assert(String(final?.error).includes('reconnect'), String(final?.error));
  } finally {
    await h.stub.close();
  }
});

Deno.test('a requeued job does not touch the claim columns', async () => {
  // attempts retires the job, so rewriting it here would reset or double spend the budget.
  const h = await sourceHarness(() => Promise.resolve(new Response('{}', { status: 500 })));
  try {
    await runIngestJob({ ...JOB, connection_id: 'connection-1' }, h.deps);
    const final = writes(h.stub, 'ingest_jobs').at(-1);
    assertEquals(final?.attempts, undefined);
    assertEquals(final?.claimed_at, undefined);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a terminal write the database refused is not swallowed', async () => {
  // The job is reclaimed after the stale window, but nothing records why it ran twice.
  const h = harness({
    reply: (request) =>
      request.table === 'ingest_jobs' && request.method === 'PATCH'
        ? { status: 500, body: { message: 'boom' } }
        : undefined,
  });
  try {
    const logged = await capturedErrors(() => runIngestJob(JOB, h.deps));
    assert(
      logged.some((line) => line.includes('succeeded') && line.includes(JOB.id)),
      `nothing was logged about the terminal write: ${logged.join(' | ')}`,
    );
  } finally {
    await h.stub.close();
  }
});

Deno.test('malformed provider JSON preserves existing content and queues a retry', async () => {
  const h = await sourceHarness(() => Promise.resolve(new Response('<html>maintenance</html>')));
  try {
    const result = await runIngestJob(JOB, h.deps);
    assertEquals(result.kind, 'retrying');
    assertEquals(
      h.stub.requests.filter((r) => r.table === 'rpc/replace_document_chunks').length,
      0,
    );
    assertEquals(writes(h.stub, 'ingest_jobs').at(-1)?.status, 'queued');
  } finally {
    await h.stub.close();
  }
});
