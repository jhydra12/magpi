import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordingContext } from '@/lib/supabase/test-support';

const dependencies = vi.hoisted(() => ({ session: vi.fn(), start: vi.fn() }));
vi.mock('@/lib/supabase/context', () => ({ getSessionContext: dependencies.session }));
vi.mock('@/lib/dreams/start', () => ({ startDream: dependencies.start }));
const { POST } = await import('./route');
const SPACE = '33333333-3333-4333-8333-333333333333';
const input = { spaceId: SPACE, kind: 'all' };
const context = recordingContext({ responses: {} }).context;
const request = (body = JSON.stringify(input), origin = 'https://demo.example') =>
  new Request('https://demo.example/api/dreams/start', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body,
  });
beforeEach(() => {
  vi.clearAllMocks();
  dependencies.session.mockResolvedValue(context);
  dependencies.start.mockResolvedValue({ status: 'success', data: { runIds: ['accepted'] } });
});

describe('Dream submission endpoint', () => {
  it('rejects cross-origin submissions before calling the worker', async () => {
    expect((await POST(request(undefined, 'https://other.example'))).status).toBe(403);
    expect(dependencies.start).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    dependencies.session.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(dependencies.start).not.toHaveBeenCalled();
  });
  it.each([
    '{',
    JSON.stringify({ spaceId: 'bad', kind: 'all' }),
    JSON.stringify({ spaceId: SPACE, kind: 'unknown' }),
  ])('rejects malformed input %s', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(dependencies.start).not.toHaveBeenCalled();
  });
  it('submits all passes with the current session and returns accepted IDs', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(dependencies.start).toHaveBeenCalledWith(context, input);
    expect(await response.json()).toEqual({ status: 'success', data: { runIds: ['accepted'] } });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('returns the space authorization error without disguising it as success', async () => {
    dependencies.start.mockResolvedValue({
      status: 'error',
      message: 'You are not in that space.',
    });
    expect(await (await POST(request())).json()).toEqual({
      status: 'error',
      message: 'You are not in that space.',
    });
  });
  it('returns a stable error when submission throws', async () => {
    dependencies.start.mockRejectedValue(new Error('private detail'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      status: 'error',
      message: 'Could not start dreaming.',
    });
  });
});
