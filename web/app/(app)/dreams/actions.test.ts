import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';
import type { SessionContext } from '@/lib/supabase/context';
import {
  recordingContext,
  type RecordingContext,
  type StubResponse,
} from '@/lib/supabase/test-support';

vi.mock('server-only', () => ({}));

const SPACE_ID = '33333333-3333-4333-8333-333333333333';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const OUTPUT_ID = '66666666-6666-4666-8666-666666666666';
const LINK_ID = '88888888-8888-4888-8888-888888888888';
const NOW = '2026-09-09T18:00:00.000Z';

const caller = {
  signedIn: true,
  database: null as RecordingContext | null,
  revalidated: [] as string[],
};

vi.mock('@/lib/actions/with-session', () => ({
  withSession: async <T>(
    run: (context: SessionContext) => Promise<ActionState<T>>,
    revalidate: string,
  ): Promise<ActionState<T>> => {
    if (!caller.signedIn) return { status: 'error', message: 'You need to sign in to do that.' };

    const database = caller.database;
    if (!database) throw new Error('this test queued no database');

    const result = await run(database.context);
    if (result.status === 'success') caller.revalidated.push(revalidate);
    return result;
  },
}));

const { confirmDreamLink, deleteDreamOutput, dismissDreamLink, setSpaceDreaming, startDreamRun } =
  await import('./actions');

function database(responses: Record<string, readonly StubResponse[]>): RecordingContext {
  const recorder = recordingContext({ responses });
  caller.database = recorder;
  return recorder;
}

const dreamingSpace = (enabled = true) => ({ data: { id: SPACE_ID, dreaming_enabled: enabled } });

beforeEach(() => {
  caller.signedIn = true;
  caller.database = null;
  caller.revalidated = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('running a dream by hand', () => {
  it('queues one kind over one space and returns the run ID', async () => {
    const { callsFor } = database({
      spaces: [dreamingSpace()],
      'dream-run': [{ data: { dream_run_id: RUN_ID, status: 'queued', output_document_id: null } }],
    });

    const state = await startDreamRun(SPACE_ID, 'digest');

    expect(state).toEqual({
      status: 'success',
      data: { dreamRunId: RUN_ID, dreamRunIds: [RUN_ID], status: 'queued', outputDocumentId: null },
    });
    expect(callsFor('dream-run')).toEqual([
      ['invoke', 'dream-run', { space_id: SPACE_ID, kind: 'digest' }],
    ]);
    expect(caller.revalidated).toEqual(['/dreams']);
  });

  it('refuses a space id that is not a space', async () => {
    const { callsFor } = database({});

    const state = await startDreamRun('the-engineering-space', 'digest');

    expect(state.status).toBe('error');
    expect(callsFor('spaces')).toEqual([]);
  });

  it('refuses a kind of dream Magpi does not run', async () => {
    const { callsFor } = database({});

    const state = await startDreamRun(SPACE_ID, 'summary' as 'digest');

    expect(state.status).toBe('error');
    expect(callsFor('dream-run')).toEqual([]);
  });

  it('refuses a space the caller cannot open, before asking the worker for anything', async () => {
    const { callsFor } = database({ spaces: [{ data: null }] });

    const state = await startDreamRun(SPACE_ID, 'digest');

    expect(state).toEqual({
      status: 'error',
      message: 'You are not in that space.',
    });
    expect(callsFor('dream-run')).toEqual([]);
    expect(callsFor('spaces')).toContainEqual(['eq', 'id', SPACE_ID]);
  });

  it('refuses a space whose owner turned dreaming off', async () => {
    const { callsFor } = database({ spaces: [dreamingSpace(false)] });

    const state = await startDreamRun(SPACE_ID, 'digest');

    expect(state).toEqual({
      status: 'error',
      message: 'Dreaming is switched off for this space. Turn it on first.',
    });
    expect(callsFor('dream-run')).toEqual([]);
  });

  it('reports what the worker refused rather than claiming a run happened', async () => {
    database({
      spaces: [dreamingSpace()],
      'dream-run': [{ error: { message: 'the space holds no documents to read' } }],
    });

    const state = await startDreamRun(SPACE_ID, 'connections');

    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.message).toContain('the space holds no documents to read');
    }
    expect(caller.revalidated).toEqual([]);
  });

  it('refuses an answer from the worker in a shape this app does not understand', async () => {
    database({
      spaces: [dreamingSpace()],
      'dream-run': [{ data: { dream_run_id: RUN_ID, status: 'running' } }],
    });

    const state = await startDreamRun(SPACE_ID, 'digest');

    expect(state.status).toBe('error');
  });

  it('refuses a caller with no session', async () => {
    caller.signedIn = false;

    expect((await startDreamRun(SPACE_ID, 'digest')).status).toBe('error');
  });
});

