import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getActivityRun } from './activity-test-fixtures';
import { DreamActivity } from './dream-activity';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('visible Dream activity', () => {
  it('shows remaining work, elapsed batch time and recent completions for an explicit batch', () => {
    render(
      <DreamActivity
        isBatch
        initial={{
          observedAt: '2026-09-18T10:01:00.000Z',
          runs: [
            getActivityRun(),
            getActivityRun({
              id: '22222222-2222-4222-8222-222222222222',
              status: 'succeeded',
              finished_at: '2026-09-18T10:00:50.000Z',
            }),
          ],
        }}
      />,
    );
    expect(screen.getByText('Remaining').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Batch elapsed').parentElement).toHaveTextContent('1m 0s');
    expect(screen.getByText('Completed in last 30s').parentElement).toHaveTextContent('1');
    expect(screen.getByText(/Measured at 10:01:00 UTC/)).toBeInTheDocument();
  });

  it('keeps batch measurements off the general recent activity view', () => {
    render(<DreamActivity initial={{ observedAt: '2026-09-18T10:01:00.000Z', runs: [] }} />);
    expect(screen.queryByText('Batch elapsed')).not.toBeInTheDocument();
    expect(screen.queryByText(/Up to 100 active runs/)).not.toBeInTheDocument();
    for (const label of ['queued', 'running', 'completed', 'failed']) {
      expect(screen.queryByText(label, { selector: 'dt' })).not.toBeInTheDocument();
    }
  });

  it('counts real statuses, includes timeout as failed and links completed output', () => {
    render(
      <DreamActivity
        isBatch
        initial={{
          observedAt: '2026-09-18T10:00:10.000Z',
          runs: [
            getActivityRun(),
            getActivityRun({ id: '22222222-2222-4222-8222-222222222222', status: 'running' }),
            getActivityRun({
              id: '33333333-3333-4333-8333-333333333333',
              status: 'succeeded',
              output_document_id: '44444444-4444-4444-8444-444444444444',
            }),
            getActivityRun({
              id: '55555555-5555-4555-8555-555555555555',
              status: 'timeout',
              error: 'extract: time budget exceeded',
            }),
          ],
        }}
      />,
    );
    expect(screen.getByText('Dream batch')).toBeInTheDocument();
    for (const label of ['queued', 'running', 'completed', 'failed']) {
      const term = screen.getByText(label, { selector: 'dt' });
      expect(term.parentElement).toHaveTextContent('1');
    }
    expect(screen.getByRole('link', { name: 'Open output' })).toHaveAttribute(
      'href',
      '/dreams/33333333-3333-4333-8333-333333333333',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/time budget exceeded/i);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
