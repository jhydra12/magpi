import { describe, expect, it, vi } from 'vitest';

import { recordingContext, type StubResponse } from '@/lib/supabase/test-support';

vi.mock('server-only', () => ({}));

const { loadDreamRun, loadDreamsPage, loadEntities } = await import('./queries');

const SPACE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_SPACE_ID = '33333333-3333-4333-8333-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const OUTPUT_ID = '66666666-6666-4666-8666-666666666666';

type Space = { id: string; name: string; dreaming_enabled: boolean };

const getSpace = (overrides: Partial<Space> = {}): Space => ({
  id: SPACE_ID,
  name: 'Engineering',
  dreaming_enabled: true,
  ...overrides,
});

type Run = {
  id: string;
  space_id: string;
  kind: 'entities' | 'digest' | 'connections';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timeout';
  started_at: string | null;
  finished_at: string | null;
  input_document_count: number;
  output_document_id: string | null;
  error: string | null;
  created_at: string;
};

const getRun = (overrides: Partial<Run> = {}): Run => ({
  id: RUN_ID,
  space_id: SPACE_ID,
  kind: 'digest',
  status: 'succeeded',
  started_at: '2026-09-09T02:00:00.000Z',
  finished_at: '2026-09-09T02:01:30.000Z',
  input_document_count: 12,
  output_document_id: OUTPUT_ID,
  error: null,
  created_at: '2026-09-09T02:00:00.000Z',
  ...overrides,
});

type OutputDocument = { id: string; title: string | null; source_chunk_ids: string[] };

const getOutputDocument = (overrides: Partial<OutputDocument> = {}): OutputDocument => ({
  id: OUTPUT_ID,
  title: 'What changed in Engineering on 9 September',
  source_chunk_ids: ['chunk-a', 'chunk-b'],
  ...overrides,
});

type CitedChunk = {
  id: string;
  content: string;
  document_id: string;
  documents: { title: string } | null;
};

const getCitedChunk = (overrides: Partial<CitedChunk> = {}): CitedChunk => ({
  id: 'chunk-a',
  content: 'The SSO rollout slipped to October.',
  document_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  documents: { title: 'Q3 platform notes' },
  ...overrides,
});

type Link = {
  id: string;
  document_a: string;
  document_b: string;
  similarity: number;
  rationale: string | null;
  confirmed_at: string | null;
  dismissed_at: string | null;
};

const getLink = (overrides: Partial<Link> = {}): Link => ({
  id: 'link-1',
  document_a: 'doc-a',
  document_b: 'doc-b',
  similarity: 0.91,
  rationale: 'Both describe the SSO rollout slipping.',
  confirmed_at: null,
  dismissed_at: null,
  ...overrides,
});

type LinkedDocument = { id: string; title: string; url: string | null; origin: string };

const getLinkedDocument = (overrides: Partial<LinkedDocument> = {}): LinkedDocument => ({
  id: 'doc-a',
  title: 'SSO rollout',
  url: 'https://linear.app/issue/1',
  origin: 'sync',
  ...overrides,
});

type Entity = {
  id: string;
  kind: 'person' | 'project' | 'customer' | 'decision';
  name: string;
  summary: string | null;
  space_id: string;
};

const getEntity = (overrides: Partial<Entity> = {}): Entity => ({
  id: 'entity-1',
  kind: 'project',
  name: 'SSO rollout',
  summary: 'Single sign on for the enterprise tier.',
  space_id: SPACE_ID,
  ...overrides,
});

/** A run whose detail needs no output document and no link candidates. */
function detailResponses(overrides: Record<string, readonly StubResponse[]> = {}) {
  return {
    dream_runs: [{ data: getRun({ output_document_id: null }) }],
    spaces: [{ data: [getSpace()] }],
    ...overrides,
  };
}

