import { describe, expect, it, vi } from 'vitest';

import { requestDreamRun } from './edge';

const getClient = (response: { data?: unknown; error?: { message: string } | null }) => ({
  functions: {
    invoke: vi
      .fn()
      .mockResolvedValue({ data: response.data ?? null, error: response.error ?? null }),
  },
});

const RUN_ID = '11111111-2222-4333-8444-555555555555';
const ENTITY_ID = '22222222-2222-4222-8222-222222222222';
const LINKS_ID = '33333333-3333-4333-8333-333333333333';
const DOC_ID = '22222222-3333-4444-8555-666666666666';

describe('starting a dream run by hand', () => {
  it('queues the complete Dream in one atomic request', async () => {
    const ids = [ENTITY_ID, RUN_ID, LINKS_ID];
    const client = getClient({
      data: {
        dream_run_id: RUN_ID,
        dream_run_ids: ids,
        status: 'queued',
        output_document_id: null,
      },
    });
    expect(await requestDreamRun(client, { spaceId: 'space-1', kind: 'all' })).toEqual({
      ok: true,
      data: {
        dreamRunId: RUN_ID,
        dreamRunIds: ids,
        status: 'queued',
        outputDocumentId: null,
      },
    });
    expect(client.functions.invoke).toHaveBeenCalledExactlyOnceWith('dream-run', {
      body: { space_id: 'space-1', kind: 'all' },
    });
  });

  it('reports failure of the complete enqueue operation', async () => {
    const client = getClient({ error: { message: 'refused' } });
    expect((await requestDreamRun(client, { spaceId: 'space-1', kind: 'all' })).ok).toBe(false);
  });

  it('asks dream-run for one kind of run in one space', async () => {
    const client = getClient({
      data: { dream_run_id: RUN_ID, status: 'succeeded', output_document_id: DOC_ID },
    });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'digest' });

    expect(client.functions.invoke).toHaveBeenCalledWith('dream-run', {
      body: { space_id: 'space-1', kind: 'digest' },
    });
    expect(result).toEqual({
      ok: true,
      data: {
        dreamRunId: RUN_ID,
        dreamRunIds: [RUN_ID],
        status: 'succeeded',
        outputDocumentId: DOC_ID,
      },
    });
  });

  it('reads a run back as timed out rather than as a failed request', async () => {
    const client = getClient({
      data: { dream_run_id: RUN_ID, status: 'timeout', output_document_id: null },
    });
    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'connections' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe('timeout');
  });

  it('reads a succeeded run that wrote nothing', async () => {
    const client = getClient({
      data: { dream_run_id: RUN_ID, status: 'succeeded', output_document_id: null },
    });
    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'digest' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.outputDocumentId).toBeNull();
  });

  it('reports a worker that refused the run', async () => {
    const client = getClient({ error: { message: 'dreaming_disabled' } });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'entities' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('dreaming_disabled');
  });

  it('refuses a response that does not confirm queuing', async () => {
    const client = getClient({
      data: { dream_run_id: RUN_ID, status: 'running', output_document_id: null },
    });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'digest' });

    expect(result.ok).toBe(false);
  });
});
