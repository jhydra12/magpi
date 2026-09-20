import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  compute: vi.fn(),
  absent: vi.fn(),
  configured: vi.fn(),
}));
vi.mock('@/lib/analytics/access', () => ({ resolveAdminAccess: mocks.access }));
vi.mock('@/lib/admin/compute-reset', () => ({
  resetAllComputeInstances: mocks.compute,
  areComputeInstancesAbsent: mocks.absent,
  assertComputeResetConfigured: mocks.configured,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { resetDemoStep } from './actions';

function setup({ active = false, mode = 'paused' } = {}) {
  vi.resetAllMocks();
  const result = { count: active ? 1 : 0, error: null, data: [] };
  const query = { select: vi.fn(), delete: vi.fn(), eq: vi.fn() };
  query.select.mockReturnValue(query);
  query.delete.mockReturnValue(query);
  query.eq.mockResolvedValue(result);
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'dream_execution_mode' ? mode : null,
    error: null,
  }));
  const from = vi.fn((table: string) => {
    if (!table) throw new Error('Table required');
    return query;
  });
  mocks.access.mockResolvedValue({
    kind: 'granted',
    context: { orgId: 'org', userId: 'user' },
    elevated: { rpc, from },
  });
  mocks.absent.mockResolvedValue(true);
  mocks.compute.mockResolvedValue({ complete: true });
  return { rpc, from };
}

