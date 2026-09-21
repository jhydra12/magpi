import { assert, assertEquals, assertStringIncludes } from '@std/assert';

import { type CompleteInput, createModelRunner, type ModelRunner } from '../model_client.ts';
import {
  requestsFor,
  type StubDb,
  stubDb,
  type StubReply,
  type StubRequest,
} from '../testing/stub_db.ts';
import { type DreamRunRecord, runDreamJob } from './dream.ts';
import { DREAM_CANCEL_REQUEST } from './dream_cancellation.ts';
import { jumpingClock } from './testing.ts';
import type { JobDeps } from './types.ts';

const ORG = '44444444-4444-4444-8444-444444444444';
const SPACE = '33333333-3333-4333-8333-333333333333';
const FOREIGN_SPACE = '99999999-9999-4999-8999-999999999999';
const RUN = '55555555-5555-4555-8555-555555555555';
const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';
const FOREIGN_DOC = '88888888-8888-4888-8888-888888888888';
const CHUNK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHUNK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN_CHUNK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DREAM_DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = new Date('2026-09-09T12:00:00.000Z');

function dreamRun(kind: DreamRunRecord['kind']): DreamRunRecord {
  return { id: RUN, org_id: ORG, space_id: SPACE, kind };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface RecordingModels extends ModelRunner {
  /** The texts of each embed call, so a test can count the round trips. */
  embedCalls: string[][];
  /** Every completion asked for, so a test can prove one was not. */
  completeCalls: CompleteInput[];
}

function fakeModels(complete: (input: CompleteInput) => string): RecordingModels {
  const embedCalls: string[][] = [];
  const completeCalls: CompleteInput[] = [];
  return {
    embedCalls,
    completeCalls,
    embed: ({ texts }) => {
      embedCalls.push(texts);
      return Promise.resolve(texts.map((_text, index) => [index, 0.5]));
    },
    complete: (input) => {
      completeCalls.push(input);
      return Promise.resolve(complete(input));
    },
  };
}

function jobDeps(
  stub: StubDb,
  models: ModelRunner,
  budgetMs?: number,
  now: () => Date = () => new Date(NOW.getTime()),
): JobDeps {
  return {
    db: stub.db,
    http: {
      fetch: () => Promise.reject(new Error('a dream job makes no direct http call')),
      now,
    },
    models,
    uploads: { read: () => Promise.reject(new Error('a dream job reads no uploads')) },
    budgetMs,
  };
}

/** The only four words the web client can read out of dream_runs.error. */
const STAGES = ['collect', 'extract', 'synthesize', 'write'];

/** The stage the run row names, which is everything before the first colon. */
function stageOf(error: string): string {
  const colon = error.indexOf(':');
  return colon === -1 ? '' : error.slice(0, colon);
}

/** The value of an `=eq.` filter on `column`, or null when the read sent none. */
function eqFilter(query: string, column: string): string | null {
  return new RegExp(`(?:^|&)${column}=eq\\.([^&]+)`).exec(query)?.[1] ?? null;
}

/** The values of an `=in.(a,b)` filter on `column`, or null when the read sent none. */
function inFilter(query: string, column: string): Set<string> | null {
  const list = new RegExp(`(?:^|&)${column}=in\\.\\(([^)]*)\\)`).exec(query)?.[1];
  if (list === undefined) return null;
  return new Set(list.split(',').map((value) => value.replace(/"/g, '')));
}

/** Answers a read the way PostgREST would, with the rows its filters match. */
function matching(
  rows: Record<string, unknown>[],
  request: StubRequest,
): Record<string, unknown>[] {
  const space = eqFilter(request.query, 'space_id');
  const ids = inFilter(request.query, 'id');
  const documents = inFilter(request.query, 'document_id') ??
    (() => {
      const one = eqFilter(request.query, 'document_id');
      return one === null ? null : new Set([one]);
    })();

  return rows.filter((row) =>
    (space === null || row.space_id === space) &&
    (ids === null || ids.has(String(row.id))) &&
    (documents === null || documents.has(String(row.document_id)))
  );
}

/** The rows a read answers with. `foreign` adds a row a leak has something to leak. */
function chunkRows(foreign: boolean): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [
    {
      id: CHUNK_A,
      document_id: DOC_A,
      ordinal: 0,
      content: 'Ada agreed to ship the billing page on Friday.',
      created_at: '2026-09-09T09:00:00.000Z',
      space_id: SPACE,
    },
    {
      id: CHUNK_B,
      document_id: DOC_B,
      ordinal: 0,
      content: 'Northwind asked about SSO again.',
      created_at: '2026-09-09T10:00:00.000Z',
      space_id: SPACE,
    },
  ];
  if (!foreign) return rows;
  return [...rows, {
    id: FOREIGN_CHUNK,
    document_id: FOREIGN_DOC,
    ordinal: 0,
    content: 'A row from a space this run may not touch.',
    created_at: '2026-09-09T11:00:00.000Z',
    space_id: FOREIGN_SPACE,
  }];
}

function documentRows(
  overrides: { connectionB?: string | null; foreign?: boolean } = {},
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [
    {
      id: DOC_A,
      title: 'Notes from Monday',
      origin: 'sync',
      connection_id: 'conn-1',
      url: null,
      updated_at: '2026-09-09T09:00:00.000Z',
      space_id: SPACE,
    },
    {
      id: DOC_B,
      title: 'Northwind renewal',
      origin: 'upload',
      connection_id: overrides.connectionB === undefined ? null : overrides.connectionB,
      url: null,
      updated_at: '2026-09-09T10:00:00.000Z',
      space_id: SPACE,
    },
  ];
  if (overrides.foreign !== true) return rows;
  return [...rows, {
    id: FOREIGN_DOC,
    title: 'A document from a space this run may not touch',
    origin: 'upload',
    connection_id: null,
    url: null,
    updated_at: '2026-09-09T11:00:00.000Z',
    space_id: FOREIGN_SPACE,
  }];
}

function searchHits(foreign: boolean): Record<string, unknown>[] {
  const hits: Record<string, unknown>[] = [
    { chunk_id: CHUNK_A, document_id: DOC_A, space_id: SPACE, content: 'self', score: 0.03 },
    { chunk_id: CHUNK_B, document_id: DOC_B, space_id: SPACE, content: 'other', score: 0.02 },
  ];
  if (!foreign) return hits;
  return [...hits, {
    chunk_id: FOREIGN_CHUNK,
    document_id: FOREIGN_DOC,
    space_id: FOREIGN_SPACE,
    content: 'foreign',
    score: 0.01,
  }];
}

/** One reply function that answers every read all three kinds make. */
function replies(
  overrides: {
    chunks?: Record<string, unknown>[];
    foreign?: boolean;
    connectionB?: string | null;
    /** How many documents the connections pass is given to compare. */
    compared?: number;
    /** Entities the space already knew, as the entities table holds them. */
    known?: Record<string, unknown>[];
    /** What entity_mention_counts answers, which is what decides who gets a summary. */
    counts?: { entity_id: string; mentions: number }[];
  } = {},
): (request: StubRequest) => StubReply | undefined {
  const foreign = overrides.foreign === true;
  return (request) => {
    if (request.table === 'chunks' && request.method === 'GET') {
      const rows = matching(overrides.chunks ?? chunkRows(foreign), request);
      // A single-document read expects one row back, not a list.
      if (request.query.includes('document_id=eq.')) return { body: rows[0] ?? null };
      return { body: rows };
    }
    if (request.table === 'documents' && request.method === 'GET') {
      const rows = matching(
        documentRows({ connectionB: overrides.connectionB, foreign }),
        request,
      );
      // One document unless a test asks for more.
      return {
        body: request.query.includes('origin=neq.dream')
          ? rows.slice(0, overrides.compared ?? 1)
          : rows,
      };
    }
    if (request.table === 'documents' && request.method === 'POST') {
      return { body: { id: DREAM_DOC } };
    }
    if (request.table === 'entities' && request.method === 'GET') {
      // What the space knew before tonight. Empty unless a test says otherwise.
      return { body: overrides.known ?? [] };
    }
    if (request.table === 'entities') {
      // The upsert answers with the rows it wrote, so the caller learns each id.
      const rows = Array.isArray(request.body) ? request.body : [request.body];
      return {
        body: rows.flatMap((row, index) =>
          isRecord(row)
            ? [{
              id: `ee000000-0000-4000-8000-00000000000${index + 1}`,
              kind: row.kind,
              canonical_name: row.canonical_name,
            }]
            : []
        ),
      };
    }
    if (request.table === 'rpc/entity_mention_counts') {
      return { body: overrides.counts ?? [] };
    }
    if (request.table === 'rpc/search') {
      // The rpc takes its scope in the body.
      const asked = isRecord(request.body) && Array.isArray(request.body.space_filter)
        ? request.body.space_filter.map(String)
        : null;
      return {
        body: searchHits(foreign).filter((hit) =>
          asked === null || asked.includes(String(hit.space_id))
        ),
      };
    }
    return undefined;
  };
}

// JSON mode answers with an object, so every fixture here is shaped the way the provider replies.
// The model is asked for names and nothing else; where each name appears is the matcher's job.
function entityAnswer(names: string[] = ['Ada']): string {
  return JSON.stringify({ entities: names.map((name) => ({ kind: 'person', name })) });
}

const RATIONALE_ANSWER = JSON.stringify({
  rationales: [{ pair: 0, rationale: 'Both cover the Northwind renewal.' }],
});

function answerFor(input: CompleteInput): string {
  if (input.user.includes('CANDIDATE PAIRS')) return RATIONALE_ANSWER;
  if (input.system.includes('people, projects')) return entityAnswer();
  if (input.system.includes('one sentence about each')) {
    return JSON.stringify({
      summaries: [{ name: 'Northwind', summary: 'Northwind buys the enterprise plan.' }],
    });
  }
  return 'What changed: the billing page shipped.';
}

function storedText(pieces: unknown[]): string {
  return pieces
    .flatMap((piece) => isRecord(piece) && typeof piece.content === 'string' ? [piece.content] : [])
    .join('\n');
}

function markersIn(text: string): string[] {
  return [...text.matchAll(/\[\[chunk:[^\]]+\]\]/g)].map((match) => match[0]);
}

function writtenBodies(stub: StubDb, table: string): unknown[] {
  return requestsFor(stub, table).filter((request) => request.method !== 'GET').map((r) => r.body);
}

function runUpdates(stub: StubDb): Record<string, unknown>[] {
  return requestsFor(stub, 'dream_runs')
    .filter((request) => request.method === 'PATCH')
    .flatMap((request) => (isRecord(request.body) ? [request.body] : []));
}

/** Every value written under a space_id or space_filter key, however deep. */
function spaceIdsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(spaceIdsIn);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, inner]) => {
    if (key !== 'space_id' && key !== 'space_filter') return spaceIdsIn(inner);
    const values = Array.isArray(inner) ? inner : [inner];
    return values.filter((entry): entry is string => typeof entry === 'string');
  });
}

