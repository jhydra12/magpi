import { assert, assertEquals, assertRejects } from '@std/assert';

import {
  requestsFor,
  type StubDb,
  stubDb,
  type StubReply,
  type StubRequest,
} from '../../_shared/testing/stub_db.ts';
import type { ModelRunner } from '../../_shared/model_client.ts';
import { addNote } from './add_note.ts';
import { fetchDocument } from './fetch.ts';
import { readDocument } from './get_document.ts';
import { listSpaces } from './list_spaces.ts';
import { searchPassages } from './search.ts';
import type { NoteStore, ToolContext } from './types.ts';
import { identify } from './whoami.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const FINANCE = '44444444-4444-4444-8444-444444444444';
const DOC_A = '55555555-5555-4555-8555-555555555555';
const DOC_B = '66666666-6666-4666-8666-666666666666';
const CHUNK_A = '77777777-7777-4777-8777-777777777777';

/** The value of an `=eq.` filter, or null when the read sent none. */
function eqFilter(query: string, column: string): string | null {
  return new RegExp(`(?:^|&)${column}=eq\\.([^&]+)`).exec(query)?.[1] ?? null;
}

function inFilter(query: string, column: string): string[] | null {
  const list = new RegExp(`(?:^|&)${column}=in\\.\\(([^)]*)\\)`).exec(query)?.[1];
  return list === undefined ? null : list.split(',').map((value) => value.replace(/"/g, ''));
}

const SPACES = [
  { id: ENGINEERING, name: 'Engineering', kind: 'team', dreaming_enabled: true },
  { id: FINANCE, name: 'Finance', kind: 'team', dreaming_enabled: false },
];

const DOCUMENTS = [
  {
    id: DOC_A,
    space_id: ENGINEERING,
    title: 'The crease',
    url: 'https://example.test/crease',
    origin: 'sync',
    mime_type: 'text/markdown',
    updated_at: '2026-09-04T09:00:00+00:00',
  },
  {
    id: DOC_B,
    space_id: FINANCE,
    title: 'The forecast',
    url: null,
    origin: 'upload',
    mime_type: 'text/markdown',
    updated_at: '2026-09-05T09:00:00+00:00',
  },
];

/** Chunks out of ordinal order, so a read that does not sort is a read that fails. */
const CHUNKS = [
  { document_id: DOC_A, ordinal: 1, content: 'second' },
  { document_id: DOC_A, ordinal: 0, content: 'first' },
];

const HITS = [
  {
    chunk_id: CHUNK_A,
    document_id: DOC_A,
    space_id: ENGINEERING,
    content: 'a passage',
    score: 0.03,
  },
];

interface Options {
  /** What check_query_allowed and check_ingest_allowed answer. */
  allowed?: { allowed: boolean; reason: string };
  member?: boolean;
  hits?: typeof HITS;
  /** Documents the caller can see. Row level security is what narrows this in production. */
  documents?: typeof DOCUMENTS;
}

/** Answers the way PostgREST would, with the filters each request carries actually applied. */
function replies(options: Options = {}) {
  const documents = options.documents ?? DOCUMENTS;

  return (request: StubRequest): StubReply | undefined => {
    if (
      request.table === 'rpc/check_query_allowed' || request.table === 'rpc/check_ingest_allowed'
    ) {
      return { body: options.allowed ?? { allowed: true, reason: '' } };
    }
    if (request.table === 'rpc/is_space_member') return { body: options.member ?? true };
    if (request.table === 'rpc/visible_space_ids') return { body: SPACES.map((space) => space.id) };
    if (request.table === 'rpc/search') return { body: options.hits ?? HITS };
    if (request.table === 'rpc/record_retrieval') return { body: null };

    // A counting read is a HEAD, so this answers both it and an ordinary select.
    if (request.table === 'documents' && request.method !== 'POST') {
      const one = eqFilter(request.query, 'id');
      const many = inFilter(request.query, 'id');
      const space = eqFilter(request.query, 'space_id');
      const matched = documents.filter((document) =>
        (one === null || document.id === one) &&
        (many === null || many.includes(document.id)) &&
        (space === null || document.space_id === space)
      );
      // A head request asks for the number, not the rows, and PostgREST answers in a header.
      return {
        body: request.query.includes('id=eq.') ? (matched[0] ?? null) : matched,
        count: matched.length,
      };
    }

    if (request.table === 'chunks') {
      const document = eqFilter(request.query, 'document_id');
      const matched = CHUNKS.filter((chunk) => document === null || chunk.document_id === document);
      // The order the request asked for, since the stub is the database here.
      const ascending = request.query.includes('ordinal.asc');
      return {
        body: [...matched].sort((a, b) => (ascending ? a.ordinal - b.ordinal : 0)),
      };
    }

    if (request.table === 'spaces') return { body: SPACES };
    if (request.table === 'documents') return { body: { id: 'new-document' } };
    if (request.table === 'ingest_jobs') return { body: { id: 'new-job' } };
    if (request.table === 'usage_events') return { body: null };
    return undefined;
  };
}

function fakeModels(): ModelRunner {
  return {
    embed: ({ texts }) => Promise.resolve(texts.map(() => [0.1, 0.2])),
    complete: () => Promise.reject(new Error('a tool calls no chat model')),
  };
}

/** The notes a test wrote, so the one write can be checked without a bucket. */
function recordingNotes(): NoteStore & { written: { path: string; text: string }[] } {
  const written: { path: string; text: string }[] = [];
  return {
    written,
    write: (path, text) => {
      written.push({ path, text });
      return Promise.resolve();
    },
  };
}

function context(stub: StubDb, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    supabase: stub.db,
    admin: stub.db,
    userClaims: { id: USER, email: 'jane@example.com' },
    jwtClaims: { sub: USER },
    models: fakeModels(),
    notes: recordingNotes(),
    orgId: ORG,
    ...overrides,
  };
}

Deno.test('search answers with the passages and the documents they came from', async () => {
  const stub = stubDb(replies());
  try {
    const { results } = await searchPassages(context(stub), { query: 'the crease', limit: 20 });

    assertEquals(results.length, 1);
    assertEquals(results[0].document_title, 'The crease');
    assertEquals(results[0].document_url, 'https://example.test/crease');
    assertEquals(results[0].chunk_id, CHUNK_A);
    assertEquals(results[0].score, 0.03);
  } finally {
    await stub.close();
  }
});

Deno.test('search asks the database for the spaces the caller named', async () => {
  const stub = stubDb(replies());
  try {
    await searchPassages(context(stub), {
      query: 'the crease',
      limit: 5,
      space_ids: [ENGINEERING],
    });

    const asked = requestsFor(stub, 'rpc/search')[0];
    assert(isRecord(asked.body));
    assertEquals(asked.body.space_filter, [ENGINEERING]);
    assertEquals(asked.body.match_count, 5);
    assertEquals(asked.body.query_text, 'the crease');
  } finally {
    await stub.close();
  }
});

// Omitting the filter is how "every space I can see" is spelled; sending an empty one is not.
Deno.test('search with no spaces named sends no filter at all', async () => {
  const stub = stubDb(replies());
  try {
    await searchPassages(context(stub), { query: 'the crease', limit: 20 });

    const asked = requestsFor(stub, 'rpc/search')[0];
    assert(isRecord(asked.body));
    assertEquals('space_filter' in asked.body, false);
  } finally {
    await stub.close();
  }
});

Deno.test('a search is metered and the documents it returned are marked read', async () => {
  const stub = stubDb(replies());
  try {
    await searchPassages(context(stub), { query: 'the crease', limit: 20 });

    const metered = requestsFor(stub, 'usage_events').filter((r) => r.method === 'POST');
    assertEquals(metered.length, 1);
    assert(isRecord(metered[0].body));
    assertEquals(metered[0].body.kind, 'query');
    assertEquals(metered[0].body.org_id, ORG);
    assertEquals(requestsFor(stub, 'rpc/record_retrieval').length, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('a plan that is out of questions refuses before the model is called', async () => {
  const stub = stubDb(
    replies({ allowed: { allowed: false, reason: 'no questions left this month' } }),
  );
  const models = fakeModels();
  let embedded = 0;
  try {
    const error = await searchPassages(
      context(stub, {
        models: { ...models, embed: (input) => (embedded += 1, models.embed(input)) },
      }),
      { query: 'the crease', limit: 20 },
    ).then(() => null, (thrown) => thrown);

    assert(error instanceof Error);
    assertEquals(error.message, 'no questions left this month');
    assertEquals(embedded, 0, 'the question was embedded before the plan was checked');
  } finally {
    await stub.close();
  }
});

Deno.test('a search that matched nothing costs no document read', async () => {
  const stub = stubDb(replies({ hits: [] }));
  try {
    const { results } = await searchPassages(context(stub), { query: 'nothing', limit: 20 });

    assertEquals(results, []);
    assertEquals(requestsFor(stub, 'documents').length, 0);
  } finally {
    await stub.close();
  }
});

Deno.test('a document comes back as its chunks, in the order they were written', async () => {
  const stub = stubDb(replies());
  try {
    const document = await readDocument(context(stub), { document_id: DOC_A });

    assertEquals(document.title, 'The crease');
    assertEquals(document.content, 'first\n\nsecond');
    assertEquals(document.chunk_count, 2);
    assertEquals(document.space_id, ENGINEERING);
  } finally {
    await stub.close();
  }
});

Deno.test('fetch is the same read as get_document, in the shape ChatGPT looks for', async () => {
  const stub = stubDb(replies());
  try {
    const document = await fetchDocument(context(stub), { id: DOC_A });

    assertEquals(document.id, DOC_A);
    assertEquals(document.title, 'The crease');
    assertEquals(document.text, 'first\n\nsecond');
    assertEquals(document.url, 'https://example.test/crease');
    assertEquals(document.metadata.space_id, ENGINEERING);
  } finally {
    await stub.close();
  }
});

// Row level security returns no row for a document in a space the caller is not in, and a
// document that never existed returns no row either. The tool must not tell them apart.
Deno.test('a document the caller cannot see reads as one that does not exist', async () => {
  const stub = stubDb(replies({ documents: [] }));
  try {
    const error = await readDocument(context(stub), { document_id: DOC_B })
      .then(() => null, (thrown) => thrown);

    assert(error instanceof Error);
    assertEquals(error.message, `no document ${DOC_B}`);
  } finally {
    await stub.close();
  }
});

Deno.test('the spaces come back with what each one holds', async () => {
  const stub = stubDb(replies());
  try {
    const { spaces } = await listSpaces(context(stub));

    assertEquals(spaces.length, 2);
    assertEquals(spaces[0].name, 'Engineering');
    assertEquals(spaces[0].document_count, 1);
    assertEquals(spaces[1].document_count, 1);
    assertEquals(spaces[1].dreaming_enabled, false);
  } finally {
    await stub.close();
  }
});

Deno.test('a note is filed and queued for indexing', async () => {
  const stub = stubDb(replies());
  const notes = recordingNotes();
  try {
    const filed = await addNote(context(stub, { notes }), {
      space_id: ENGINEERING,
      title: 'What we decided',
      content: 'The crease ships in October.',
    });

    assertEquals(filed.status, 'queued');
    assertEquals(filed.space_id, ENGINEERING);

    const written = requestsFor(stub, 'documents').find((request) => request.method === 'POST');
    assert(written && isRecord(written.body));
    assertEquals(written.body.origin, 'upload');
    assertEquals(written.body.org_id, ORG);
    // The bytes go to storage under the space, which is what the storage policy reads.
    assertEquals(notes.written.length, 1);
    assertEquals(notes.written[0].text, 'The crease ships in October.');
    assert(notes.written[0].path.startsWith(`${ENGINEERING}/`));
    assertEquals(written.body.storage_path, notes.written[0].path);
  } finally {
    await stub.close();
  }
});

// The one write runs as the service role, so the membership check is the whole boundary.
Deno.test('a note into a space the caller is not in writes nothing at all', async () => {
  const stub = stubDb(replies({ member: false }));
  const notes = recordingNotes();
  try {
    const error = await addNote(context(stub, { notes }), {
      space_id: FINANCE,
      title: 'Should not land',
      content: 'nope',
    }).then(() => null, (thrown) => thrown);

    assert(error instanceof Error);
    assertEquals(error.message, `you are not a member of space ${FINANCE}`);
    assertEquals(requestsFor(stub, 'documents').length, 0);
    assertEquals(requestsFor(stub, 'ingest_jobs').length, 0);
    assertEquals(notes.written.length, 0, 'the text was stored before the caller was checked');
  } finally {
    await stub.close();
  }
});

Deno.test('a plan at its document limit refuses the note', async () => {
  const stub = stubDb(replies({ allowed: { allowed: false, reason: 'this plan is full' } }));
  try {
    await assertRejects(
      () => addNote(context(stub), { space_id: ENGINEERING, title: 'Full', content: 'nope' }),
      Error,
      'this plan is full',
    );
    assertEquals(requestsFor(stub, 'documents').length, 0);
  } finally {
    await stub.close();
  }
});

Deno.test('whoami names the OAuth client when there is one', async () => {
  const stub = stubDb(replies());
  try {
    const identity = await identify(
      context(stub, { jwtClaims: { sub: USER, client_id: 'claude-desktop' } }),
    );

    assertEquals(identity.client_id, 'claude-desktop');
    assertEquals(identity.user_id, USER);
    assertEquals(identity.space_count, 2);
  } finally {
    await stub.close();
  }
});

Deno.test('whoami names no client for a session the product forwarded', async () => {
  const stub = stubDb(replies());
  try {
    assertEquals((await identify(context(stub))).client_id, null);
  } finally {
    await stub.close();
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