describe('turning dreaming on and off for a space', () => {
  it('switches dreaming off for the one space it was given', async () => {
    const { callsFor } = database({ spaces: [{ data: null }] });

    const state = await setSpaceDreaming(SPACE_ID, false);

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(callsFor('spaces')).toEqual([
      ['from', 'spaces'],
      ['update', { dreaming_enabled: false }],
      ['eq', 'id', SPACE_ID],
    ]);
    expect(caller.revalidated).toEqual(['/dreams']);
  });

  it('switches dreaming back on', async () => {
    const { callsFor } = database({ spaces: [{ data: null }] });

    await setSpaceDreaming(SPACE_ID, true);

    expect(callsFor('spaces')).toContainEqual(['update', { dreaming_enabled: true }]);
  });

  it('refuses a space id that is not a space', async () => {
    const { callsFor } = database({});

    const state = await setSpaceDreaming('personal', true);

    expect(state).toEqual({ status: 'error', message: 'That is not a space.' });
    expect(callsFor('spaces')).toEqual([]);
  });

  it('reports a change the database refused', async () => {
    database({ spaces: [{ error: { message: 'new row violates row-level security policy' } }] });

    const state = await setSpaceDreaming(SPACE_ID, false);

    expect(state).toEqual({
      status: 'error',
      message: 'Dreaming could not be changed for that space.',
    });
    expect(caller.revalidated).toEqual([]);
  });
});

describe('judging a candidate link', () => {
  it('records that a person confirmed the pair, and clears any earlier dismissal', async () => {
    const { callsFor } = database({ dream_links: [{ data: null }] });

    const state = await confirmDreamLink(LINK_ID);

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(callsFor('dream_links')).toEqual([
      ['from', 'dream_links'],
      ['update', { confirmed_at: NOW, dismissed_at: null }],
      ['eq', 'id', LINK_ID],
    ]);
  });

  it('records that a person dismissed the pair, and clears any earlier confirmation', async () => {
    const { callsFor } = database({ dream_links: [{ data: null }] });

    await dismissDreamLink(LINK_ID);

    expect(callsFor('dream_links')).toContainEqual([
      'update',
      { confirmed_at: null, dismissed_at: NOW },
    ]);
  });

  it('refuses an id that is not a candidate link', async () => {
    const { callsFor } = database({});

    const state = await confirmDreamLink('link-1');

    expect(state).toEqual({ status: 'error', message: 'That is not a candidate link.' });
    expect(callsFor('dream_links')).toEqual([]);
  });

  it('says a confirmation could not be recorded when the database refuses it', async () => {
    database({ dream_links: [{ error: { message: 'permission denied' } }] });

    expect(await confirmDreamLink(LINK_ID)).toEqual({
      status: 'error',
      message: 'That link could not be confirmed.',
    });
  });

  it('says a dismissal could not be recorded when the database refuses it', async () => {
    database({ dream_links: [{ error: { message: 'permission denied' } }] });

    expect(await dismissDreamLink(LINK_ID)).toEqual({
      status: 'error',
      message: 'That link could not be dismissed.',
    });
  });
});

describe('deleting what a dream wrote', () => {
  it('deletes the one document it was given, and reads back what went', async () => {
    const { callsFor } = database({ documents: [{ data: [{ id: OUTPUT_ID }] }] });

    const state = await deleteDreamOutput(OUTPUT_ID);

    expect(state).toEqual({ status: 'success', data: undefined });
    expect(callsFor('documents')).toEqual([
      ['from', 'documents'],
      ['delete'],
      ['eq', 'id', OUTPUT_ID],
      ['select', 'id'],
    ]);
    expect(caller.revalidated).toEqual(['/dreams']);
  });

  it('refuses an id that is not a document', async () => {
    const { callsFor } = database({});

    const state = await deleteDreamOutput('the-digest');

    expect(state).toEqual({ status: 'error', message: 'That is not a document.' });
    expect(callsFor('documents')).toEqual([]);
  });

  it('refuses to delete a source document, because the policy matched no row', async () => {
    database({ documents: [{ data: [] }] });

    expect(await deleteDreamOutput(OUTPUT_ID)).toEqual({
      status: 'error',
      message: 'Only a document a dream wrote can be deleted here.',
    });
    expect(caller.revalidated).toEqual([]);
  });

  it('reports a delete the database refused', async () => {
    database({ documents: [{ error: { message: 'permission denied' } }] });

    expect(await deleteDreamOutput(OUTPUT_ID)).toEqual({
      status: 'error',
      message: 'That document could not be deleted.',
    });
  });
});
