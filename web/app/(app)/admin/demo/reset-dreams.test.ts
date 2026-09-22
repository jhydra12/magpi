import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/access', () => ({ resolveAdminAccess: access }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { resetDreams } from './reset-dreams';

function setup({
  mode = 'compute',
  running = 0,
  failTable = '',
  storageFails = false,
  resumeFails = false,
  acknowledge = true,
  seedFails = false,
  spaces = ['space'] as readonly string[],
} = {}) {
  const requests: { table: string; operation: string; filters: unknown[][] }[] = [];
  let documentsRead = false;
  const rpc = vi.fn(async (name: string, args?: { p_mode?: string }) => ({
    data: name === 'dream_execution_mode' ? mode : null,
    error: resumeFails && args?.p_mode === mode ? { message: 'Offline' } : null,
  }));
  const remove = vi.fn(async () => ({ error: storageFails ? { message: 'Offline' } : null }));
  const from = vi.fn((table: string) => {
    const request = { table, operation: 'select', filters: [] as unknown[][] };
    const query = {
      select: () => query,
      delete: () => {
        request.operation = 'delete';
        return query;
      },
      insert: (values: unknown) => {
        request.operation = 'insert';
        request.filters.push(['values', values]);
        return query;
      },
      update: (values: unknown) => {
        request.operation = 'update';
        request.filters.push(['values', values]);
        return query;
      },
      eq: (key: string, value: unknown) => {
        request.filters.push([key, value]);
        return query;
      },
      in: (key: string, value: unknown) => {
        request.filters.push([key, value]);
        return query;
      },
      order: () => query,
      limit: () => query,
      range: () => query,
      then(resolve: (value: unknown) => unknown) {
        requests.push(request);
        let data: object[] = [];
        if (table === 'documents' && request.operation === 'select' && !documentsRead) {
          data = [{ id: 'digest', storage_path: 'org/digest.md' }];
          documentsRead = true;
        }
        if (table === 'spaces') data = spaces.map((id) => ({ id }));
        return Promise.resolve(
          resolve({
            data,
            count:
              request.operation === 'select' && running > 0 && acknowledge ? running-- : running,
            error:
              table === failTable || (seedFails && request.operation === 'insert')
                ? { message: 'Offline' }
                : null,
          }),
        );
      },
    };
    return query;
  });
  access.mockResolvedValue({
    kind: 'granted',
    context: { orgId: 'org', userId: 'admin' },
    elevated: { rpc, from, storage: { from: () => ({ remove }) } },
  });
  return { requests, rpc, remove };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('dream-only reset', () => {
  it.each(['signed-out', 'forbidden'])('rejects %s users before accessing data', async (kind) => {
    const { rpc, requests } = setup();
    access.mockResolvedValue({ kind });
    expect((await resetDreams()).status).toBe('error');
    expect(rpc).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it.each(['edge', 'compute'])(
    'clears only organization dream data and restores %s processing',
    async (mode) => {
      const { requests, rpc, remove } = setup({ mode });
      expect((await resetDreams()).status).toBe('success');
      expect(remove).toHaveBeenCalledWith(['org/digest.md']);
      const deletions = requests.filter(({ operation }) => operation === 'delete');
      expect(deletions.map(({ table }) => table)).toEqual([
        'documents',
        'dream_runs',
        'entities',
        'usage_events',
        'model_calls',
        'rate_limits',
      ]);
      for (const request of deletions.filter(({ table }) => table !== 'rate_limits')) {
        expect(request.filters).toContainEqual(['org_id', 'org']);
      }
      expect(deletions[0].filters).toContainEqual(['origin', 'dream']);
      expect(deletions.at(-1)?.filters).toContainEqual([
        'bucket',
        ['dream-run:user:admin', 'dream-run:space:space'],
      ]);
      expect(rpc).toHaveBeenCalledWith('freshen_demo_corpus', { p_org_id: 'org' });
      expect(rpc).toHaveBeenLastCalledWith('set_dream_execution_mode', { p_mode: mode });
    },
  );

  it('leaves a paused project alone so it cannot interrupt a full reset', async () => {
    const { rpc, requests } = setup({ mode: 'paused' });
    expect((await resetDreams()).status).toBe('error');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([]);
  });

  it('recreates the mixed reset state without deleting Compute services', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T19:45:00.000Z'));
    const { requests } = setup({ spaces: ['one', 'two', 'three', 'four', 'five'] });

    expect((await resetDreams()).status).toBe('success');
    const seed = requests.find(
      ({ table, operation }) => table === 'dream_runs' && operation === 'insert',
    );
    expect(seed?.filters).toContainEqual([
      'values',
      expect.arrayContaining([
        expect.objectContaining({ status: 'timeout', finished_at: '2026-09-22T06:01:00.000Z' }),
        expect.objectContaining({ status: 'succeeded', finished_at: '2026-09-22T06:01:00.000Z' }),
      ]),
    ]);
  });

  it('cancels queued and running work before removing output, then resumes processing', async () => {
    vi.useFakeTimers();
    const { rpc, requests, remove } = setup({ running: 1 });
    const result = resetDreams();
    await vi.runAllTimersAsync();
    expect((await result).status).toBe('success');
    expect(requests.slice(0, 2)).toMatchObject([
      {
        table: 'dream_runs',
        operation: 'update',
        filters: [
          [
            'values',
            { status: 'failed', error: 'cancel: reset requested', finished_at: expect.any(String) },
          ],
          ['org_id', 'org'],
          ['status', 'queued'],
        ],
      },
      {
        table: 'dream_runs',
        operation: 'update',
        filters: [
          ['values', { error: 'cancel: reset requested' }],
          ['org_id', 'org'],
          ['status', 'running'],
        ],
      },
    ]);
    expect(requests.slice(2, 4).map(({ table, operation }) => [table, operation])).toEqual([
      ['dream_runs', 'select'],
      ['dream_runs', 'select'],
    ]);
    expect(remove).toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith('set_dream_execution_mode', { p_mode: 'compute' });
  });

  it('preserves output if a worker does not acknowledge cancellation', async () => {
    vi.useFakeTimers();
    const { rpc, requests, remove } = setup({ running: 1, acknowledge: false });
    const result = resetDreams();
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({
      status: 'error',
      message: expect.stringContaining('not been acknowledged'),
    });
    expect(requests.some(({ operation }) => operation === 'delete')).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith('set_dream_execution_mode', { p_mode: 'compute' });
  });

  it('does not delete output when cancellation fails', async () => {
    const { requests, remove } = setup({ failTable: 'dream_runs' });
    expect((await resetDreams()).status).toBe('error');
    expect(requests.some(({ operation }) => operation === 'delete')).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('preserves rows if storage deletion fails and restores processing', async () => {
    const { rpc, requests } = setup({ storageFails: true });
    expect((await resetDreams()).status).toBe('error');
    expect(requests.some(({ operation }) => operation === 'delete')).toBe(false);
    expect(rpc).toHaveBeenLastCalledWith('set_dream_execution_mode', { p_mode: 'compute' });
  });

  it('reports database errors and restores processing', async () => {
    const { rpc } = setup({ failTable: 'entities' });
    expect((await resetDreams()).status).toBe('error');
    expect(rpc).toHaveBeenLastCalledWith('set_dream_execution_mode', { p_mode: 'compute' });
  });

  it('reports a restore failure instead of claiming success', async () => {
    setup({ resumeFails: true });
    expect(await resetDreams()).toMatchObject({
      status: 'error',
      message: expect.stringContaining('could not be restored'),
    });
  });

  it('reports a starting-state failure and still restores processing', async () => {
    const { rpc } = setup({ seedFails: true });

    expect(await resetDreams()).toMatchObject({
      status: 'error',
      message: expect.stringContaining('starting Dream state could not be created'),
    });
    expect(rpc).toHaveBeenLastCalledWith('set_dream_execution_mode', { p_mode: 'compute' });
  });
});
