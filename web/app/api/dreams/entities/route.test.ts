import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordingContext } from '@/lib/supabase/test-support';
import type { SessionContext } from '@/lib/supabase/context';

const dependencies = vi.hoisted(() => ({ session: vi.fn(), entities: vi.fn() }));
vi.mock('@/lib/supabase/context', () => ({ getSessionContext: dependencies.session }));
vi.mock('@/lib/dreams/queries', () => ({ loadEntities: dependencies.entities }));
const { GET } = await import('./route');
const SPACE = '33333333-3333-4333-8333-333333333333';
const request = (query = '') => new Request(`https://demo.example/api/dreams/entities${query}`);
let context: SessionContext;
beforeEach(() => {
  vi.clearAllMocks();
  context = recordingContext({ responses: { dream_runs: [{ data: [{ id: 'active' }] }] } }).context;
  dependencies.session.mockResolvedValue(context);
  dependencies.entities.mockResolvedValue({ groups: [] });
});

describe('entity refresh endpoint', () => {
  it('requires a signed-in session', async () => {
    dependencies.session.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(dependencies.entities).not.toHaveBeenCalled();
  });
  it('rejects an invalid selected space before reading entities', async () => {
    expect((await GET(request('?space=invalid'))).status).toBe(400);
    expect(dependencies.entities).not.toHaveBeenCalled();
  });
  it('uses the current session and selected space, and disables caching', async () => {
    const response = await GET(request(`?space=${SPACE}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ groups: [], active: true });
    expect(dependencies.entities).toHaveBeenCalledWith(context, SPACE);
  });
  it('includes final committed entities when the worker has finished', async () => {
    const groups = [{ kind: 'person', label: 'People', entities: [] }];
    let committed = false;
    const activity = () =>
      Promise.resolve().then(() => {
        committed = true;
        return { data: [], error: null };
      });
    const query = { select: () => query, eq: () => query, in: () => query, limit: activity };
    dependencies.session.mockResolvedValue({
      ...context,
      supabase: { from: () => query },
    });
    dependencies.entities.mockImplementation(async () => ({ groups: committed ? groups : [] }));

    const response = await GET(request());
    expect(await response.json()).toEqual({ groups, active: false });
  });
  it('reports failed entity reads without exposing database details', async () => {
    dependencies.entities.mockRejectedValue(new Error('private database failure'));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not refresh entities.' });
  });
  it('reports failed activity reads instead of declaring Dreams idle', async () => {
    dependencies.session.mockResolvedValue(
      recordingContext({ responses: { dream_runs: [{ error: { message: 'failure' } }] } }).context,
    );
    expect((await GET(request())).status).toBe(500);
  });
});

it('checks activity only in the current organization', async () => {
  const fixture = recordingContext({ responses: { dream_runs: [{ data: [] }] } });
  dependencies.session.mockResolvedValue(fixture.context);
  await GET(request());
  expect(fixture.callsFor('dream_runs')).toContainEqual(['eq', 'org_id', fixture.context.orgId]);
});
