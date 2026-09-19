import { afterEach, expect, it, vi } from 'vitest';
import { submitDream } from './submit';

afterEach(() => vi.unstubAllGlobals());

it('uses a bounded HTTP request and reports a failed transport without blocking navigation', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('network unavailable'));
  vi.stubGlobal('fetch', fetcher);
  expect(await submitDream('space', 'all')).toEqual({
    status: 'error',
    message: 'Could not start dreaming. Try again.',
  });
  expect(fetcher).toHaveBeenCalledWith(
    '/api/dreams/start',
    expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
  );
});

it('rejects a malformed successful response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ status: 'success', data: { dreamRunIds: [] } })),
  );
  expect((await submitDream('space', 'all')).status).toBe('error');
});
