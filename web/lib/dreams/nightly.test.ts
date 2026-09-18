import { describe, expect, it } from 'vitest';

import {
  buildNightlyDreams,
  formatNight,
  formatTokens,
  type DreamLinkRecord,
  type ModelCallRecord,
  type NightlyDreamInputs,
} from './nightly';
import type { DreamRunRecord, SpaceRecord } from './view-model';

const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const MARKETING = '33333333-3333-4333-8333-444444444444';
const READER = '77777777-7777-4777-8777-777777777777';
const SOMEONE_ELSE = '88888888-8888-4888-8888-888888888888';
const NOW = new Date('2026-09-18T09:00:00.000Z');

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
  triggered_by: null,
  created_at: '2026-09-17T02:00:00.000Z',
  ...overrides,
});

/** The three passes one night queues for one space. */
const getNight = (): DreamRunRecord[] => [
  getRun({
    id: 'run-entities',
    kind: 'entities',
    output_document_id: null,
    started_at: '2026-09-17T02:02:00.000Z',
    finished_at: '2026-09-17T02:02:40.000Z',
  }),
  getRun({ id: 'run-digest', kind: 'digest' }),
  getRun({
    id: 'run-connections',
    kind: 'connections',
    input_document_count: 11,
    output_document_id: null,
    started_at: '2026-09-17T02:03:00.000Z',
    finished_at: '2026-09-17T02:03:20.000Z',
  }),
];

const getLink = (overrides: Partial<DreamLinkRecord> = {}): DreamLinkRecord => ({
  dream_run_id: 'run-connections',
  confirmed_at: null,
  dismissed_at: null,
  ...overrides,
});

const getCall = (overrides: Partial<ModelCallRecord> = {}): ModelCallRecord => ({
  input_tokens: 30_000,
  output_tokens: 700,
  occurred_at: '2026-09-17T02:00:45.000Z',
  ...overrides,
});

const getInputs = (overrides: Partial<NightlyDreamInputs> = {}): NightlyDreamInputs => ({
  runs: getNight(),
  spaces: [getSpace()],
  links: [],
  outputs: [{ id: 'doc-1', title: 'Digest for 2026-09-17' }],
  modelCalls: [],
  readerId: READER,
  now: NOW,
  ...overrides,
});

