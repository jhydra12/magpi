import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../web/lib/database.types.ts';
import { cleanup, prepare, status } from './database.mts';
import { manifestSchema } from './model.mts';

interface RequestRecord {
  table: string;
  method: string;
  body: unknown;
}

function database(
  manifestPath: string,
  active = false,
): {
  db: ReturnType<typeof createClient<Database>>;
  sourceId: string;
  userId: string;
  requests: RequestRecord[];
} {
  const sourceId = randomUUID();
  const userId = randomUUID();
  const orgId = randomUUID();
  const documentId = randomUUID();
  const sourceChunk = {
    id: randomUUID(),
    document_id: documentId,
    ordinal: 0,
    content: 'The launch requires lab approval.',
    embedding: '[0.1,0.2]',
    token_count: 8,
    documents: { origin: 'upload' },
  };
  const requests: RequestRecord[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const table = url.pathname.split('/').at(-1) ?? '';
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    requests.push({ table, method, body });
    if (method === 'POST') {
      const saved = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
      assert.equal(saved.sourceSpaceId, sourceId, 'Ownership manifest must precede every write');
      if (table === 'dream_runs') {
        const rows = z
          .array(z.object({ space_id: z.uuid(), id: z.uuid(), status: z.literal('queued') }))
          .parse(body);
        const chunkWrites = requests.filter(
          (request) => request.table === 'chunks' && request.method === 'POST',
        );
        assert.equal(
          chunkWrites.length,
          new Set(rows.map((row) => row.space_id)).size,
          'All input copies must exist before queue submission',
        );
      }
      return new Response(null, { status: 201 });
    }
    if (method === 'DELETE') return Response.json([{ id: randomUUID() }]);
    if (table === 'spaces' && url.searchParams.get('id')?.startsWith('eq.'))
      return Response.json({ org_id: orgId, kind: 'org' });
    if (table === 'spaces')
      return Response.json(
        requests
          .filter((request) => request.table === 'spaces' && request.method === 'POST')
          .map((request) => request.body),
      );
    if (table === 'org_members') return Response.json({ user_id: userId });
    if (table === 'chunks') return Response.json([sourceChunk]);
    if (table === 'documents')
      return Response.json([{ id: documentId, title: 'Launch plan', url: null }]);
    if (table === 'dream_runs') return Response.json(active ? [{ id: randomUUID() }] : []);
    throw new Error(`Unexpected request ${method} ${table}`);
  };
  return {
    sourceId,
    userId,
    requests,
    db: createClient<Database>('http://localhost:55321', 'test-key', {
      global: { fetch: fetcher },
      auth: { persistSession: false },
    }),
  };
}

test('preparation writes ownership before changes and queues independent jobs only after real input copies', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dream-rehearsal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = join(directory, 'batch.json');
  const fake = database(manifestPath);
  const settings = {
    sourceSpace: fake.sourceId,
    user: fake.userId,
    count: 2,
    targetUrl: 'http://localhost:55321',
    webUrl: 'http://localhost:3000',
    manifestPath,
  };
  const manifest = await prepare(fake.db, settings);
  assert.equal(manifest.spaces.length, 2);
  const queued = fake.requests.filter(
    (request) => request.table === 'dream_runs' && request.method === 'POST',
  );
  assert.equal(queued.length, 1);
  const cloned = fake.requests.filter(
    (request) => request.table === 'chunks' && request.method === 'POST',
  );
  for (const request of cloned) {
    const chunks = z
      .array(z.object({ content: z.string(), embedding: z.string(), created_at: z.iso.datetime() }))
      .parse(request.body);
    assert.equal(chunks[0].content, 'The launch requires lab approval.');
    assert.equal(chunks[0].embedding, '[0.1,0.2]');
    assert.ok(Date.now() - Date.parse(chunks[0].created_at) < 60_000);
  }
  await assert.rejects(() => prepare(fake.db, settings), /EEXIST/);
  assert.equal(
    fake.requests.filter((request) => request.table === 'dream_runs' && request.method === 'POST')
      .length,
    1,
  );
  assert.equal(await cleanup(fake.db, manifest, settings.targetUrl), 1);
});

test('cleanup refuses active jobs before issuing any delete', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dream-rehearsal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = join(directory, 'batch.json');
  const fake = database(manifestPath, true);
  const manifest = await prepare(fake.db, {
    sourceSpace: fake.sourceId,
    user: fake.userId,
    count: 1,
    targetUrl: 'http://localhost:55321',
    webUrl: 'http://localhost:3000',
    manifestPath,
  });
  await assert.rejects(() => cleanup(fake.db, manifest, manifest.targetUrl), /queued or running/);
  assert.equal(
    fake.requests.some((request) => request.method === 'DELETE'),
    false,
  );
});

test('full Dream preparation queues 111 jobs for 37 spaces with all three kinds', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dream-rehearsal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = join(directory, 'batch.json');
  const fake = database(manifestPath);
  const manifest = await prepare(fake.db, {
    sourceSpace: fake.sourceId,
    user: fake.userId,
    count: 37,
    kind: 'all',
    targetUrl: 'http://localhost:55321',
    webUrl: 'http://localhost:3000',
    manifestPath,
  });
  const post = fake.requests.find(
    (request) => request.table === 'dream_runs' && request.method === 'POST',
  );
  const rows = z.array(z.object({ id: z.uuid(), kind: z.string() })).parse(post?.body);
  assert.equal(rows.length, 111);
  for (const kind of ['digest', 'entities', 'connections'])
    assert.equal(rows.filter((row) => row.kind === kind).length, 37);
  const requests: string[][] = [];
  const db = createClient<Database>('http://local.invalid', 'key', {
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/dream_runs')) {
          const ids = (url.searchParams.get('id') ?? '').slice(4, -1).split(',');
          requests.push(ids);
          return Response.json(
            ids.map((id) => ({ id, status: 'queued', output_document_id: null })),
          );
        }
        return new Response(null, { status: 200, headers: { 'content-range': '*/0' } });
      },
    },
  });
  const result = await status(db, manifest);
  assert.equal(result.runs.length, 111);
  assert.deepEqual(
    requests.map((batch) => batch.length),
    [50, 50, 11],
  );
});