describe('the dreams page', () => {
  it('rolls a night of runs into one dream with the space, the clock, and the counts', async () => {
    const { context } = recordingContext({
      responses: {
        spaces: [{ data: [getSpace()] }],
        dream_runs: [
          {
            data: [
              getRun({ input_document_count: 7 }),
              getRun({ id: 'run-links', kind: 'connections', output_document_id: null }),
            ],
          },
        ],
        dream_links: [{ data: [{ dream_run_id: 'run-links' }, { dream_run_id: 'run-links' }] }],
      },
    });

    const page = await loadDreamsPage(context);

    expect(page.nights).toHaveLength(1);
    expect(page.nights[0].spaceName).toBe('Engineering');
    expect(page.nights[0].nightLabel).toBe('9 Sept 2026');
    expect(page.nights[0].durationLabel).toBe('3m 0s');
    expect(page.nights[0].documentsIngested).toBe(12);
    expect(page.nights[0].connectionsMade).toBe(2);
    expect(page.spaces).toEqual([getSpace()]);
  });

  it('reads the most recent runs first, enough for weeks of nights', async () => {
    const { context, callsFor } = recordingContext({
      responses: {
        spaces: [{ data: [] }],
        dream_runs: [{ data: [] }],
        dream_links: [{ data: [] }],
      },
    });

    await loadDreamsPage(context);

    expect(callsFor('dream_runs')).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(callsFor('dream_runs')).toContainEqual(['limit', 150]);
  });

  it('counts only the links of the runs it listed', async () => {
    const { context, callsFor } = recordingContext({
      responses: {
        spaces: [{ data: [getSpace()] }],
        dream_runs: [{ data: [getRun()] }],
        dream_links: [{ data: [] }],
      },
    });

    await loadDreamsPage(context);

    expect(callsFor('dream_links')).toContainEqual(['in', 'dream_run_id', [RUN_ID]]);
  });

  it('leaves out a run from a space this reader cannot open', async () => {
    const { context } = recordingContext({
      responses: {
        spaces: [{ data: [getSpace()] }],
        dream_runs: [{ data: [getRun(), getRun({ id: 'run-hidden', space_id: OTHER_SPACE_ID })] }],
        dream_links: [{ data: [] }],
      },
    });

    const page = await loadDreamsPage(context);

    expect(page.nights.map((night) => night.spaceId)).toEqual([SPACE_ID]);
  });

  it('throws when the database refuses the runs, rather than showing an empty history', async () => {
    const { context } = recordingContext({
      responses: {
        spaces: [{ data: [getSpace()] }],
        dream_runs: [{ error: { message: 'permission denied for table dream_runs' } }],
      },
    });

    await expect(loadDreamsPage(context)).rejects.toThrow('permission denied for table dream_runs');
  });

  it('throws when the links behind the counts cannot be read', async () => {
    const { context } = recordingContext({
      responses: {
        spaces: [{ data: [getSpace()] }],
        dream_runs: [{ data: [getRun()] }],
        dream_links: [{ error: { message: 'permission denied for table dream_links' } }],
      },
    });

    await expect(loadDreamsPage(context)).rejects.toThrow(
      'permission denied for table dream_links',
    );
  });

  it('throws when the spaces behind the runs cannot be read', async () => {
    const { context } = recordingContext({
      responses: {
        spaces: [{ error: { message: 'permission denied for table spaces' } }],
        dream_runs: [{ data: [] }],
      },
    });

    await expect(loadDreamsPage(context)).rejects.toThrow('permission denied for table spaces');
  });
});