/** The tables a dream run may only read within its own space. */
const SPACE_SCOPED_TABLES = ['chunks', 'documents', 'entities', 'entity_mentions', 'dream_links'];

/** Every id belonging to the space this run does not own. */
const FOREIGN_IDS = [FOREIGN_SPACE, FOREIGN_DOC, FOREIGN_CHUNK];

for (const kind of ['digest', 'entities', 'connections'] as const) {
  Deno.test(`Reset dreams interrupts a pending ${kind} model request before acknowledging`, async () => {
    let cancelled = false;
    let aborted = false;
    let settled = false;
    const base = replies();
    const stub = stubDb((request) => {
      if (request.table === 'dream_runs' && request.method === 'GET') {
        return { body: [{ error: cancelled ? DREAM_CANCEL_REQUEST : null }] };
      }
      if (
        request.table === 'dream_runs' && request.method === 'PATCH' &&
        isRecord(request.body) && request.body.status === 'failed'
      ) {
        assert(settled, 'acknowledgement must follow the aborted call settling');
        assertEquals(writtenBodies(stub, 'model_calls').length, 1);
      }
      return base(request);
    });
    const waitForCancellation = async (signal?: AbortSignal): Promise<never> => {
      assert(signal);
      cancelled = true;
      try {
        await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(signal.reason);
          }, { once: true });
        });
        throw new Error('unreachable');
      } finally {
        // Simulate accounting that still has to settle after the HTTP abort.
        await new Promise((resolve) => setTimeout(resolve, 10));
        settled = true;
      }
    };
    try {
      const models = createModelRunner({
        db: stub.db,
        apiKey: 'test-key',
        now: () => NOW,
        fetch: (_input, init) => waitForCancellation(init?.signal ?? undefined),
      });
      const result = await runDreamJob(dreamRun(kind), jobDeps(stub, models));
      assert(aborted);
      assertEquals(result, { kind: 'failed', detail: 'cancelled by Reset dreams' });
      for (const table of [...SPACE_SCOPED_TABLES, 'usage_events']) {
        assertEquals(writtenBodies(stub, table), []);
      }
    } finally {
      await stub.close();
    }
  });
}