describe('a night of dreaming', () => {
  it('rolls the passes for one space into one entry with the night, the space, and the clock', () => {
    const [night] = buildNightlyDreams(getInputs());

    expect(night.nightLabel).toBe('Last night');
    expect(night.spaceName).toBe('Engineering');
    // 40s for entities, 1m 30s for the digest, 20s for links.
    expect(night.durationLabel).toBe('2m 30s');
  });

  it('counts the documents that came in that day once, not once per pass', () => {
    const [night] = buildNightlyDreams(getInputs());

    expect(night.documentsIngested).toBe(12);
  });

  it('counts the connections the night found and how many a person confirmed', () => {
    const [night] = buildNightlyDreams(
      getInputs({
        links: [
          getLink({ confirmed_at: '2026-09-17T08:00:00.000Z' }),
          getLink(),
          getLink({ dismissed_at: '2026-09-17T08:00:00.000Z' }),
          getLink({ dream_run_id: 'run-from-another-night' }),
        ],
      }),
    );

    expect(night.connectionsFound).toBe(3);
    expect(night.connectionsConfirmed).toBe(1);
  });

  it('names what the night wrote, so the digest is one click from the log', () => {
    const [night] = buildNightlyDreams(getInputs());

    expect(night.output).toEqual({ id: 'doc-1', title: 'Digest for 2026-09-17' });
  });

  it('says a night wrote nothing when no pass produced a document', () => {
    const runs = getNight().map((run) => ({ ...run, output_document_id: null }));

    const [night] = buildNightlyDreams(getInputs({ runs }));

    expect(night.output).toBeNull();
  });

  it('credits the schedule when nobody pressed the button', () => {
    const [night] = buildNightlyDreams(getInputs());

    expect(night.startedBy).toBe('Nightly');
  });

  it('credits the reader when they started a pass themselves', () => {
    const runs = getNight().map((run) =>
      run.kind === 'digest' ? { ...run, triggered_by: READER } : run,
    );

    const [night] = buildNightlyDreams(getInputs({ runs }));

    expect(night.startedBy).toBe('You');
  });

  it('credits a member without naming them when someone else started it', () => {
    const runs = getNight().map((run) =>
      run.kind === 'digest' ? { ...run, triggered_by: SOMEONE_ELSE } : run,
    );

    const [night] = buildNightlyDreams(getInputs({ runs }));

    expect(night.startedBy).toBe('A member');
  });

  it('adds up the tokens of the model calls made while its passes were running', () => {
    const [night] = buildNightlyDreams(
      getInputs({
        modelCalls: [
          getCall(),
          getCall({
            occurred_at: '2026-09-17T02:02:10.000Z',
            input_tokens: 5_000,
            output_tokens: 300,
          }),
          // Before the first pass started, so some other night's spend.
          getCall({ occurred_at: '2026-09-17T01:59:00.000Z' }),
        ],
      }),
    );

    expect(night.modelTokens).toBe(36_000);
  });

  it('counts spend up to now for a pass that is still running', () => {
    const runs = getNight().map((run) =>
      run.kind === 'connections' ? { ...run, status: 'running' as const, finished_at: null } : run,
    );

    const [night] = buildNightlyDreams(
      getInputs({ runs, modelCalls: [getCall({ occurred_at: '2026-09-17T08:59:00.000Z' })] }),
    );

    expect(night.modelTokens).toBe(30_700);
  });

  it('leaves spend unknown for a reader who is not allowed to see model calls', () => {
    const [night] = buildNightlyDreams(getInputs({ modelCalls: null }));

    expect(night.modelTokens).toBeNull();
  });

  it('keeps a link to every pass, in the order the night runs them', () => {
    const [night] = buildNightlyDreams(getInputs());

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
    const [night] = buildNightlyDreams(getInputs());

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

    const [night] = buildNightlyDreams(getInputs({ runs }));

    expect(night.status.label).toBe('Digest timed out');
    expect(night.status.tone).toBe('warning');
    expect(night.status.detail).toMatch(/timed out during synthesize/i);
  });

  it('reads as still running while any pass is going', () => {
    const runs = getNight().map((run) =>
      run.kind === 'connections' ? { ...run, status: 'running' as const, finished_at: null } : run,
    );

    const [night] = buildNightlyDreams(getInputs({ runs }));

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

    const nights = buildNightlyDreams(getInputs({ runs }));

    expect(nights.map((night) => night.night)).toEqual(['2026-09-18', '2026-09-17']);
  });

  it('separates spaces on the same night, by name', () => {
    const runs = [...getNight(), getRun({ id: 'run-marketing', space_id: MARKETING })];

    const nights = buildNightlyDreams(
      getInputs({ runs, spaces: [getSpace(), getSpace({ id: MARKETING, name: 'Marketing' })] }),
    );

    expect(nights.map((night) => night.spaceName)).toEqual(['Engineering', 'Marketing']);
  });

  it('drops a run whose space the reader cannot open', () => {
    const runs = [...getNight(), getRun({ id: 'run-hidden', space_id: MARKETING })];

    const nights = buildNightlyDreams(getInputs({ runs }));

    expect(nights).toHaveLength(1);
    expect(nights[0].spaceName).toBe('Engineering');
  });
});

describe('the night on a row', () => {
  it('counts nights back from today rather than naming a date', () => {
    const now = new Date('2026-09-18T09:00:00.000Z');

    expect(formatNight('2026-09-18', now)).toBe('Tonight');
    expect(formatNight('2026-09-17', now)).toBe('Last night');
    expect(formatNight('2026-09-13', now)).toBe('5 nights ago');
  });
});

describe('token counts on a row', () => {
  it('reads small counts as they are and large ones in thousands or millions', () => {
    expect(formatTokens(850)).toBe('850');
    expect(formatTokens(12_400)).toBe('12k');
    expect(formatTokens(515_869)).toBe('516k');
    expect(formatTokens(1_250_000)).toBe('1.3M');
  });
});