describe('opening one dream run', () => {
  it('answers with nothing for a run outside the spaces this reader holds', async () => {
    const { context } = recordingContext({
      responses: { dream_runs: [{ data: null }], spaces: [{ data: [getSpace()] }] },
    });

    expect(await loadDreamRun(context, RUN_ID)).toBeNull();
  });

  it('answers with nothing when the space behind the run is no longer visible', async () => {
    const { context } = recordingContext({
      responses: {
        dream_runs: [{ data: getRun({ space_id: OTHER_SPACE_ID }) }],
        spaces: [{ data: [getSpace()] }],
      },
    });

    expect(await loadDreamRun(context, RUN_ID)).toBeNull();
  });

  it('asks for the one run it was given', async () => {
    const { context, callsFor } = recordingContext({ responses: detailResponses() });

    await loadDreamRun(context, RUN_ID);

    expect(callsFor('dream_runs')).toContainEqual(['eq', 'id', RUN_ID]);
  });

  it('reads the digest with its sources, numbered in the order the run recorded', async () => {
    const { context } = recordingContext({
      responses: {
        dream_runs: [{ data: getRun() }],
        spaces: [{ data: [getSpace()] }],
        documents: [{ data: getOutputDocument() }],
        chunks: [
          {
            data: [
              { content: 'Second half.', ordinal: 1 },
              { content: 'First half.', ordinal: 0 },
            ],
          },
          {
            data: [
              getCitedChunk({ id: 'chunk-b', content: 'Billing moved to Stripe.' }),
              getCitedChunk({ id: 'chunk-a' }),
            ],
          },
        ],
      },
    });

    const detail = await loadDreamRun(context, RUN_ID);

    expect(detail?.output).toEqual({
      kind: 'cited',
      documentId: OUTPUT_ID,
      title: 'What changed in Engineering on 9 September',
      body: 'Second half.\n\nFirst half.',
      sources: [
        {
          index: 1,
          chunkId: 'chunk-a',
          documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          documentTitle: 'Q3 platform notes',
          excerpt: 'The SSO rollout slipped to October.',
        },
        {
          index: 2,
          chunkId: 'chunk-b',
          documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          documentTitle: 'Q3 platform notes',
          excerpt: 'Billing moved to Stripe.',
        },
      ],
    });
  });

  it('drops a source the reader can no longer reach, without failing the page', async () => {
    const { context } = recordingContext({
      responses: {
        dream_runs: [{ data: getRun() }],
        spaces: [{ data: [getSpace()] }],
        documents: [{ data: getOutputDocument() }],
        chunks: [{ data: [{ content: 'The digest.', ordinal: 0 }] }, { data: [getCitedChunk()] }],
      },
    });

    const detail = await loadDreamRun(context, RUN_ID);

    expect(detail?.output.kind).toBe('cited');
    if (detail?.output.kind === 'cited') {
      expect(detail.output.sources.map((source) => source.chunkId)).toEqual(['chunk-a']);
    }
  });

  it('names a source whose own document title is out of reach', async () => {
    const { context } = recordingContext({
      responses: {
        dream_runs: [{ data: getRun() }],
        spaces: [{ data: [getSpace()] }],
        documents: [{ data: getOutputDocument({ source_chunk_ids: ['chunk-a'] }) }],
        chunks: [
          { data: [{ content: 'The digest.', ordinal: 0 }] },
          { data: [getCitedChunk({ documents: null })] },
        ],
      },
    });

    const detail = await loadDreamRun(context, RUN_ID);

    if (detail?.output.kind !== 'cited') throw new Error('expected a cited digest');
    expect(detail.output.sources[0].documentTitle).toBe('Untitled');
  });

  it('shortens a long source to something a person can scan', async () => {
    const sentence = 'The migration ran for eleven minutes and finished cleanly. ';
    const { context } = recordingContext({
      responses: {
        dream_runs: [{ data: getRun() }],
        spaces: [{ data: [getSpace()] }],
        documents: [{ data: getOutputDocument({ source_chunk_ids: ['chunk-a'] }) }],
        chunks: [{ data: [] }, { data: [getCitedChunk({ content: `  ${sentence.repeat(6)}  ` })] }],
      },
    });

    const detail = await loadDreamRun(context, RUN_ID);

    if (detail?.output.kind !== 'cited') throw new Error('expected a cited digest');
    expect(detail.output.sources[0].excerpt).toHaveLength(243);
    expect(detail.output.sources[0].excerpt.endsWith('...')).toBe(true);
  });

  it('still shows a digest whose evidence has been deleted, and says how much it cited', async () => {
    const { context } = recordingContext({
      responses: {
        dream_runs: [{ data: getRun() }],
        spaces: [{ data: [getSpace()] }],
        documents: [{ data: getOutputDocument() }],
        chunks: [{ data: [{ content: 'The digest.', ordinal: 0 }] }, { data: [] }],
      },
    });

    const detail = await loadDreamRun(context, RUN_ID);

    expect(detail?.output).toEqual({
      kind: 'sources-gone',
      documentId: OUTPUT_ID,
      title: 'What changed in Engineering on 9 September',
      body: 'The digest.',
      citedCount: 2,
    });
  });

  it('reads a citation query the database refused as evidence that is gone', async () => {
    const { context } = recordingContext({
      responses: {
        dream_runs: [{ data: getRun() }],
        spaces: [{ data: [getSpace()] }],
        documents: [{ data: getOutputDocument() }],
        chunks: [
          { error: { message: 'permission denied' } },
          { error: { message: 'permission denied' } },
        ],
      },
    });

    const detail = await loadDreamRun(context, RUN_ID);

    expect(detail?.output.kind).toBe('sources-gone');
    if (detail?.output.kind === 'sources-gone') expect(detail.output.body).toBe('');
  });

  it('reads a run that cited nothing as uncited rather than as a digest with no sources', async () => {
    const { context } = recordingContext({
      responses: {
        dream_runs: [{ data: getRun() }],
        spaces: [{ data: [getSpace()] }],
        documents: [{ data: getOutputDocument({ source_chunk_ids: [], title: null }) }],
        chunks: [{ data: [] }, { data: [] }],
      },
    });

    const detail = await loadDreamRun(context, RUN_ID);

    expect(detail?.output).toEqual({ kind: 'uncited', documentId: OUTPUT_ID, title: 'Untitled' });
  });

  it('reads a run that wrote no document as having no output', async () => {
    const { context, callsFor } = recordingContext({ responses: detailResponses() });

    const detail = await loadDreamRun(context, RUN_ID);

    expect(detail?.output).toEqual({ kind: 'none' });
    expect(callsFor('documents')).toEqual([]);
  });

  it('reads a run whose output document the reader cannot open as having no output', async () => {
    const { context } = recordingContext({
      responses: {
        dream_runs: [{ data: getRun() }],
        spaces: [{ data: [getSpace()] }],
        documents: [{ data: null }],
        chunks: [{ data: [] }],
      },
    });

    const detail = await loadDreamRun(context, RUN_ID);

    expect(detail?.output).toEqual({ kind: 'none' });
  });

  it('lists the pairs a connections run found, strongest first, for a person to judge', async () => {
    const { context, callsFor } = recordingContext({
      responses: detailResponses({
        dream_runs: [{ data: getRun({ kind: 'connections', output_document_id: null }) }],
        dream_links: [{ data: [getLink()] }],
        documents: [
          {
            data: [
              getLinkedDocument(),
              getLinkedDocument({ id: 'doc-b', title: 'Slack: sso thread' }),
            ],
          },
        ],
      }),
    });

    const detail = await loadDreamRun(context, RUN_ID);

    expect(detail?.candidates).toHaveLength(1);
    expect(detail?.candidates[0].documentB.title).toBe('Slack: sso thread');
    expect(detail?.candidates[0].similarityLabel).toBe('91% similar');
    expect(callsFor('dream_links')).toContainEqual(['eq', 'dream_run_id', RUN_ID]);
    expect(callsFor('dream_links')).toContainEqual(['order', 'similarity', { ascending: false }]);
  });

  it('asks for no documents when a connections run found no pairs', async () => {
    const { context, callsFor } = recordingContext({
      responses: detailResponses({
        dream_runs: [{ data: getRun({ kind: 'connections', output_document_id: null }) }],
        dream_links: [{ data: [] }],
      }),
    });

    const detail = await loadDreamRun(context, RUN_ID);

    expect(detail?.candidates).toEqual([]);
    expect(callsFor('documents')).toEqual([]);
  });

  it('reads a refused link query as no pairs rather than as a failure', async () => {
    const { context } = recordingContext({
      responses: detailResponses({
        dream_runs: [{ data: getRun({ kind: 'connections', output_document_id: null }) }],
        dream_links: [{ error: { message: 'permission denied' } }],
      }),
    });

    expect((await loadDreamRun(context, RUN_ID))?.candidates).toEqual([]);
  });

  it('holds back a pair whose documents came back empty, since it cannot be judged', async () => {
    const { context } = recordingContext({
      responses: detailResponses({
        dream_runs: [{ data: getRun({ kind: 'connections', output_document_id: null }) }],
        dream_links: [{ data: [getLink()] }],
        documents: [{ error: { message: 'permission denied' } }],
      }),
    });

    expect((await loadDreamRun(context, RUN_ID))?.candidates).toEqual([]);
  });

  it('does not look for link candidates on a digest run', async () => {
    const { context, callsFor } = recordingContext({ responses: detailResponses() });

    await loadDreamRun(context, RUN_ID);

    expect(callsFor('dream_links')).toEqual([]);
  });
});