Deno.test('a claimed run cancelled before its job starts never calls a model', async () => {
  const stub = stubDb((request) =>
    request.table === 'dream_runs' && request.method === 'GET'
      ? { body: [{ error: DREAM_CANCEL_REQUEST }] }
      : replies()(request)
  );
  const models = fakeModels(answerFor);
  try {
    assertEquals((await runDreamJob(dreamRun('digest'), jobDeps(stub, models))).kind, 'failed');
    assertEquals(models.completeCalls, []);
    assertEquals(models.embedCalls, []);
    assertEquals(requestsFor(stub, 'chunks'), []);
  } finally {
    await stub.close();
  }
});

Deno.test('a dream run reads nothing outside its own space', async () => {
  const stub = stubDb(replies({ foreign: true }));
  try {
    for (const kind of ['entities', 'digest', 'connections'] as const) {
      const result = await runDreamJob(dreamRun(kind), jobDeps(stub, fakeModels(answerFor)));
      assertEquals(result.kind, 'succeeded');
    }

    const reads = stub.requests.filter((request) => request.method === 'GET');
    // Not vacuous: a pass that read nothing must not pass this.
    for (const table of ['chunks', 'documents']) {
      assert(reads.some((request) => request.table === table), `nothing read ${table}`);
    }

    for (const request of reads) {
      if (!SPACE_SCOPED_TABLES.includes(request.table)) continue;
      assertEquals(
        eqFilter(request.query, 'space_id'),
        SPACE,
        `a read of ${request.table} was not scoped to this space: ${request.query}`,
      );
    }

    // The search runs as the service role, so this argument is the whole of its scope.
    const searches = requestsFor(stub, 'rpc/search');
    assert(searches.length > 0, 'nothing searched, so the scope was never tested');
    for (const search of searches) {
      assert(isRecord(search.body));
      assertEquals(search.body.space_filter, [SPACE]);
    }
  } finally {
    await stub.close();
  }
});

Deno.test('a dream run writes nothing carrying another space', async () => {
  const stub = stubDb(replies({ foreign: true }));
  try {
    for (const kind of ['entities', 'digest', 'connections'] as const) {
      const result = await runDreamJob(dreamRun(kind), jobDeps(stub, fakeModels(answerFor)));
      assertEquals(result.kind, 'succeeded');
    }

    const writes = stub.requests.filter((request) => request.method !== 'GET');
    // Not vacuous: an implementation that writes nothing must not pass.
    for (const table of ['entities', 'entity_mentions', 'documents', 'chunks', 'dream_links']) {
      assert(
        writes.some((request) => request.table === table),
        `expected the pass to write ${table}`,
      );
    }

    for (const request of writes) {
      for (const spaceId of spaceIdsIn(request.body)) {
        assertEquals(spaceId, SPACE, `${request.table} named a space this run does not own`);
      }
      // A mention or link can also carry a foreign chunk or document id.
      const written = JSON.stringify(request.body ?? null);
      for (const id of FOREIGN_IDS) {
        assert(!written.includes(id), `${request.table} carried ${id}, a row from another space`);
      }
    }
  } finally {
    await stub.close();
  }
});

