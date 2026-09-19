import { describe, expect, it, vi } from 'vitest';

import type { EntityRecord, EntityMentionRecord } from './entities';
import { recordingContext } from '@/lib/supabase/test-support';

vi.mock('server-only', () => ({}));
const { loadEntities, loadDreamSpaces } = await import('./queries');
const { loadDreamActivity, loadLatestDreamTime, loadLastDreamTimes } =
  await import('./activity-queries');

const SPACE = '33333333-3333-4333-8333-333333333333';
const entity = (index: number): EntityRecord => ({
  id: `entity-${index}`,
  name: `Person ${index}`,
  kind: 'person',
  summary: null,
  space_id: SPACE,
});
const pages = <T>(rows: readonly T[], size: number) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => ({
    data: rows.slice(i * size, (i + 1) * size),
  }));

describe('complete entity evidence', () => {
  it('keeps more than 500 entities and batches their related reads', async () => {
    const entities = Array.from({ length: 501 }, (_, index) => entity(index));
    const mentions = entities.map((row) => ({ entity_id: row.id, document_id: `doc-${row.id}` }));
    const documents = mentions.map((row) => ({
      id: row.document_id,
      title: row.document_id,
      url: null,
    }));
    const fixture = recordingContext({
      responses: {
        entities: pages(entities, 500),
        entity_mentions: pages(mentions, 100),
        documents: pages(documents, 100),
      },
    });
    const result = await loadEntities(fixture.context);
    expect(result.groups.flatMap((group) => group.entities)).toHaveLength(501);
    expect(
      result.groups.flatMap((group) => group.entities).every((row) => row.documents.length === 1),
    ).toBe(true);
    const filters = fixture.callsFor('entity_mentions').filter((call) => call[0] === 'in');
    expect(filters).toHaveLength(6);
    for (const filter of filters)
      expect(filter[2]).toHaveLength(filter === filters.at(-1) ? 1 : 100);
  });

  it('reads all mention pages even when one entity has more than 1000 mentions', async () => {
    const mentions: EntityMentionRecord[] = Array.from({ length: 1001 }, () => ({
      entity_id: 'entity-0',
      document_id: 'document',
    }));
    const fixture = recordingContext({
      responses: {
        entities: [{ data: [entity(0)] }],
        entity_mentions: pages(mentions, 500),
        documents: [{ data: [{ id: 'document', title: 'Notes', url: null }] }],
      },
    });
    const result = await loadEntities(fixture.context);
    expect(fixture.callsFor('entity_mentions').filter((call) => call[0] === 'range')).toEqual([
      ['range', 0, 499],
      ['range', 500, 999],
      ['range', 1000, 1499],
    ]);
    expect(result.groups[0].entities[0].documents).toHaveLength(1);
  });

  it('reports failed mention reads instead of an empty graph', async () => {
    const fixture = recordingContext({
      responses: {
        entities: [{ data: [entity(0)] }],
        entity_mentions: [{ error: { message: 'mention read failed' } }],
      },
    });
    await expect(loadEntities(fixture.context)).rejects.toThrow('mention read failed');
  });

  it('applies a selected space to every entity page', async () => {
    const fixture = recordingContext({ responses: { entities: [{ data: [] }] } });
    await loadEntities(fixture.context, SPACE);
    expect(fixture.callsFor('entities')).toContainEqual(['eq', 'space_id', SPACE]);
  });
});

function run(index: number) {
  return {
    id: `run-${index}`,
    space_id: SPACE,
    kind: 'entities',
    status: 'queued',
    created_at: '2026-09-19T00:00:00Z',
    started_at: null,
    finished_at: null,
    input_document_count: 0,
    output_document_id: null,
    error: null,
  };
}

describe('complete Dream activity', () => {
  it('keeps over 100 active tasks and deduplicates recent matches', async () => {
    const runs = Array.from({ length: 111 }, (_, index) => run(index));
    const fixture = recordingContext({
      responses: { dream_runs: [{ data: runs }, { data: runs }] },
    });
    const result = await loadDreamActivity(fixture.context);
    expect(result.runs).toHaveLength(111);
    expect(result.runs.at(-1)?.id).toBe('run-110');
  });

  it('reads another page of active tasks beyond the API page size', async () => {
    const runs = Array.from({ length: 501 }, (_, index) => run(index));
    // Active page one and recent page one are issued together, followed by active page two.
    const fixture = recordingContext({
      responses: {
        dream_runs: [{ data: runs.slice(0, 500) }, { data: [] }, { data: runs.slice(500) }],
      },
    });
    expect((await loadDreamActivity(fixture.context)).runs).toHaveLength(501);
  });

  it('limits explicit activity reads to the accepted batch IDs', async () => {
    const runs = Array.from({ length: 111 }, (_, index) => run(index));
    const fixture = recordingContext({ responses: { dream_runs: pages(runs, 100) } });
    expect(
      (
        await loadDreamActivity(
          fixture.context,
          runs.map((row) => row.id),
        )
      ).runs,
    ).toHaveLength(111);
    expect(fixture.callsFor('dream_runs').filter((call) => call[0] === 'in')).toEqual([
      ['in', 'id', runs.slice(0, 100).map((row) => row.id)],
      ['in', 'id', runs.slice(100).map((row) => row.id)],
    ]);
  });

  it('reads the latest completion in one bounded query', async () => {
    const fixture = recordingContext({
      responses: { dream_runs: [{ data: { finished_at: '2026-09-19T10:00:00Z' } }] },
    });
    expect(await loadLatestDreamTime(fixture.context, SPACE)).toBe('2026-09-19T10:00:00Z');
    expect(fixture.callsFor('dream_runs')).toContainEqual(['limit', 1]);
    expect(fixture.callsFor('dream_runs')).toContainEqual(['eq', 'space_id', SPACE]);
  });
});

it('reads one latest completion per space without scanning historical rows', async () => {
  const fixture = recordingContext({
    responses: {
      spaces: [
        {
          data: [
            { id: SPACE, dream_runs: [{ finished_at: '2026-09-19T10:00:00Z' }] },
            { id: 'empty', dream_runs: [] },
          ],
        },
      ],
    },
  });
  expect(await loadLastDreamTimes(fixture.context, [SPACE, 'empty'])).toEqual({
    [SPACE]: '2026-09-19T10:00:00Z',
    empty: null,
  });
  expect(fixture.callsFor('spaces')).toContainEqual([
    'limit',
    1,
    { referencedTable: 'dream_runs' },
  ]);
  expect(fixture.callsFor('dream_runs')).toEqual([]);
});

it('keeps graph entities and visible spaces within the current organization', async () => {
  const fixture = recordingContext({
    responses: { entities: [{ data: [] }], spaces: [{ data: [] }] },
  });
  await loadEntities(fixture.context);
  await loadDreamSpaces(fixture.context);
  for (const table of ['entities', 'spaces']) {
    expect(fixture.callsFor(table)).toContainEqual(['eq', 'org_id', fixture.context.orgId]);
  }
});
