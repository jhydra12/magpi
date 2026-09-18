import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSnapshot, RUN_ID } from './activity-test-fixtures';
import { useDreamActivity } from './use-dream-activity';

const setup = () => {
  vi.useFakeTimers();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Dream status polling', () => {
  it('follows queued to running to completed and refreshes output once', async () => {
    const fetcher = setup();
    const initial = getSnapshot();
    const finished = vi.fn();
    fetcher
      .mockResolvedValueOnce(Response.json(getSnapshot({ status: 'running' })))
      .mockResolvedValueOnce(Response.json(getSnapshot({ status: 'succeeded' })));
    const { result } = renderHook(() => useDreamActivity(initial, finished));
    await tick();
    expect(result.current.snapshot.runs[0]?.status).toBe('running');
    expect(finished).not.toHaveBeenCalled();
    await tick();
    expect(result.current.snapshot.runs[0]?.status).toBe('succeeded');
    expect(finished).toHaveBeenCalledTimes(1);
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/dreams/runs?runs=${RUN_ID}`);
  });
  it('stops after failure and preserves the recorded reason', async () => {
    const fetcher = setup();
    const initial = getSnapshot({ status: 'running' });
    fetcher.mockResolvedValue(
      Response.json(getSnapshot({ status: 'failed', error: 'extract: unavailable' })),
    );
    const { result } = renderHook(() => useDreamActivity(initial, vi.fn()));
    await tick();
    await tick();
    expect(result.current.snapshot.runs[0]?.error).toBe('extract: unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps last observed status on network failure and retries', async () => {
    const fetcher = setup();
    const initial = getSnapshot();
    fetcher
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json(getSnapshot({ status: 'running' })));
    const { result } = renderHook(() => useDreamActivity(initial, vi.fn()));
    await tick();
    expect(result.current.failure).toContain('Retrying');
    expect(result.current.snapshot.runs[0]?.status).toBe('queued');
    await tick();
    expect(result.current.failure).toBeNull();
  });
  it('drops inaccessible runs and stops instead of showing stale rows', async () => {
    const fetcher = setup();
    const initial = getSnapshot();
    fetcher.mockResolvedValue(Response.json({ ...initial, runs: [] }));
    const { result } = renderHook(() => useDreamActivity(initial, vi.fn()));
    await tick();
    await tick();
    expect(result.current.snapshot.runs).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('clears prior activity and stops polling when the session expires', async () => {
    const fetcher = setup();
    const initial = getSnapshot();
    fetcher.mockResolvedValue(new Response(null, { status: 401 }));
    const { result } = renderHook(() => useDreamActivity(initial, vi.fn()));
    await tick();
    await tick();
    expect(result.current.snapshot.runs).toEqual([]);
    expect(result.current.failure).toContain('Sign in');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cancels in-flight requests and timers on unmount', async () => {
    const fetcher = setup();
    const initial = getSnapshot();
    fetcher.mockImplementation((_url: string, options: RequestInit) => {
      expect(options.signal?.aborted).toBe(false);
      return new Promise(() => {});
    });
    const { unmount } = renderHook(() => useDreamActivity(initial, vi.fn()));
    await tick();
    unmount();
    const options: RequestInit = fetcher.mock.calls[0]?.[1];
    expect(options.signal?.aborted).toBe(true);
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('accepts refreshed server state and stops an earlier poll', async () => {
    const fetcher = setup();
    const { result, rerender } = renderHook(({ initial }) => useDreamActivity(initial, vi.fn()), {
      initialProps: { initial: getSnapshot() },
    });
    rerender({ initial: getSnapshot({ status: 'succeeded' }) });
    expect(result.current.snapshot.runs[0]?.status).toBe('succeeded');
    await tick();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not poll completed history', async () => {
    const fetcher = setup();
    const initial = getSnapshot({ status: 'succeeded' });
    renderHook(() => useDreamActivity(initial, vi.fn()));
    await tick();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