Deno.test('the run row goes to running and then succeeded', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.inputDocumentCount, 2);
    assertEquals(result.outputDocumentId, DREAM_DOC);

    const updates = runUpdates(stub);
    assertEquals(updates.length, 2);
    assertEquals(updates[0].status, 'running');
    assertEquals(updates[0].started_at, NOW.toISOString());
    assertEquals(updates[1].status, 'succeeded');
    assertEquals(updates[1].finished_at, NOW.toISOString());
    assertEquals(updates[1].input_document_count, 2);
    assertEquals(updates[1].output_document_id, DREAM_DOC);
    assertEquals(updates[1].error, null);
    assertEquals(writtenBodies(stub, 'usage_events').length, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('entities files what the model named and mentions every chunk that says it', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 1);
    assertEquals(result.outputDocumentId, null);

    const entities = writtenBodies(stub, 'entities');
    assertEquals(entities.length, 1);
    assert(Array.isArray(entities[0]));
    assertEquals(entities[0].length, 1);
    assert(isRecord(entities[0][0]));
    assertEquals(entities[0][0].kind, 'person');
    assertEquals(entities[0][0].canonical_name, 'ada');
    assertEquals(entities[0][0].org_id, ORG);

    // Ada is written in the Monday notes and nowhere else, and no model said so.
    const mentions = writtenBodies(stub, 'entity_mentions');
    assertEquals(mentions.length, 1);
    assert(Array.isArray(mentions[0]));
    assertEquals(mentions[0].length, 1);
    assert(isRecord(mentions[0][0]));
    assertEquals(mentions[0][0].chunk_id, CHUNK_A);
    assertEquals(mentions[0][0].document_id, DOC_A);
  } finally {
    await stub.close();
  }
});

// The whole point of the matcher: a name filed on an earlier night is linked tonight for nothing.
Deno.test('a name the space already knew is mentioned again without being asked for', async () => {
  const stub = stubDb(replies({
    known: [{
      id: 'ee000000-0000-4000-8000-0000000000aa',
      kind: 'customer',
      name: 'Northwind',
      canonical_name: 'northwind',
      summary: 'A customer.',
      space_id: SPACE,
    }],
  }));
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    const mentions = writtenBodies(stub, 'entity_mentions');
    assert(Array.isArray(mentions[0]));
    const pairs = mentions[0].flatMap((row) =>
      isRecord(row) ? [`${String(row.entity_id)}:${String(row.chunk_id)}`] : []
    );
    // Ada from tonight's answer, and Northwind from a name the space already held.
    assertEquals(pairs.length, 2);
    assert(pairs.includes(`ee000000-0000-4000-8000-0000000000aa:${CHUNK_B}`));
  } finally {
    await stub.close();
  }
});

// A model that answers with a name nobody wrote is answering about something that is not there.
Deno.test('a name that appears in none of the text is not filed at all', async () => {
  const stub = stubDb(replies());
  const invented = entityAnswer(['Zebulon Holdings']);
  try {
    const result = await runDreamJob(
      dreamRun('entities'),
      jobDeps(stub, fakeModels(() => invented)),
    );

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 0);
    assertEquals(writtenBodies(stub, 'entities').length, 0);
    assertEquals(writtenBodies(stub, 'entity_mentions').length, 0);
  } finally {
    await stub.close();
  }
});

const NORTHWIND = 'ee000000-0000-4000-8000-0000000000aa';

/** Northwind as the entities table holds it, with no summary written yet. */
function knownNorthwind(summary: string | null = null): Record<string, unknown>[] {
  return [{
    id: NORTHWIND,
    kind: 'customer',
    name: 'Northwind',
    canonical_name: 'northwind',
    summary,
    space_id: SPACE,
  }];
}

function summariesWritten(stub: StubDb): Record<string, unknown>[] {
  return requestsFor(stub, 'entities')
    .filter((request) => request.method === 'PATCH')
    .flatMap((request) => (isRecord(request.body) ? [request.body] : []));
}

// The tiering. A thing mentioned once is a name; a thing mentioned again and again is a subject.
Deno.test('a name that keeps coming up is worth a sentence about it', async () => {
  const stub = stubDb(replies({
    known: knownNorthwind(),
    counts: [{ entity_id: NORTHWIND, mentions: 4 }],
  }));
  const models = fakeModels(answerFor);
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, models));

    assert(result.kind === 'succeeded');
    const written = summariesWritten(stub);
    assertEquals(written.length, 1);
    assertEquals(written[0].summary, 'Northwind buys the enterprise plan.');
  } finally {
    await stub.close();
  }
});

Deno.test('a name mentioned once costs no second model call', async () => {
  const stub = stubDb(replies({
    known: knownNorthwind(),
    counts: [{ entity_id: NORTHWIND, mentions: 1 }],
  }));
  const models = fakeModels(answerFor);
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, models));

    assert(result.kind === 'succeeded');
    assertEquals(models.completeCalls.length, 1, 'the summary call was made anyway');
    assertEquals(summariesWritten(stub).length, 0);
  } finally {
    await stub.close();
  }
});

Deno.test('a sentence already written is not paid for twice', async () => {
  const stub = stubDb(replies({
    known: knownNorthwind('A customer, written about last night.'),
    counts: [{ entity_id: NORTHWIND, mentions: 9 }],
  }));
  const models = fakeModels(answerFor);
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, models));

    assert(result.kind === 'succeeded');
    assertEquals(models.completeCalls.length, 1);
    assertEquals(summariesWritten(stub).length, 0);
  } finally {
    await stub.close();
  }
});

