import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';
import type { DreamActivitySnapshot } from '@/lib/dreams/activity';

import { getActivityRun, RUN_ID } from './activity-test-fixtures';
import { SpaceDreaming, type DreamingSpace } from './space-dreaming';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const SPACE_ID = '33333333-3333-4333-8333-333333333333';
const getSpace = (overrides?: Partial<DreamingSpace>): DreamingSpace => ({
  id: SPACE_ID,
  name: 'Engineering',
  dreaming_enabled: true,
  ...overrides,
});
const getInitial = (runs: DreamActivitySnapshot['runs'] = []): DreamActivitySnapshot => ({
  runs,
  observedAt: '2026-09-18T10:00:10.000Z',
});
const getActions = () => ({
  nextDreamLabel: '1:55am UTC',
  onRun: vi.fn().mockResolvedValue(
    successState({
      dreamRunId: RUN_ID,
      dreamRunIds: [RUN_ID],
      status: 'queued',
      outputDocumentId: null,
    }),
  ),
});

describe('dreaming in each space row', () => {
  it('measures all three tasks and stays active until the last task finishes', () => {
    vi.useFakeTimers();
    const props = { spaces: [getSpace()], ...getActions() };
    const tasks = [
      getActivityRun({
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'entities',
        status: 'running',
        started_at: '2026-09-18T10:00:00.000Z',
      }),
      getActivityRun(),
      getActivityRun({ id: '44444444-4444-4444-8444-444444444444', kind: 'connections' }),
    ];
    const { rerender } = render(<SpaceDreaming {...props} initial={getInitial(tasks)} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('status')).toHaveTextContent(
      '0 of 3 tasks completed · Finding entities',
    );
    const twoDone = tasks.map((run) => ({
      ...run,
      status: run.kind === 'connections' ? ('running' as const) : ('succeeded' as const),
      finished_at: run.kind === 'connections' ? null : '2026-09-18T10:00:08.000Z',
    }));
    rerender(<SpaceDreaming {...props} initial={getInitial(twoDone)} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '66');
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 of 3 tasks completed · Finding related documents',
    );
    expect(screen.getByRole('button', { name: 'Start dreaming' })).toBeDisabled();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '66');
    rerender(
      <SpaceDreaming
        {...props}
        initial={getInitial(
          twoDone.map((run) => ({
            ...run,
            status: 'succeeded',
            finished_at: '2026-09-18T10:00:10.000Z',
          })),
        )}
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('button', { name: 'Start dreaming' })).toBeEnabled();
  });

  it('preserves partial completion and shows a failed task instead of claiming success', () => {
    const props = { spaces: [getSpace()], ...getActions() };
    const { rerender } = render(
      <SpaceDreaming {...props} initial={getInitial([getActivityRun()])} />,
    );
    rerender(
      <SpaceDreaming
        {...props}
        initial={getInitial([
          getActivityRun({ status: 'succeeded' }),
          getActivityRun({
            id: '22222222-2222-4222-8222-222222222222',
            kind: 'entities',
            status: 'failed',
            error: 'synthesize: model unavailable',
          }),
          getActivityRun({
            id: '44444444-4444-4444-8444-444444444444',
            kind: 'connections',
            status: 'succeeded',
          }),
        ])}
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '66');
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 tasks completed · 1 failed');
    expect(screen.getByRole('alert')).toHaveTextContent(/model unavailable/i);
  });

  it('starts all tasks without switches, a selector, or a separate activity section', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace()]} initial={getInitial()} {...actions} />);
    expect(screen.getByText('Next dream: 1:55am UTC')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Dream activity')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start dreaming' }));
    expect(actions.onRun).toHaveBeenCalledWith(SPACE_ID, 'all');
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Next dream: 1:55am UTC')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Queued'));
  });

  it('keeps the page interactive while the all-spaces requests are pending', async () => {
    const onRun = vi.fn().mockReturnValue(new Promise(() => {}));
    render(
      <SpaceDreaming
        spaces={[getSpace(), getSpace({ id: 'other-space', name: 'Finance' })]}
        initial={getInitial()}
        nextDreamLabel="1:55am UTC"
        onRun={onRun}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Start dreaming in all spaces' }));
    expect(onRun).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Start dreaming in all spaces' })).toBeDisabled();
  });

  it('replaces the schedule immediately, then follows the saved run', async () => {
    const pending = Promise.withResolvers<
      ReturnType<
        typeof successState<{
          dreamRunId: string;
          dreamRunIds: readonly string[];
          status: 'queued';
          outputDocumentId: null;
        }>
      >
    >();
    const props = {
      spaces: [getSpace()],
      nextDreamLabel: '1:55am UTC',
      onRun: vi.fn().mockReturnValue(pending.promise),
    };
    const { rerender } = render(<SpaceDreaming {...props} initial={getInitial()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start dreaming' }));
    expect(screen.queryByText('Next dream: 1:55am UTC')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Starting…');
    expect(screen.getByRole('button', { name: 'Start dreaming' })).toBeDisabled();
    await act(async () => {
      pending.resolve(
        successState({
          dreamRunId: RUN_ID,
          dreamRunIds: [RUN_ID],
          status: 'queued',
          outputDocumentId: null,
        }),
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent('Queued');
    rerender(
      <SpaceDreaming
        {...props}
        initial={getInitial([
          getActivityRun({
            status: 'running',
            started_at: '2026-09-18T10:00:00.000Z',
          }),
        ])}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Running');
    expect(screen.getByLabelText('Engineering elapsed time')).toHaveTextContent('00:10');
  });

  it('shows running progress and the elapsed timer in the matching space only', () => {
    render(
      <SpaceDreaming
        spaces={[getSpace(), getSpace({ id: 'other-space', name: 'Finance' })]}
        initial={getInitial([
          getActivityRun({ status: 'running', started_at: '2026-09-18T10:00:00.000Z' }),
        ])}
        {...getActions()}
      />,
    );
    const row = within(screen.getByRole('group', { name: 'Engineering' }));
    expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Running');
    expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(row.getByLabelText('Engineering elapsed time')).toHaveTextContent('00:10');
    expect(row.getByRole('button', { name: 'Start dreaming' })).toBeDisabled();
    expect(
      within(screen.getByRole('group', { name: 'Finance' })).queryByRole('progressbar'),
    ).not.toBeInTheDocument();
  });

  it('advances elapsed time each second and stops at the saved finish time', () => {
    vi.useFakeTimers();
    const props = { spaces: [getSpace()], ...getActions() };
    const { rerender } = render(
      <SpaceDreaming
        {...props}
        initial={getInitial([
          getActivityRun({ status: 'running', started_at: '2026-09-18T10:00:00.000Z' }),
        ])}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Engineering elapsed time')).toHaveTextContent('00:11');
    rerender(
      <SpaceDreaming
        {...props}
        initial={getInitial([
          getActivityRun({
            status: 'succeeded',
            started_at: '2026-09-18T10:00:00.000Z',
            finished_at: '2026-09-18T11:02:03.000Z',
            output_document_id: '44444444-4444-4444-8444-444444444444',
          }),
        ])}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByLabelText('Engineering elapsed time')).toHaveTextContent('01:02:03');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('link', { name: 'Open output' })).toHaveAttribute(
      'href',
      `/dreams/${RUN_ID}`,
    );
    expect(screen.getByRole('button', { name: 'Start dreaming' })).toBeEnabled();
  });

  it('shows a queued job ahead of an older completed run', () => {
    render(
      <SpaceDreaming
        spaces={[getSpace()]}
        initial={getInitial([
          getActivityRun(),
          getActivityRun({ id: '22222222-2222-4222-8222-222222222222', status: 'succeeded' }),
        ])}
        {...getActions()}
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Queued');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows a failed job beside its space and allows another attempt', () => {
    const props = { spaces: [getSpace()], ...getActions() };
    const { rerender } = render(
      <SpaceDreaming {...props} initial={getInitial([getActivityRun({ status: 'running' })])} />,
    );
    rerender(
      <SpaceDreaming
        {...props}
        initial={getInitial([
          getActivityRun({
            status: 'failed',
            started_at: '2026-09-18T10:00:00.000Z',
            error: 'synthesize: model unavailable',
            finished_at: '2026-09-18T10:00:08.000Z',
          }),
        ])}
        {...getActions()}
      />,
    );
    expect(
      within(screen.getByRole('group', { name: 'Engineering' })).getByRole('alert'),
    ).toHaveTextContent(/model unavailable/i);
    expect(screen.getByLabelText('Engineering elapsed time')).toHaveTextContent('00:08');
    expect(screen.getByRole('button', { name: 'Start dreaming' })).toBeEnabled();
  });

  it('hides finished progress on a fresh page load', () => {
    render(
      <SpaceDreaming
        spaces={[getSpace()]}
        initial={getInitial([
          getActivityRun({ status: 'succeeded', finished_at: '2026-09-18T10:00:09.000Z' }),
        ])}
        {...getActions()}
      />,
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('Next dream: 1:55am UTC')).toBeInTheDocument();
  });

  it('shows the last Dream time even when it is outside recent manual activity', () => {
    render(
      <SpaceDreaming
        spaces={[getSpace()]}
        initial={getInitial()}
        lastDreamTimes={{ [SPACE_ID]: '2026-09-16T02:05:00.000Z' }}
        {...getActions()}
      />,
    );
    expect(screen.getByText('Last dream: 2:05am UTC')).toHaveAttribute(
      'title',
      'Wed, 16 Sep 2026 02:05:00 GMT',
    );
    expect(screen.getByText('Next dream: 1:55am UTC')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('keeps active progress beyond five minutes and hides a result five minutes after completion', () => {
    vi.useFakeTimers();
    const props = { spaces: [getSpace()], ...getActions() };
    const active = getInitial([getActivityRun({ status: 'running' })]);
    const { rerender, unmount } = render(<SpaceDreaming {...props} initial={active} />);
    act(() => vi.advanceTimersByTime(300_000));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    const completed = getInitial([
      getActivityRun({
        status: 'succeeded',
        finished_at: active.observedAt,
      }),
    ]);
    rerender(<SpaceDreaming {...props} initial={completed} />);
    act(() => vi.advanceTimersByTime(299_999));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('Next dream: 1:55am UTC')).toBeInTheDocument();
    unmount();
  });

  it('respects a space where dreaming is disabled', () => {
    render(
      <SpaceDreaming
        spaces={[getSpace({ dreaming_enabled: false })]}
        initial={getInitial()}
        {...getActions()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Start dreaming' })).toBeDisabled();
  });

  it('reports a refused start in its space row', async () => {
    const actions = {
      nextDreamLabel: '1:55am UTC',
      onRun: vi.fn().mockResolvedValue({ status: 'error', message: 'Not allowed.' }),
    };
    render(<SpaceDreaming spaces={[getSpace()]} initial={getInitial()} {...actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start dreaming' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed.');
    expect(screen.getByText('Next dream: 1:55am UTC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start dreaming' })).toBeEnabled();
  });
});

it('waits for capacity before submitting more than four spaces and prevents duplicate starts', async () => {
  const releases: Array<() => void> = [];
  const onRun = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<ReturnType<typeof getActions>['onRun']>>>((resolve) => {
        releases.push(() =>
          resolve(
            successState({
              dreamRunId: RUN_ID,
              dreamRunIds: [RUN_ID],
              status: 'queued',
              outputDocumentId: null,
            }),
          ),
        );
      }),
  );
  render(
    <SpaceDreaming
      spaces={Array.from({ length: 9 }, (_, index) =>
        getSpace({ id: String(index), name: `Space ${index}` }),
      )}
      initial={getInitial()}
      onRun={onRun}
      nextDreamLabel="1:55am UTC"
    />,
  );
  const button = screen.getByRole('button', { name: 'Start dreaming in all spaces' });
  await userEvent.click(button);
  expect(onRun).toHaveBeenCalledTimes(4);
  await userEvent.click(button);
  expect(onRun).toHaveBeenCalledTimes(4);
  await act(async () => {
    releases.slice(0, 4).forEach((release) => release());
  });
  expect(onRun).toHaveBeenCalledTimes(8);
  await act(async () => {
    releases.slice(4, 8).forEach((release) => release());
  });
  expect(onRun).toHaveBeenCalledTimes(9);
  await act(async () => {
    releases[8]();
  });
  expect(button).toBeEnabled();
});

it('keeps an accepted new batch queued until its status arrives, hiding older completion', async () => {
  const old = getActivityRun({ status: 'succeeded', finished_at: '2026-09-18T10:00:10.000Z' });
  const newId = '22222222-2222-4222-8222-222222222222';
  render(
    <SpaceDreaming
      spaces={[getSpace()]}
      initial={getInitial([old])}
      nextDreamLabel="1:55am UTC"
      onRun={async () =>
        successState({
          dreamRunId: newId,
          dreamRunIds: [newId],
          status: 'queued',
          outputDocumentId: null,
        })
      }
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Start dreaming in all spaces' }));
  expect(
    within(screen.getByRole('group', { name: 'Engineering' })).getByRole('status'),
  ).toHaveTextContent('Queued');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(screen.queryByText(/Last dream:/)).not.toBeInTheDocument();
});
