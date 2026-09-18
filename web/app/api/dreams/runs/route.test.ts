import { describe, expect, it, vi } from 'vitest';

import { getActivityRun, RUN_ID } from '@/components/dreams/activity-test-fixtures';
import { recordingContext } from '@/lib/supabase/test-support';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/context', () => ({ getSessionContext: vi.fn() }));

const { getSessionContext } = await import('@/lib/supabase/context');
const { GET } = await import('./route');

const request = (runs?: string) =>
  new Request(`https://example.test/api/dreams/runs${runs === undefined ? '' : `?runs=${runs}`}`);

describe('Dream status reads under the caller session', () => {
  it('requires authentication before reading activity', async () => {
    vi.mocked(getSessionContext).mockResolvedValue(null);
    expect((await GET(request(RUN_ID))).status).toBe(401);
  });

  it('returns only the rows RLS allowed, restricted to requested IDs and the caller org', async () => {
    const hiddenId = '22222222-2222-4222-8222-222222222222';
    const recorder = recordingContext({
      responses: { dream_runs: [{ data: [getActivityRun()] }] },
    });
    vi.mocked(getSessionContext).mockResolvedValue(recorder.context);
    const response = await GET(request(`${RUN_ID},${hiddenId}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const result = await response.json();
    expect(result.runs).toEqual([getActivityRun()]);
    expect(recorder.callsFor('dream_runs')).toContainEqual(['in', 'id', [RUN_ID, hiddenId]]);
    expect(recorder.callsFor('dream_runs')).toContainEqual([
      'eq',
      'org_id',
      recorder.context.orgId,
    ]);
    expect(recorder.callsFor('dream_runs')).toContainEqual(['limit', 100]);
  });

  it.each(['', 'bad-id', Array.from({ length: 101 }, () => RUN_ID).join(',')])(
    'rejects invalid filters without broadening the database query',
    async (filter) => {
      const recorder = recordingContext({ responses: {} });
      vi.mocked(getSessionContext).mockResolvedValue(recorder.context);
      expect((await GET(request(filter))).status).toBe(400);
      expect(recorder.callsFor('dream_runs')).toEqual([]);
    },
  );

  it('includes recent companion tasks regardless of who started the Dream, under RLS', async () => {
    const recorder = recordingContext({
      responses: { dream_runs: [{ data: [getActivityRun()] }, { data: [getActivityRun()] }] },
    });
    vi.mocked(getSessionContext).mockResolvedValue(recorder.context);
    const response = await GET(request());
    expect((await response.json()).runs).toHaveLength(1);
    expect(recorder.callsFor('dream_runs')).toContainEqual(['in', 'status', ['queued', 'running']]);
    expect(recorder.callsFor('dream_runs')).not.toContainEqual([
      'eq',
      'triggered_by',
      recorder.context.userId,
    ]);
    expect(
      recorder.callsFor('dream_runs').some((call) => call[0] === 'gte' && call[1] === 'created_at'),
    ).toBe(true);
  });

  it('reports a read failure without disclosing database error details', async () => {
    const recorder = recordingContext({
      responses: { dream_runs: [{ error: { message: 'private database details' } }] },
    });
    vi.mocked(getSessionContext).mockResolvedValue(recorder.context);
    const response = await GET(request(RUN_ID));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private database details');
  });
});