// One odd row used to lose the other ninety-nine, and the run with them.
Deno.test('a row the model shaped wrongly costs that row and nothing else', async () => {
  const mixed = JSON.stringify({
    entities: [
      { kind: 'person', name: 'Ada' },
      { kind: 'spaceship', name: 'Ada' },
      { name: 'Northwind' },
      'Northwind',
      { kind: 'customer', name: 'Northwind' },
    ],
  });
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(() => mixed)));

    assert(result.kind === 'succeeded');
    const entities = writtenBodies(stub, 'entities');
    assert(Array.isArray(entities[0]));
    assertEquals(entities[0].length, 2);
    assertEquals(result.produced, 2);
  } finally {
    await stub.close();
  }
});

Deno.test('a hundred names cost two statements, not two hundred', async () => {
  // A round trip per entity would spend the whole budget on network waits.
  const names = Array.from({ length: 100 }, (_, index) => `Person ${index}`);
  const roster = {
    id: CHUNK_A,
    document_id: DOC_A,
    ordinal: 0,
    content: `Present: ${names.join(', ')}.`,
    created_at: '2026-09-09T09:00:00.000Z',
    space_id: SPACE,
  };
  const stub = stubDb(replies({ chunks: [roster] }));
  try {
    const answer = JSON.stringify({
      entities: names.map((name) => ({ kind: 'person', name })),
    });
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(() => answer)));

    assert(result.kind === 'succeeded');
    // Person 1 sits inside Person 10 and is not counted there, so a hundred names are a hundred.
    assertEquals(result.produced, 100);
    assertEquals(writtenBodies(stub, 'entities').length, 1);
    assertEquals(writtenBodies(stub, 'entity_mentions').length, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('one name in two spellings is one row, mentioned from both chunks', async () => {
  // One statement may not write the same row twice.
  const twice = JSON.stringify({
    entities: [{ kind: 'person', name: 'Ada' }, { kind: 'person', name: 'Ada.' }],
  });
  const both = [
    {
      id: CHUNK_A,
      document_id: DOC_A,
      ordinal: 0,
      content: 'Ada agreed to ship the billing page on Friday.',
      created_at: '2026-09-09T09:00:00.000Z',
      space_id: SPACE,
    },
    {
      id: CHUNK_B,
      document_id: DOC_B,
      ordinal: 0,
      content: 'Ada. also picked up the Northwind renewal.',
      created_at: '2026-09-09T10:00:00.000Z',
      space_id: SPACE,
    },
  ];
  const stub = stubDb(replies({ chunks: both }));
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(() => twice)));

    assert(result.kind === 'succeeded');
    const entities = writtenBodies(stub, 'entities');
    assert(Array.isArray(entities[0]));
    assertEquals(entities[0].length, 1);

    const mentions = writtenBodies(stub, 'entity_mentions');
    assert(Array.isArray(mentions[0]));
    assertEquals(mentions[0].length, 2);
    // Both mentions belong to the one row that was written.
    const ids = new Set(mentions[0].flatMap((row) => isRecord(row) ? [row.entity_id] : []));
    assertEquals(ids.size, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('the connections pass reads and embeds a page at a time, not a document', async () => {
  // Only the searches are asked one at a time; the reads and embeds are batched.
  const stub = stubDb(replies({ compared: 2 }));
  const models = fakeModels(answerFor);
  try {
    const result = await runDreamJob(dreamRun('connections'), jobDeps(stub, models));

    assert(result.kind === 'succeeded');
    const chunkReads = requestsFor(stub, 'chunks').filter((request) => request.method === 'GET');
    assertEquals(chunkReads.length, 1, 'the opening chunks were read one document at a time');
    assertEquals(models.embedCalls.length, 1, 'the documents were embedded one at a time');
    assertEquals(models.embedCalls[0].length, 2);
    assertEquals(requestsFor(stub, 'rpc/search').length, 2);
  } finally {
    await stub.close();
  }
});

Deno.test('a model answer that is not JSON fails the run and writes no entities', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(
      dreamRun('entities'),
      jobDeps(stub, fakeModels(() => 'Sure! Here are the entities I found: Ada, Northwind.')),
    );

    assert(result.kind === 'failed');
    assert(result.detail.length > 0);
    assertEquals(writtenBodies(stub, 'entities').length, 0);
    assertEquals(writtenBodies(stub, 'entity_mentions').length, 0);

    const updates = runUpdates(stub);
    assertEquals(updates[1].status, 'failed');
    // The failure knows no stage of its own, so the pass has to have left one.
    assertEquals(updates[1].error, `extract: ${result.detail}`);
    assert(STAGES.includes(stageOf(String(updates[1].error))));
    assertEquals(updates[1].finished_at, NOW.toISOString());
  } finally {
    await stub.close();
  }
});

Deno.test('a JSON answer wrapped in a markdown code fence still parses', async () => {
  const stub = stubDb(replies());
  try {
    const fenced = '```json\n' + entityAnswer() + '\n```';
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, fakeModels(() => fenced)));

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 1);
    assertEquals(writtenBodies(stub, 'entities').length, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('a digest never reads an earlier dream, so a night of digests is not its own input', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    const [read] = requestsFor(stub, 'chunks').filter((request) => request.method === 'GET');
    assert(read !== undefined);
    // The filter rides on the document, which the read joins for that one column.
    assert(read.query.includes('documents!inner(origin)'), read.query);
    assert(read.query.includes('documents.origin=neq.dream'), read.query);
  } finally {
    await stub.close();
  }
});

