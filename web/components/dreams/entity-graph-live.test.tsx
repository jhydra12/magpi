import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { EntityGraphLive } from './entity-graph-live';

vi.mock('./entity-graph', () => ({
  EntityGraph: ({ groups }: { groups: { entities: { name: string }[] }[] }) => (
    <div>{groups.flatMap((group) => group.entities.map((entity) => entity.name)).join(',')}</div>
  ),
}));
vi.mock('./entity-groups', () => ({ EntityGroups: () => null }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const groups = [
  {
    kind: 'person',
    label: 'People',
    entities: [{ id: 'ada', name: 'Ada', summary: null, documents: [] }],
  },
];

it('adds real returned entities to an initially empty graph and stops after completion', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ active: true, groups }))
    .mockResolvedValueOnce(Response.json({ active: false, groups }));
  vi.stubGlobal('fetch', fetcher);
  render(<EntityGraphLive groups={[]} active />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByText('Ada')).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('does not overlap slow requests and aborts when leaving the tab', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn((_url: string, _options: RequestInit) => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<EntityGraphLive groups={[]} active />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const signal = fetcher.mock.calls[0][1].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it('detects a submission finishing after navigation to an initially idle graph', async () => {
  vi.useFakeTimers();
  const { beginDreamSubmission } = await import('@/lib/dreams/submission-events');
  const finish = beginDreamSubmission();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ active: false, groups: [] }))
    .mockResolvedValueOnce(Response.json({ active: true, groups }))
    .mockResolvedValueOnce(Response.json({ active: false, groups }));
  vi.stubGlobal('fetch', fetcher);
  render(<EntityGraphLive groups={[]} active={false} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await Promise.resolve();
  });
  expect(screen.getByText('Ada')).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('rechecks after an event during a pending read without overlapping requests', async () => {
  vi.useFakeTimers();
  const { beginDreamSubmission } = await import('@/lib/dreams/submission-events');
  let release = (_response: Response) => {};
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json({ active: false, groups }));
  vi.stubGlobal('fetch', fetcher);
  render(<EntityGraphLive groups={[]} active={false} />);
  const finish = beginDreamSubmission();
  finish();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {
    release(Response.json({ active: false, groups: [] }));
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Ada')).toBeVisible();
});