describe('the entities a dream extracted', () => {
  it('groups entities by kind and names the documents each was found in', async () => {
    const { context } = recordingContext({
      responses: {
        spaces: [{ data: [getSpace()] }],
        entities: [{ data: [getEntity()] }],
        entity_mentions: [{ data: [{ entity_id: 'entity-1', document_id: 'doc-a' }] }],
        documents: [{ data: [{ id: 'doc-a', title: 'SSO rollout', url: null }] }],
      },
    });

    const page = await loadEntities(context);

    expect(page.groups).toEqual([
      {
        kind: 'project',
        label: 'Projects',
        entities: [
          {
            id: 'entity-1',
            name: 'SSO rollout',
            summary: 'Single sign on for the enterprise tier.',
            documents: [{ id: 'doc-a', title: 'SSO rollout', url: null }],
          },
        ],
      },
    ]);
  });

  it('narrows to one space when a reader picks one', async () => {
    const { context, callsFor } = recordingContext({
      responses: { spaces: [{ data: [getSpace()] }], entities: [{ data: [] }] },
    });

    await loadEntities(context, SPACE_ID);

    expect(callsFor('entities')).toContainEqual(['eq', 'space_id', SPACE_ID]);
  });

  it('reads every space the caller holds when no space is picked', async () => {
    const { context, callsFor } = recordingContext({
      responses: { spaces: [{ data: [getSpace()] }], entities: [{ data: [] }] },
    });

    await loadEntities(context);

    const filters = callsFor('entities').filter((call) => call[0] === 'eq');
    expect(filters).toEqual([]);
  });

  it('asks nothing further of the database when a space has no entities yet', async () => {
    const { context, callsFor } = recordingContext({
      responses: { spaces: [{ data: [getSpace()] }], entities: [{ data: [] }] },
    });

    const page = await loadEntities(context);

    expect(page.groups).toEqual([]);
    expect(page.spaces).toEqual([getSpace()]);
    expect(callsFor('entity_mentions')).toEqual([]);
  });

  it('throws when entities cannot be read, rather than showing a space as empty', async () => {
    const { context } = recordingContext({
      responses: {
        spaces: [{ data: [getSpace()] }],
        entities: [{ error: { message: 'permission denied for table entities' } }],
      },
    });

    await expect(loadEntities(context)).rejects.toThrow('permission denied for table entities');
  });

  it('leaves out a mentioned document the reader cannot open', async () => {
    const { context } = recordingContext({
      responses: {
        spaces: [{ data: [getSpace()] }],
        entities: [{ data: [getEntity()] }],
        entity_mentions: [
          {
            data: [
              { entity_id: 'entity-1', document_id: 'doc-a' },
              { entity_id: 'entity-1', document_id: 'doc-hidden' },
            ],
          },
        ],
        documents: [{ data: [{ id: 'doc-a', title: 'SSO rollout', url: null }] }],
      },
    });

    const page = await loadEntities(context);

    expect(page.groups[0].entities[0].documents.map((document) => document.id)).toEqual(['doc-a']);
  });

  it('still lists an entity when its mentions could not be read', async () => {
    const { context } = recordingContext({
      responses: {
        spaces: [{ data: [getSpace()] }],
        entities: [{ data: [getEntity()] }],
        entity_mentions: [{ error: { message: 'permission denied' } }],
        documents: [{ error: { message: 'permission denied' } }],
      },
    });

    const page = await loadEntities(context);

    expect(page.groups[0].entities[0].documents).toEqual([]);
  });
});
