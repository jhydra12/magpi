import { describe, expect, it } from 'vitest';

import { buildNightlyDreams, type DreamLinkCountRecord } from './nightly';
import type { DreamRunRecord, SpaceRecord } from './view-model';

const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const MARKETING = '33333333-3333-4333-8333-444444444444';

const getSpace = (overrides: Partial<SpaceRecord> = {}): SpaceRecord => ({
  id: ENGINEERING,
  name: 'Engineering',
  dreaming_enabled: true,
  ...overrides,
});

const getRun = (overrides: Partial<DreamRunRecord> = {}): DreamRunRecord => ({
  id: 'run-digest',
  space_id: ENGINEERING,
  kind: 'digest',
  status: 'succeeded',
  started_at: '2026-09-17T02:00:00.000Z',
  finished_at: '2026-09-17T02:01:30.000Z',
  input_document_count: 12,
  output_document_id: 'doc-1',
  error: null,
  created_at: '2026-09-17T02:00:00.000Z',
  ...overrides,
});

/** The three passes one night queues for one space. */
const getNight = (): DreamRunRecord[] => [
  getRun({ id: 'run-entities', kind: 'entities', finished_at: '2026-09-17T02:00:40.000Z' }),
  getRun({ id: 'run-digest', kind: 'digest' }),
  getRun({
    id: 'run-connections',
    kind: 'connections',
    input_document_count: 11,
    output_document_id: null,
    finished_at: '2026-09-17T02:00:20.000Z',
  }),
];

const getLink = (overrides: Partial<DreamLinkCountRecord> = {}): DreamLinkCountRecord => ({
  dream_run_id: 'run-connections',
  ...overrides,
});

describe('a night of dreaming', () => {
  it('rolls the passes for one space into one entry with the night, the space, and the clock', () => {
    const [night] = buildNightlyDreams({ runs: getNight(), spaces: [getSpace()], links: [] });

    expect(night.nightLabel).toBe('17 Sept 2026');
    expect(night.spaceName).toBe('Engineering');
    // 40s for entities, 1m 30s for the digest, 20s for links.
    expect(night.durationLabel).toBe('2m 30s');
  });

  it('counts the documents that came in that day once, not once per pass', () => {
    const [night] = buildNightlyDreams({ runs: getNight(), spaces: [getSpace()], links: [] });

    expect(night.documentsIngested).toBe(12);
  });

  it('counts the connections the night made', () => {
    const [night] = buildNightlyDreams({
      runs: getNight(),
      spaces: [getSpace()],
      links: [getLink(), getLink(), getLink({ dream_run_id: 'run-from-another-night' })],
    });

    expect(night.connectionsMade).toBe(2);
  });

  it('keeps a link to every pass, in the order the night runs them', () => {
    const [night] = buildNightlyDreams({ runs: getNight(), spaces: [getSpace()], links: [] });

    expect(night.runs.map((run) => run.kindLabel)).toEqual([
      'Entities',
      'Digest',
      'Document links',
    ]);
    expect(night.runs.map((run) => run.id)).toEqual([
      'run-entities',
      'run-digest',
      'run-connections',
    ]);
  });

  it('is ordinary when every pass finished', () => {
    const [night] = buildNightlyDreams({ runs: getNight(), spaces: [getSpace()], links: [] });

    expect(night.status).toEqual({ label: 'Done', tone: 'positive', detail: null });
  });

  it('names the pass that died and carries its reason', () => {
    const runs = getNight().map((run) =>
      run.kind === 'digest'
        ? {
            ...run,
            status: 'timeout' as const,
            error: 'synthesize: 900 documents exceeded the budget',
          }
        : run,
    );

    const [night] = buildNightlyDreams({ runs, spaces: [getSpace()], links: [] });

    expect(night.status.label).toBe('Digest timed out');
    expect(night.status.tone).toBe('warning');
    expect(night.status.detail).toMatch(/timed out during synthesize/i);
  });

  it('reads as still running while any pass is going', () => {
    const runs = getNight().map((run) =>
      run.kind === 'connections' ? { ...run, status: 'running' as const, finished_at: null } : run,
    );

    const [night] = buildNightlyDreams({ runs, spaces: [getSpace()], links: [] });

    expect(night.status.label).toBe('Running');
    expect(night.durationLabel).toBe('Still running');
  });

  it('separates the same space on different nights, newest first', () => {
    const runs = [
      ...getNight(),
      getRun({
        id: 'run-later',
        created_at: '2026-09-18T02:00:00.000Z',
        started_at: '2026-09-18T02:00:00.000Z',
        finished_at: '2026-09-18T02:00:10.000Z',
      }),
    ];

    const nights = buildNightlyDreams({ runs, spaces: [getSpace()], links: [] });

    expect(nights.map((night) => night.night)).toEqual(['2026-09-18', '2026-09-17']);
  });

  it('separates spaces on the same night, by name', () => {
    const runs = [...getNight(), getRun({ id: 'run-marketing', space_id: MARKETING })];

    const nights = buildNightlyDreams({
      runs,
      spaces: [getSpace(), getSpace({ id: MARKETING, name: 'Marketing' })],
      links: [],
    });

    expect(nights.map((night) => night.spaceName)).toEqual(['Engineering', 'Marketing']);
  });

  it('drops a run whose space the reader cannot open', () => {
    const runs = [...getNight(), getRun({ id: 'run-hidden', space_id: MARKETING })];

    const nights = buildNightlyDreams({ runs, spaces: [getSpace()], links: [] });

    expect(nights).toHaveLength(1);
    expect(nights[0].spaceName).toBe('Engineering');
  });
});