Deno.test('a digest cites every chunk it read, in documents.source_chunk_ids', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.outputDocumentId, DREAM_DOC);

    const documents = writtenBodies(stub, 'documents');
    assertEquals(documents.length, 1);
    assert(isRecord(documents[0]));
    assertEquals(documents[0].origin, 'dream');
    assertEquals(documents[0].dream_run_id, RUN);
    assertEquals(documents[0].space_id, SPACE);

    // Citations live in the column, which the client resolves through RLS on read.
    assertEquals(documents[0].source_chunk_ids, [CHUNK_A, CHUNK_B]);

    const chunks = writtenBodies(stub, 'chunks');
    assertEquals(chunks.length, 1);
    assert(Array.isArray(chunks[0]));
    // Citations are not prose, so nothing shaped like one is embedded.
    assertEquals(markersIn(storedText(chunks[0])), []);
    assert(isRecord(chunks[0][0]));
    assert(Array.isArray(chunks[0][0].embedding));
  } finally {
    await stub.close();
  }
});

Deno.test('a chunk the model invented is never cited', async () => {
  // The citation list is built from what went into the prompt, not from the answer.
  const stub = stubDb(replies());
  const invented = `What changed: the billing page shipped. [[chunk:${FOREIGN_CHUNK}]]`;
  try {
    const result = await runDreamJob(
      dreamRun('digest'),
      jobDeps(stub, fakeModels(() => invented)),
    );

    assert(result.kind === 'succeeded');
    const documents = writtenBodies(stub, 'documents');
    assert(isRecord(documents[0]));
    assertEquals(documents[0].source_chunk_ids, [CHUNK_A, CHUNK_B]);

    const chunks = writtenBodies(stub, 'chunks');
    assert(Array.isArray(chunks[0]));
    const text = storedText(chunks[0]);
    assert(!text.includes(FOREIGN_CHUNK), 'a chunk the model was never given was cited');
    assertEquals(markersIn(text), []);
  } finally {
    await stub.close();
  }
});

Deno.test('a run that read nothing writes no document rather than an uncited one', async () => {
  // An empty source_chunk_ids would be a claim with no source.
  const stub = stubDb(replies({ chunks: [] }));
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.outputDocumentId, null);
    assertEquals(writtenBodies(stub, 'documents').length, 0);
  } finally {
    await stub.close();
  }
});

Deno.test('connections scopes the search to its own space and skips same-source hits', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('connections'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 1);
    assertEquals(result.outputDocumentId, null);

    const search = requestsFor(stub, 'rpc/search');
    assertEquals(search.length, 1);
    assert(isRecord(search[0].body));
    assertEquals(search[0].body.space_filter, [SPACE]);

    const links = writtenBodies(stub, 'dream_links');
    assert(Array.isArray(links[0]));
    // The self hit and the foreign-space hit are both gone.
    assertEquals(links[0].length, 1);
    assert(isRecord(links[0][0]));
    assertEquals(links[0][0].document_a, DOC_A);
    assertEquals(links[0][0].document_b, DOC_B);
    assertEquals(links[0][0].dream_run_id, RUN);
  } finally {
    await stub.close();
  }
});

Deno.test('a hit from the same source as its document is not a connection', async () => {
  const stub = stubDb(replies({ connectionB: 'conn-1' }));
  try {
    const result = await runDreamJob(dreamRun('connections'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.produced, 0);
    assertEquals(writtenBodies(stub, 'dream_links').length, 0);
  } finally {
    await stub.close();
  }
});

Deno.test('a spent budget reports the stage it died in', async () => {
  const stub = stubDb(replies());
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor), 0));

    assert(result.kind === 'timeout');
    assertEquals(result.stage, 'collect');

    const updates = runUpdates(stub);
    assertEquals(updates[1].status, 'timeout');
    assertEquals(updates[1].finished_at, NOW.toISOString());
    const error = String(updates[1].error);
    assertEquals(stageOf(error), 'collect');
    assertStringIncludes(error, 'collect: ');
    assertStringIncludes(error, 'ran out of time');
  } finally {
    await stub.close();
  }
});

Deno.test('every stage a run can stop in is one of the four the client knows', async () => {
  const seen = new Set<string>();
  // Walking the clock forward stops each kind at each checkpoint in turn.
  for (const kind of ['entities', 'digest', 'connections'] as const) {
    for (let ticks = 1; ticks <= 30; ticks += 1) {
      const stub = stubDb(replies());
      try {
        const result = await runDreamJob(
          dreamRun(kind),
          jobDeps(stub, fakeModels(answerFor), 1_000, jumpingClock(NOW, ticks).now),
        );
        if (result.kind !== 'timeout') continue;
        const stage = stageOf(String(runUpdates(stub)[1].error));
        assert(STAGES.includes(stage), `${kind} named a stage the client cannot read: ${stage}`);
        seen.add(stage);
      } finally {
        await stub.close();
      }
    }
  }
  assertEquals([...seen].sort(), [...STAGES].sort());
});

Deno.test('an empty space succeeds with nothing produced', async () => {
  const stub = stubDb(replies({ chunks: [] }));
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));

    assert(result.kind === 'succeeded');
    assertEquals(result.inputDocumentCount, 0);
    assertEquals(result.produced, 0);
    assertEquals(result.outputDocumentId, null);
    // An uncited digest is not written at all.
    assertEquals(writtenBodies(stub, 'documents').length, 0);
    assertEquals(writtenBodies(stub, 'chunks').length, 0);
    assertEquals(runUpdates(stub)[1].status, 'succeeded');
  } finally {
    await stub.close();
  }
});

