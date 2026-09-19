import { assert, assertEquals } from '@std/assert';

import { encryptProviderToken } from '../_shared/provider_tokens.ts';
import { envSource } from '../_shared/testing/assertions.ts';
import { stubDb } from '../_shared/testing/stub_db.ts';

Deno.test('Edge claims only immediate capacity when a batch of twenty is throttled', async () => {
  const org = '11111111-1111-4111-8111-111111111111';
  const space = '22222222-2222-4222-8222-222222222222';
  const user = '33333333-3333-4333-8333-333333333333';
  const encryption = {
    SB_TOKEN_ENC_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
    SB_TOKEN_ENC_KEY_ID: '1',
  };
  const encrypted = await encryptProviderToken('provider-token', {
    userId: user,
    provider: 'notion',
  }, envSource(encryption));
  const jobs = Array.from(
    { length: 20 },
    (_, index) => ({
      id: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
      org_id: org,
      space_id: space,
      document_id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`,
      connection_id: '66666666-6666-4666-8666-666666666666',
      attempts: 1,
    }),
  );
  const states = new Map(jobs.map((job) => [job.id, 'queued']));
  const stub = stubDb((request) => {
    if (request.table === 'rpc/claim_ingest_jobs') {
      assert(
        typeof request.body === 'object' && request.body !== null && 'p_limit' in request.body,
      );
      const claimed = jobs.slice(0, Number(request.body.p_limit));
      claimed.forEach((job) => states.set(job.id, 'running'));
      return { body: claimed };
    }
    if (request.table === 'documents') {
      return {
        body: [{
          id: 'document',
          org_id: org,
          space_id: space,
          connection_id: '66666666-6666-4666-8666-666666666666',
          external_id: 'page-1',
          storage_path: null,
          content_hash: null,
          version: 1,
          title: 'Source',
          mime_type: null,
          url: null,
          size_bytes: null,
        }],
      };
    }
    if (request.table === 'connections') {
      return {
        body: [{
          id: '66666666-6666-4666-8666-666666666666',
          user_id: user,
          org_id: org,
          provider: 'notion',
          status: 'active',
          access_token_enc: encrypted,
          refresh_token_enc: null,
          token_expires_at: null,
          scopes: [],
          scope_selection: { kind: 'workspace', available: [], routes: { workspace: space } },
        }],
      };
    }
    if (request.table === 'ingest_jobs' && request.method === 'PATCH') {
      assert(typeof request.body === 'object' && request.body !== null && 'status' in request.body);
      const id = new URLSearchParams(request.query).get('id')?.replace('eq.', '');
      if (id) states.set(id, String(request.body.status));
    }
    return { body: [] };
  });
  const configured = {
    ...encryption,
    SUPABASE_URL: stub.url,
    SB_SERVICE_ROLE_KEY: 'worker-test-key',
    OPENAI_API_KEY: 'unused-test-key',
  };
  const previous = Object.fromEntries(
    Object.keys(configured).map((key) => [key, Deno.env.get(key)]),
  );
  const originalServe = Object.getOwnPropertyDescriptor(Deno, 'serve');
  const originalFetch = globalThis.fetch;
  const captured: { handler?: (request: Request) => Promise<Response> } = {};
  try {
    Object.entries(configured).forEach(([key, value]) => Deno.env.set(key, value));
    Object.defineProperty(Deno, 'serve', {
      configurable: true,
      value: (handler: (request: Request) => Promise<Response>) => {
        captured.handler = handler;
      },
    });
    await import('./index.ts');
    assert(captured.handler);
    globalThis.fetch = (input, init) =>
      String(input).includes('api.notion.com')
        ? Promise.resolve(new Response('{}', { status: 429, headers: { 'retry-after': '60' } }))
        : originalFetch(input, init);
    const response = await captured.handler(
      new Request('http://worker.test/ingest-worker', {
        method: 'POST',
        headers: { authorization: 'Bearer worker-test-key', 'content-type': 'application/json' },
        body: JSON.stringify({ batch: 20, concurrency: 2 }),
      }),
    );
    assertEquals(response.status, 200);
    const result = await response.json();
    assertEquals(result.claimed, 2);
    assert(
      result.results.every((item: { kind: string; rateLimited?: boolean }) =>
        item.kind === 'retrying' && item.rateLimited
      ),
      JSON.stringify(result),
    );
    assertEquals([...states.values()].filter((status) => status === 'running').length, 0);
    assertEquals([...states.values()].filter((status) => status === 'queued').length, 20);
    assertEquals(
      stub.requests.filter((request) => request.table === 'rpc/claim_ingest_jobs').length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalServe) Object.defineProperty(Deno, 'serve', originalServe);
    Object.entries(previous).forEach(([key, value]) =>
      value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value)
    );
    await stub.close();
  }
});
