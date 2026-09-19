import { assert, assertEquals } from '@std/assert';

import { createModelRunner, type ModelRunnerDeps } from './model_client.ts';
import { EMBEDDING_DIMENSIONS, MODELS } from './models.ts';
import { type StubDb, stubDb } from './testing/stub_db.ts';
import { asyncApiErrorFrom } from './testing/assertions.ts';

const ORG = '44444444-4444-4444-8444-444444444444';
const START = new Date('2026-09-09T12:00:00.000Z');

function vector(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / EMBEDDING_DIMENSIONS);
}

interface Harness {
  deps: ModelRunnerDeps;
  stub: StubDb;
  requests: { url: string; body: unknown }[];
}

/** The clock advances by a fixed step per read, so latency is assertable. */
function harness(answer: (url: string) => Response, stepMs = 250): Harness {
  const stub = stubDb(() => ({ body: [] }));
  const requests: { url: string; body: unknown }[] = [];
  let reads = 0;

  return {
    stub,
    requests,
    deps: {
      db: stub.db,
      apiKey: 'sk-test-key',
      now: () => new Date(START.getTime() + stepMs * reads++),
      fetch: (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return Promise.resolve(answer(url));
      },
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function modelCallRows(stub: StubDb): Record<string, unknown>[] {
  return stub.requests
    .filter((request) => request.table === 'model_calls')
    .map((request) => request.body as Record<string, unknown>);
}

Deno.test('an embedding call uses the pinned model at the pinned dimension', async () => {
  const h = harness(() =>
    json({ data: [{ embedding: vector() }], usage: { prompt_tokens: 12, total_tokens: 12 } })
  );
  try {
    const vectors = await createModelRunner(h.deps).embed({ orgId: ORG, texts: ['a chunk'] });

    assertEquals(vectors.length, 1);
    assertEquals(vectors[0].length, EMBEDDING_DIMENSIONS);
    assertEquals(h.requests[0].url, 'https://api.openai.com/v1/embeddings');
    assertEquals((h.requests[0].body as Record<string, unknown>).model, MODELS.embedding);
    assertEquals((h.requests[0].body as Record<string, unknown>).dimensions, 1536);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a whole batch goes in one call, because that is what it is for', async () => {
  const h = harness(() =>
    json({ data: [{ embedding: vector() }, { embedding: vector() }], usage: {} })
  );
  try {
    await createModelRunner(h.deps).embed({ orgId: ORG, texts: ['one', 'two'] });
    assertEquals(h.requests.length, 1);
    assertEquals((h.requests[0].body as { input: string[] }).input, ['one', 'two']);
  } finally {
    await h.stub.close();
  }
});

Deno.test('an empty batch makes no call at all', async () => {
  const h = harness(() => json({}));
  try {
    assertEquals(await createModelRunner(h.deps).embed({ orgId: ORG, texts: [] }), []);
    assertEquals(h.requests.length, 0);
    assertEquals(modelCallRows(h.stub).length, 0);
  } finally {
    await h.stub.close();
  }
});

Deno.test('every call writes one model_calls row with its ids, tokens and latency', async () => {
  const h = harness(() =>
    json({
      choices: [{ message: { content: 'A standalone question.' } }],
      usage: { prompt_tokens: 40, completion_tokens: 9 },
    })
  );
  try {
    const answer = await createModelRunner(h.deps).complete({
      orgId: ORG,
      purpose: 'condense',
      system: 'rewrite',
      user: 'what about last quarter?',
    });
    assertEquals(answer, 'A standalone question.');

    const rows = modelCallRows(h.stub);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].org_id, ORG);
    assertEquals(rows[0].purpose, 'condense');
    assertEquals(rows[0].model, MODELS.condense);
    assertEquals(rows[0].input_tokens, 40);
    assertEquals(rows[0].output_tokens, 9);
    assertEquals(rows[0].succeeded, true);
    assertEquals(rows[0].latency_ms, 250);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a refused call is logged as a failure and still raises', async () => {
  const h = harness(() => json({ error: { message: 'rate limited' } }, 429));
  try {
    const err = await asyncApiErrorFrom(() =>
      createModelRunner(h.deps).complete({
        orgId: ORG,
        purpose: 'chat',
        system: 's',
        user: 'u',
      })
    );
    assertEquals(err.status, 502);

    const rows = modelCallRows(h.stub);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].succeeded, false);
    assertEquals(rows[0].model, MODELS.chat);
  } finally {
    await h.stub.close();
  }
});

Deno.test("the provider's own error text never reaches the caller", async () => {
  const h = harness(() =>
    json({ error: { message: 'prompt contained: leadership salaries' } }, 400)
  );
  try {
    const err = await asyncApiErrorFrom(() =>
      createModelRunner(h.deps).complete({ orgId: ORG, purpose: 'chat', system: 's', user: 'u' })
    );
    assert(!err.message.includes('leadership'));
  } finally {
    await h.stub.close();
  }
});

Deno.test('a vector of the wrong width is refused rather than written', async () => {
  const h = harness(() => json({ data: [{ embedding: [0.1, 0.2] }], usage: {} }));
  try {
    const err = await asyncApiErrorFrom(() =>
      createModelRunner(h.deps).embed({ orgId: ORG, texts: ['a'] })
    );
    assertEquals(err.code, 'model_error');
    assertEquals(modelCallRows(h.stub)[0].succeeded, false);
  } finally {
    await h.stub.close();
  }
});

Deno.test('a short embedding batch is refused rather than silently misaligned', async () => {
  // Two texts and one vector would file the second chunk under the first vector.
  const h = harness(() => json({ data: [{ embedding: vector() }], usage: {} }));
  try {
    const err = await asyncApiErrorFrom(() =>
      createModelRunner(h.deps).embed({ orgId: ORG, texts: ['one', 'two'] })
    );
    assertEquals(err.code, 'model_error');
    // Nothing was stored, so no chunk ends up under another chunk's vector.
    assertEquals(modelCallRows(h.stub)[0].succeeded, false);
  } finally {
    await h.stub.close();
  }
});

Deno.test('an unreachable provider is a 502, not an unhandled rejection', async () => {
  const stub = stubDb(() => ({ body: [] }));
  const deps: ModelRunnerDeps = {
    db: stub.db,
    apiKey: 'sk-test-key',
    now: () => START,
    fetch: () => Promise.reject(new Error('econnrefused')),
  };
  try {
    const err = await asyncApiErrorFrom(() =>
      createModelRunner(deps).complete({ orgId: ORG, purpose: 'title', system: 's', user: 'u' })
    );
    assertEquals(err.code, 'model_unreachable');
  } finally {
    await stub.close();
  }
});

Deno.test('the api key never appears in a thrown message', async () => {
  const h = harness(() => json({}, 500));
  try {
    const err = await asyncApiErrorFrom(() =>
      createModelRunner(h.deps).embed({ orgId: ORG, texts: ['a'] })
    );
    assert(!`${err.message} ${err.stack ?? ''}`.includes('sk-test-key'));
  } finally {
    await h.stub.close();
  }
});

Deno.test('a truncated completion retains provider-reported token usage', async () => {
  const h = harness(() =>
    json({
      choices: [{ message: { content: 'partial' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 123, completion_tokens: 45 },
    })
  );
  try {
    await asyncApiErrorFrom(() =>
      createModelRunner(h.deps).complete({
        orgId: ORG,
        purpose: 'dream',
        system: 'Summarize',
        user: 'Notes',
      })
    );
    assertEquals(modelCallRows(h.stub)[0].input_tokens, 123);
    assertEquals(modelCallRows(h.stub)[0].output_tokens, 45);
    assertEquals(modelCallRows(h.stub)[0].succeeded, false);
  } finally {
    await h.stub.close();
  }
});