Deno.test('citations are listed in the order the digest read them', async () => {
  // The client numbers these, so read order has to be write order.
  const reversed = [
    {
      id: CHUNK_B,
      document_id: DOC_B,
      ordinal: 0,
      content: 'b',
      created_at: '2026-09-09T09:00:00.000Z',
      space_id: SPACE,
    },
    {
      id: CHUNK_A,
      document_id: DOC_A,
      ordinal: 0,
      content: 'a',
      created_at: '2026-09-09T10:00:00.000Z',
      space_id: SPACE,
    },
  ];
  const stub = stubDb(replies({ chunks: reversed }));
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, fakeModels(answerFor)));
    assert(result.kind === 'succeeded');

    const documents = writtenBodies(stub, 'documents');
    assert(isRecord(documents[0]));
    assertEquals(documents[0].source_chunk_ids, [CHUNK_B, CHUNK_A]);
  } finally {
    await stub.close();
  }
});

Deno.test('a run that stopped early records the documents it had reached', async () => {
  // A timed out run records how many documents it reached, and the client shows it.
  const stopped: number[] = [];

  for (const kind of ['entities', 'digest', 'connections'] as const) {
    for (let ticks = 1; ticks <= 30; ticks += 1) {
      const stub = stubDb(replies());
      try {
        const result = await runDreamJob(
          dreamRun(kind),
          jobDeps(stub, fakeModels(answerFor), 1_000, jumpingClock(NOW, ticks).now),
        );
        if (result.kind !== 'timeout') continue;

        const terminal = runUpdates(stub)[1];
        assertEquals(terminal.status, 'timeout');
        const count = terminal.input_document_count;
        assert(typeof count === 'number', 'a timed out run recorded no document count');
        stopped.push(count);
      } finally {
        await stub.close();
      }
    }
  }

  assert(stopped.length > 0, 'no kind timed out, so nothing was measured');
  // A run stopped after its first read has to say what it got through.
  assert(
    stopped.some((count) => count > 0),
    'every timed out run claimed to have read zero documents',
  );
});

Deno.test('a failure records what it had reached too, not a zero', async () => {
  const stub = stubDb(replies());
  try {
    // An unparseable answer fails the entities pass after the chunks were read.
    const result = await runDreamJob(
      dreamRun('entities'),
      jobDeps(stub, fakeModels(() => 'not json at all')),
    );

    assertEquals(result.kind, 'failed');
    const terminal = runUpdates(stub)[1];
    assertEquals(terminal.status, 'failed');
    assertEquals(terminal.input_document_count, 2);
  } finally {
    await stub.close();
  }
});

Deno.test('Dream events describe actual processing and output without document contents', async () => {
  const stub = stubDb(replies());
  const events: import('./dream_pass.ts').DreamEvent[] = [];
  try {
    const result = await runDreamJob(dreamRun('digest'), {
      ...jobDeps(stub, fakeModels(answerFor)),
      observeDream: (event) => events.push(event),
    });
    assertEquals(result.kind, 'succeeded');
    assertEquals(events[0].event, 'started');
    assertEquals(events.filter((event) => event.event === 'stage').map((event) => event.stage), [
      'collect',
      'synthesize',
      'write',
      'write',
      'write',
    ]);
    assertEquals(events.at(-1)?.event, 'completed');
    assertEquals(events.at(-1)?.input_document_count, 2);
    assertEquals(events.at(-1)?.output_document_id, DREAM_DOC);
    assertEquals(JSON.stringify(events).includes('Northwind'), false);
  } finally {
    await stub.close();
  }
});

Deno.test('a Dream timeout emits a terminal event for the stage that stopped', async () => {
  const stub = stubDb(replies());
  const events: import('./dream_pass.ts').DreamEvent[] = [];
  try {
    await runDreamJob(dreamRun('digest'), {
      ...jobDeps(stub, fakeModels(answerFor), 0),
      observeDream: (event) => events.push(event),
    });
    assertEquals(events.at(-1)?.event, 'timeout');
    assertEquals(events.at(-1)?.stage, 'collect');
    assertEquals(events.some((event) => event.event === 'completed'), false);
  } finally {
    await stub.close();
  }
});

Deno.test('Dream reports a failed status write instead of a completed run', async () => {
  const reply = replies();
  const stub = stubDb((request) => {
    if (
      request.table === 'dream_runs' && isRecord(request.body) &&
      request.body.status === 'succeeded'
    ) {
      return { status: 500, body: { message: 'database unavailable' } };
    }
    return reply(request);
  });
  const events: import('./dream_pass.ts').DreamEvent[] = [];
  try {
    const result = await runDreamJob(dreamRun('digest'), {
      ...jobDeps(stub, fakeModels(answerFor)),
      observeDream: (event) => events.push(event),
    });
    assertEquals(result.kind, 'failed');
    assertEquals(events.some((event) => event.event === 'completed'), false);
    assertEquals(events.at(-1)?.event, 'failed');
  } finally {
    await stub.close();
  }
});

