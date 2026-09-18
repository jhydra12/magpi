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
  it('requires three distinct queued jobs when starting the full Dream', async () => {
    const ids = [ENTITY_ID, RUN_ID, LINKS_ID];
    const client = getClient({ data: { dream_run_id: ENTITY_ID, status: 'queued', output_document_id: null } });
    client.functions.invoke
      .mockResolvedValueOnce({ data: { dream_run_id: ids[0], status: 'queued', output_document_id: null }, error: null })
      .mockResolvedValueOnce({ data: { dream_run_id: ids[1], status: 'queued', output_document_id: null }, error: null })
      .mockResolvedValueOnce({ data: { dream_run_id: ids[2], status: 'queued', output_document_id: null }, error: null });
    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'all' });
    expect(result).toEqual({
      ok: true,
      data: {
        dreamRunId: RUN_ID,
        dreamRunIds: ids,
        status: 'queued',
        outputDocumentId: null,
      },
    });
    expect(client.functions.invoke).toHaveBeenNthCalledWith(1, 'dream-run', {
      body: { space_id: 'space-1', kind: 'entities' },
    });
    expect(client.functions.invoke).toHaveBeenNthCalledWith(2, 'dream-run', {
      body: { space_id: 'space-1', kind: 'digest' },
    });
    expect(client.functions.invoke).toHaveBeenNthCalledWith(3, 'dream-run', {
      body: { space_id: 'space-1', kind: 'connections' },
    });
  });

  it.each([0, 1, 2])('stops when one of the full-Dream tasks is refused (%i)', async (failedAt) => {
    const client = getClient({
      data: { dream_run_id: RUN_ID, status: 'queued', output_document_id: null },
    });
    client.functions.invoke.mockImplementation(async () =>
      client.functions.invoke.mock.calls.length - 1 === failedAt
        ? { data: null, error: { message: 'refused' } }
        : { data: { dream_run_id: RUN_ID, status: 'queued', output_document_id: null }, error: null },
    );
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
      data: { dreamRunId: RUN_ID, dreamRunIds: [RUN_ID], status: 'succeeded', outputDocumentId: DOC_ID },
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
