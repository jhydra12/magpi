import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  areComputeInstancesAbsent,
  assertComputeResetConfigured,
  resetAllComputeInstances,
} from './compute-reset';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_ACCESS_TOKEN: 'private-test-token',
};

const computeInstance = (id: string, options: { state?: string; deleting?: boolean } = {}) => ({
  id,
  attributes: {
    build_state: options.state ?? 'active',
    ...(options.deleting ? { deleting: true } : {}),
  },
});

const computeList = (...instances: ReturnType<typeof computeInstance>[]) =>
  Response.json({ data: instances });

describe('Compute teardown', () => {
  it('treats explicit loopback as local without credentials or requests', async () => {
    const fetcher = vi.fn();
    for (const url of ['http://localhost:55321', 'http://127.0.0.1:55321', 'http://[::1]:55321']) {
      expect(
        await resetAllComputeInstances({ env: { NEXT_PUBLIC_SUPABASE_URL: url }, fetch: fetcher }),
      ).toEqual({ complete: true });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('validates the hosted target and token before performing any work', () => {
    expect(() =>
      assertComputeResetConfigured({ NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow('SUPABASE_ACCESS_TOKEN');
    for (const url of [
      'https://supabase.co.attacker.example',
      'http://abcdefghijklmnopqrst.supabase.co',
      'https://abcdefghijklmnopqrst.supabase.co/path',
      'https://user:password@abcdefghijklmnopqrst.supabase.co',
      'http://localhost.attacker.example',
    ]) {
      expect(() =>
        assertComputeResetConfigured({ ...env, NEXT_PUBLIC_SUPABASE_URL: url }),
      ).toThrow();
    }
  });

  it('confirms the project is clear only from a successful empty list', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(computeList());
    expect(await resetAllComputeInstances({ env, fetch: fetcher })).toEqual({ complete: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://api.supabase.com/v2/projects/abcdefghijklmnopqrst/compute',
    );
  });

  it('deletes every listed service and waits for a later list to confirm completion', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        computeList(
          computeInstance('dream'),
          computeInstance('dream-worker-east'),
          computeInstance('scheduled-ingest'),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    expect(await resetAllComputeInstances({ env, fetch: fetcher })).toEqual({ complete: false });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.supabase.com/v2/projects/abcdefghijklmnopqrst/compute',
      'https://api.supabase.com/v2/projects/abcdefghijklmnopqrst/compute/dream',
      'https://api.supabase.com/v2/projects/abcdefghijklmnopqrst/compute/dream-worker-east',
      'https://api.supabase.com/v2/projects/abcdefghijklmnopqrst/compute/scheduled-ingest',
    ]);
    expect(fetcher.mock.calls.slice(1).map(([, init]) => init)).toEqual([
      expect.objectContaining({ method: 'DELETE', cache: 'no-store' }),
      expect.objectContaining({ method: 'DELETE', cache: 'no-store' }),
      expect.objectContaining({ method: 'DELETE', cache: 'no-store' }),
    ]);
  });

  it('skips services already being deleted and deletes the others', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        computeList(computeInstance('dream', { deleting: true }), computeInstance('other-worker')),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    expect(await resetAllComputeInstances({ env, fetch: fetcher })).toEqual({ complete: false });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.supabase.com/v2/projects/abcdefghijklmnopqrst/compute',
      'https://api.supabase.com/v2/projects/abcdefghijklmnopqrst/compute/other-worker',
    ]);
  });

  it('detects any remaining service until the project list is empty', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(computeList(computeInstance('another-service')))
      .mockResolvedValueOnce(computeList());
    expect(await areComputeInstancesAbsent({ env, fetch: fetcher })).toBe(false);
    expect(await areComputeInstancesAbsent({ env, fetch: fetcher })).toBe(true);
  });

  it('does not mistake unreadable, rejected, or missing list responses for absence', async () => {
    for (const response of [
      new Response('no', { status: 403 }),
      new Response(null, { status: 404 }),
      Response.json({ items: [] }),
      Response.json({ data: [{ attributes: { build_state: 'active' } }] }),
      Response.json({ data: [{ id: '', attributes: { build_state: 'active' } }] }),
      new Response('bad json'),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(areComputeInstancesAbsent({ env, fetch: fetcher })).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps reset pending when deletion races another caller', async () => {
    for (const status of [404, 409]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(computeList(computeInstance('dream')))
        .mockResolvedValueOnce(new Response(null, { status }));
      expect(await resetAllComputeInstances({ env, fetch: fetcher })).toEqual({ complete: false });
    }
  });

  it('confirms asynchronous deletion on a later reset attempt', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(computeList(computeInstance('dream')))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(computeList());
    expect(await resetAllComputeInstances({ env, fetch: fetcher })).toEqual({ complete: false });
    expect(await resetAllComputeInstances({ env, fetch: fetcher })).toEqual({ complete: true });
  });

  it('sanitizes remote errors and network failures', async () => {
    const failure = vi.fn<typeof fetch>().mockRejectedValue(new Error(env.SUPABASE_ACCESS_TOKEN));
    await expect(resetAllComputeInstances({ env, fetch: failure })).rejects.not.toThrow(
      env.SUPABASE_ACCESS_TOKEN,
    );
    const remote = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(computeList(computeInstance('dream')))
      .mockResolvedValueOnce(new Response(env.SUPABASE_ACCESS_TOKEN, { status: 500 }));
    await expect(resetAllComputeInstances({ env, fetch: remote })).rejects.toThrow('HTTP 500');
  });
});