describe('verified demo reset stages', () => {
  it('rejects a non-admin before infrastructure access', async () => {
    setup();
    mocks.access.mockResolvedValue({ kind: 'forbidden' });
    expect((await resetDemoStep('compute')).status).toBe('error');
    expect(mocks.compute).not.toHaveBeenCalled();
  });
  it('checks management configuration before pausing processing', async () => {
    const { rpc } = setup();
    mocks.configured.mockImplementation(() => {
      throw new Error('Management access is missing.');
    });
    expect(await resetDemoStep('pause')).toEqual({
      status: 'error',
      message: 'Management access is missing.',
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('waits for active work before confirming the pause', async () => {
    const { rpc } = setup({ active: true });
    expect(await resetDemoStep('pause')).toEqual({ status: 'success', data: { complete: false } });
    expect(rpc).toHaveBeenCalledWith('set_dream_execution_mode', { p_mode: 'paused' });
  });
  it('deletes conversations and folders only after processing is paused', async () => {
    const { rpc, from } = setup();
    expect(await resetDemoStep('chats')).toEqual({
      status: 'success',
      data: { complete: true },
    });
    expect(rpc).toHaveBeenCalledWith('dream_execution_mode');
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'dream_runs',
      'ingest_jobs',
      'conversations',
      'conversation_folders',
    ]);
  });
  it('rejects deletion if workers have not been paused', async () => {
    setup({ mode: 'edge' });
    expect((await resetDemoStep('compute')).status).toBe('error');
    expect(mocks.compute).not.toHaveBeenCalled();
  });
  it('keeps Compute deletion pending until confirmed', async () => {
    setup();
    mocks.compute.mockResolvedValue({ complete: false });
    expect(await resetDemoStep('compute')).toEqual({
      status: 'success',
      data: { complete: false },
    });
  });
  it('refuses to clear data while Compute remains', async () => {
    const { from } = setup();
    mocks.absent.mockResolvedValue(false);
    expect((await resetDemoStep('data')).status).toBe('error');
    expect(from.mock.calls.map((call) => call[0])).toEqual(['dream_runs', 'ingest_jobs']);
  });
  it('restores Edge only after Compute is gone and Dream runs are cleared', async () => {
    const { rpc } = setup();
    expect(await resetDemoStep('edge')).toEqual({ status: 'success', data: { complete: true } });
    expect(rpc).toHaveBeenCalledWith('set_dream_execution_mode', { p_mode: 'edge' });
  });
});

function setupCleanup(failure?: 'storage' | 'documents-read' | 'entities-delete' | 'workers') {
  setup();
  const events: string[] = [];
  const requests: { table: string; operation: string; filters: unknown[][] }[] = [];
  const from = vi.fn((table: string) => {
    const request: { table: string; operation: string; filters: unknown[][] } = {
      table,
      operation: 'select',
      filters: [],
    };
    const query = {
      select() {
        return query;
      },
      delete() {
        request.operation = 'delete';
        return query;
      },
      eq(column: string, value: unknown) {
        request.filters.push([column, value]);
        return query;
      },
      in(column: string, value: unknown) {
        request.filters.push([column, value]);
        return query;
      },
      then(
        resolve: (value: {
          data: object[];
          error: { message: string } | null;
          count: number;
        }) => unknown,
      ) {
        requests.push(request);
        events.push(`${request.operation}:${table}`);
        const failed =
          (failure === 'documents-read' &&
            table === 'documents' &&
            request.operation === 'select') ||
          (failure === 'entities-delete' && table === 'entities') ||
          (failure === 'workers' && table === 'ingest_jobs');
        return Promise.resolve(
          resolve({
            data:
              table === 'spaces'
                ? [{ id: 'space' }]
                : table === 'documents' && request.operation === 'select'
                  ? [
                      { id: 'generated', storage_path: 'org/dream.md' },
                      { id: 'inline', storage_path: null },
                    ]
                  : [],
            error: failed ? { message: 'Database unavailable' } : null,
            count: 0,
          }),
        );
      },
    };
    return query;
  });
  const remove = vi.fn(async () => {
    events.push('storage:remove');
    return { error: failure === 'storage' ? { message: 'Storage unavailable' } : null };
  });
  mocks.access.mockResolvedValue({
    kind: 'granted',
    context: { orgId: 'org', userId: 'user' },
    elevated: {
      rpc: vi.fn(async () => ({ data: 'paused', error: null })),
      from,
      storage: { from: vi.fn(() => ({ remove })) },
    },
  });
  return { events, requests, remove };
}

describe('generated data reset', () => {
  it('clears generated files before rows while preserving source documents, spaces and connections', async () => {
    const { events, requests, remove } = setupCleanup();
    expect(await resetDemoStep('data')).toEqual({ status: 'success', data: { complete: true } });
    expect(remove).toHaveBeenCalledWith(['org/dream.md']);
    const deletions = requests.filter((request) => request.operation === 'delete');
    expect(deletions.map((request) => request.table)).toEqual([
      'dream_runs',
      'entities',
      'documents',
      'usage_events',
      'model_calls',
      'rate_limits',
    ]);
    expect(deletions.find((request) => request.table === 'documents')?.filters).toEqual([
      ['org_id', 'org'],
      ['origin', 'dream'],
    ]);
    expect(deletions.find((request) => request.table === 'usage_events')?.filters).toContainEqual([
      'kind',
      'dream_run',
    ]);
    expect(deletions.find((request) => request.table === 'model_calls')?.filters).toContainEqual([
      'purpose',
      ['dream', 'extract'],
    ]);
    expect(events.indexOf('storage:remove')).toBeLessThan(events.indexOf('delete:dream_runs'));
    expect(requests.filter((request) => request.table === 'spaces')).toEqual([
      { table: 'spaces', operation: 'select', filters: [['org_id', 'org']] },
    ]);
    expect(requests.some((request) => request.table === 'connections')).toBe(false);
  });

  it('keeps database rows when generated file removal fails', async () => {
    const { requests } = setupCleanup('storage');
    expect(await resetDemoStep('data')).toEqual({
      status: 'error',
      message: 'Generated files could not be deleted: Storage unavailable',
    });
    expect(requests.some((request) => request.operation === 'delete')).toBe(false);
  });

  it('stops before deleting files when the generated document query fails', async () => {
    const { remove, requests } = setupCleanup('documents-read');
    expect(await resetDemoStep('data')).toEqual({
      status: 'error',
      message: 'The demo could not be reset: Database unavailable',
    });
    expect(remove).not.toHaveBeenCalled();
    expect(requests.some((request) => request.operation === 'delete')).toBe(false);
  });

  it('reports a database deletion failure instead of claiming reset completed', async () => {
    setupCleanup('entities-delete');
    expect(await resetDemoStep('data')).toEqual({
      status: 'error',
      message: 'The demo could not be reset: Database unavailable',
    });
  });

  it('does not delete anything if active worker status cannot be verified', async () => {
    const { requests, remove } = setupCleanup('workers');
    expect(await resetDemoStep('data')).toEqual({
      status: 'error',
      message: 'Worker status could not be checked.',
    });
    expect(remove).not.toHaveBeenCalled();
    expect(requests.some((request) => request.operation === 'delete')).toBe(false);
  });
});
