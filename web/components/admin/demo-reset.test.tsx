import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { DemoReset } from './demo-reset';

const resetStep = vi.hoisted(() => vi.fn());
const resetDreams = vi.hoisted(() => vi.fn());
vi.mock('@/app/(app)/admin/demo/actions', () => ({ resetDemoStep: resetStep }));
vi.mock('@/app/(app)/admin/demo/reset-dreams', () => ({ resetDreams }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});
const completed = { status: 'success', data: { complete: true } };

it('resets dreams independently and disables both reset buttons during the request', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let finish!: (value: unknown) => void;
  resetDreams.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<DemoReset />);
  fireEvent.click(screen.getByRole('button', { name: 'Reset dreams' }));
  expect(screen.getByRole('button', { name: 'Resetting dreams…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  await act(async () => {
    finish({ status: 'success', data: undefined });
  });
  expect(screen.getByRole('status')).toHaveTextContent('Dreams reset. Ready to process again.');
  expect(resetStep).not.toHaveBeenCalled();
});

it('shows dream reset failures and permits retrying', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  resetDreams.mockResolvedValue({ status: 'error', message: 'Dreams are still running.' });
  render(<DemoReset />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reset dreams' }));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Dreams are still running.');
  expect(screen.getByRole('button', { name: 'Reset dreams' })).toBeEnabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('does not reset dreams when confirmation is declined', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<DemoReset />);
  fireEvent.click(screen.getByRole('button', { name: 'Reset dreams' }));
  expect(resetDreams).not.toHaveBeenCalled();
});

it('waits for each real stage and shows a dismissable toast only after all succeed', async () => {
  vi.useFakeTimers();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  resetStep
    .mockResolvedValue(completed)
    .mockResolvedValueOnce(completed)
    .mockResolvedValueOnce({ status: 'success', data: { complete: false } });
  render(<DemoReset />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  });
  const rows = within(screen.getByRole('list')).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('Complete');
  expect(rows[1]).toHaveTextContent('Running');
  expect(rows[2]).toHaveTextContent('Pending');
  expect(screen.getByRole('button', { name: 'Resetting…' })).toBeDisabled();
  expect(screen.queryByText('Demo is reset. Good luck!')).not.toBeInTheDocument();
  expect(resetStep.mock.calls.map(([step]) => step)).toEqual(['pause', 'chats']);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(resetStep.mock.calls.map(([step]) => step)).toEqual([
    'pause',
    'chats',
    'chats',
    'compute',
    'data',
    'freshen',
    'seed',
    'edge',
  ]);
  expect(rows.every((row) => row.textContent?.includes('Complete'))).toBe(true);
  expect(screen.getByText('Demo is reset. Good luck!')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  expect(screen.queryByText('Demo is reset. Good luck!')).not.toBeInTheDocument();
});

it('stops on failure and retries the entire sequence without a false success toast', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  resetStep
    .mockResolvedValue(completed)
    .mockResolvedValueOnce(completed)
    .mockResolvedValueOnce(completed)
    .mockResolvedValueOnce({ status: 'error', message: 'Compute deletion failed.' });
  render(<DemoReset />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Compute deletion failed.');
  const rows = within(screen.getByRole('list')).getAllByRole('listitem');
  expect(rows[2]).toHaveTextContent('Failed');
  expect(rows[3]).toHaveTextContent('Pending');
  expect(screen.queryByText('Demo is reset. Good luck!')).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  });
  expect(resetStep.mock.calls.map(([step]) => step)).toEqual([
    'pause',
    'chats',
    'compute',
    'pause',
    'chats',
    'compute',
    'data',
    'freshen',
    'seed',
    'edge',
  ]);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Demo is reset. Good luck!')).toBeVisible();
});

it('does nothing when the confirmation is declined', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<DemoReset />);
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(resetStep).not.toHaveBeenCalled();
});

it('shows a failed stage when its request rejects', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  resetStep.mockRejectedValueOnce(new Error('Request failed.'));
  render(<DemoReset />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Request failed.');
  expect(within(screen.getByRole('list')).getAllByRole('listitem')[0]).toHaveTextContent('Failed');
  expect(resetStep).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled();
});

it('stops polling after ten minutes and permits a new reset attempt', async () => {
  vi.useFakeTimers();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  resetStep.mockResolvedValue({ status: 'success', data: { complete: false } });
  render(<DemoReset />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600_000);
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This step is still waiting. Try Reset again.',
  );
  expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled();
  const calls = resetStep.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(resetStep).toHaveBeenCalledTimes(calls);
  expect(screen.queryByText('Demo is reset. Good luck!')).not.toBeInTheDocument();
});