Deno.test('all 441 eligible entity chunks are processed and a repeated summary is paid for once', async () => {
  const chunks = Array.from({ length: 441 }, (_, index) => ({
    id: `chunk-${index}`,
    document_id: `document-${index}`,
    ordinal: 0,
    content: `Northwind note ${index}`,
    created_at: NOW.toISOString(),
    space_id: SPACE,
  }));
  const fallback = replies({
    known: knownNorthwind(),
    counts: [{ entity_id: NORTHWIND, mentions: 500 }],
  });
  const stub = stubDb((request) => {
    if (request.table === 'chunks' && request.method === 'GET') {
      const params = new URLSearchParams(request.query);
      const offset = Number(params.get('offset') ?? 0);
      return { body: chunks.slice(offset, offset + Number(params.get('limit') ?? 400)) };
    }
    return fallback(request);
  });
  const models = fakeModels((input) =>
    input.system.includes('one sentence')
      ? JSON.stringify({ summaries: [{ name: 'Northwind', summary: 'A customer.' }] })
      : JSON.stringify({ entities: [] })
  );
  try {
    const result = await runDreamJob(dreamRun('entities'), jobDeps(stub, models));
    assertEquals(result.kind, 'succeeded');
    if (result.kind === 'succeeded') assertEquals(result.inputDocumentCount, 441);
    assertEquals(summariesWritten(stub).length, 1);
    assertEquals(
      models.completeCalls.filter((call) => !call.system.includes('one sentence')).length,
      12,
    );
    const mentions = requestsFor(stub, 'entity_mentions').flatMap((r) =>
      Array.isArray(r.body) ? r.body : []
    );
    assertEquals(mentions.length, 441);
  } finally {
    await stub.close();
  }
});

Deno.test('entity summaries have a run-wide allowance of 25 across batches', async () => {
  const known = Array.from({ length: 30 }, (_, index) => ({
    id: `entity-${index}`,
    kind: 'project',
    name: `Project ${index}X`,
    canonical_name: `project ${index}x`,
    summary: null,
  }));
  const chunks = Array.from({ length: 81 }, (_, index) => ({
    id: `chunk-${index}`,
    document_id: `document-${index}`,
    ordinal: 0,
    content: known.map((entity) => entity.name).join(' '),
    created_at: NOW.toISOString(),
    space_id: SPACE,
  }));
  const stub = stubDb(
    replies({
      chunks,
      known,
      counts: known.map((entity) => ({ entity_id: entity.id, mentions: 5 })),
    }),
  );
  const models = fakeModels((input) =>
    input.system.includes('one sentence')
      ? JSON.stringify({
        summaries: known.slice(0, 25).map((entity) => ({
          name: entity.name,
          summary: 'A project.',
        })),
      })
      : JSON.stringify({ entities: [] })
  );
  try {
    assertEquals(
      (await runDreamJob(dreamRun('entities'), jobDeps(stub, models))).kind,
      'succeeded',
    );
    assertEquals(summariesWritten(stub).length, 25);
    assertEquals(
      models.completeCalls.filter((call) => call.system.includes('one sentence')).length,
      1,
    );
  } finally {
    await stub.close();
  }
});

Deno.test('a digest covers all 241 chunks through bounded model batches', async () => {
  const chunks = Array.from({ length: 241 }, (_, index) => ({
    id: `chunk-${index}`,
    document_id: `document-${index}`,
    ordinal: 0,
    content: `Document note ${index}`,
    created_at: NOW.toISOString(),
    space_id: SPACE,
  }));
  const fallback = replies();
  const stub = stubDb((request) => {
    if (request.table === 'chunks' && request.method === 'GET') {
      const params = new URLSearchParams(request.query);
      const offset = Number(params.get('offset') ?? 0);
      return { body: chunks.slice(offset, offset + Number(params.get('limit') ?? 120)) };
    }
    return fallback(request);
  });
  const models = fakeModels(() => 'A cited digest of the notes.');
  try {
    const result = await runDreamJob(dreamRun('digest'), jobDeps(stub, models));
    assertEquals(result.kind, 'succeeded');
    if (result.kind === 'succeeded') assertEquals(result.inputDocumentCount, 241);
    assertEquals(models.completeCalls.length, 3);
    assertEquals(models.completeCalls.at(-1)?.user, '[chunk-240]\nDocument note 240');
  } finally {
    await stub.close();
  }
});

Deno.test('connections compare every eligible document beyond the 40-document page', async () => {
  const docs = Array.from({ length: 41 }, (_, index) => ({
    id: `doc-${index}`,
    title: `Document ${index}`,
    origin: 'upload',
    connection_id: null,
    url: null,
    updated_at: NOW.toISOString(),
    space_id: SPACE,
  }));
  const stub = stubDb((request) => {
    if (request.table === 'documents' && request.method === 'GET') {
      const params = new URLSearchParams(request.query);
      const offset = Number(params.get('offset') ?? 0);
      return { body: docs.slice(offset, offset + Number(params.get('limit') ?? 40)) };
    }
    if (request.table === 'chunks' && request.method === 'GET') {
      const ids = inFilter(request.query, 'document_id');
      return {
        body: docs.filter((doc) => ids?.has(doc.id)).map((doc) => ({
          id: `chunk-${doc.id}`,
          document_id: doc.id,
          content: doc.title,
        })),
      };
    }
    return { body: [] };
  });
  const models = fakeModels(() => '');
  try {
    const result = await runDreamJob(dreamRun('connections'), jobDeps(stub, models));
    assertEquals(result.kind, 'succeeded');
    if (result.kind === 'succeeded') assertEquals(result.inputDocumentCount, 41);
    assertEquals(models.embedCalls.map((texts) => texts.length), [40, 1]);
  } finally {
    await stub.close();
  }
});
