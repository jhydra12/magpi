import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  isDreamComputeAbsent,
  resetDreamCompute,
  assertComputeResetConfigured,
} from './compute-reset';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_ACCESS_TOKEN: 'private-test-token',
};
const present = (state = 'active') =>
  Response.json({ data: [{ id: 'dream', attributes: { build_state: state } }] });

describe('Dream Compute teardown', () => {
  it('treats explicit loopback as local without credentials or requests', async () => {
    const fetcher = vi.fn();
    for (const url of ['http://localhost:55321', 'http://127.0.0.1:55321', 'http://[::1]:55321']) {
      expect(
        await resetDreamCompute({ env: { NEXT_PUBLIC_SUPABASE_URL: url }, fetch: fetcher }),
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

  it('confirms absence from a successful list without issuing deletion', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [] }));
    expect(await resetDreamCompute({ env, fetch: fetcher })).toEqual({ complete: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://api.supabase.com/v2/projects/abcdefghijklmnopqrst/compute',
    );
  });

  it('deletes only dream and waits for a later list to confirm completion', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(present())
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    expect(await resetDreamCompute({ env, fetch: fetcher })).toEqual({ complete: false });
    expect(fetcher.mock.calls[1][0]).toBe(
      'https://api.supabase.com/v2/projects/abcdefghijklmnopqrst/compute/dream',
    );
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'DELETE', cache: 'no-store' });
  });

  it('polls a deleting service without repeating deletion', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [{ id: 'dream', attributes: { build_state: 'active', deleting: true } }],
      }),
    );
    expect(await resetDreamCompute({ env, fetch: fetcher })).toEqual({ complete: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('absence check never deletes an existing service', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(present());
    expect(await isDreamComputeAbsent({ env, fetch: fetcher })).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not mistake unreadable, rejected, or missing list responses for absence', async () => {
    for (const response of [
      new Response('no', { status: 403 }),
      new Response(null, { status: 404 }),
      Response.json({ items: [] }),
      new Response('bad json'),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(resetDreamCompute({ env, fetch: fetcher })).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps reset pending when deletion races another caller', async () => {
    for (const status of [404, 409]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(present())
        .mockResolvedValueOnce(new Response(null, { status }));
      expect(await resetDreamCompute({ env, fetch: fetcher })).toEqual({ complete: false });
    }
  });

  it('sanitizes remote errors and network failures', async () => {
    const failure = vi.fn<typeof fetch>().mockRejectedValue(new Error(env.SUPABASE_ACCESS_TOKEN));
    await expect(resetDreamCompute({ env, fetch: failure })).rejects.not.toThrow(
      env.SUPABASE_ACCESS_TOKEN,
    );
    const remote = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(present())
      .mockResolvedValueOnce(new Response(env.SUPABASE_ACCESS_TOKEN, { status: 500 }));
    await expect(resetDreamCompute({ env, fetch: remote })).rejects.toThrow('HTTP 500');
  });
});
