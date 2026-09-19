import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getActivityRun } from './activity-test-fixtures';
import { RunProgress } from './run-progress';

const observedAt = '2026-09-18T10:01:00.000Z';

describe('persisted Dream progress', () => {
  it('shows queued without inventing progress or runtime', () => {
    render(<RunProgress run={getActivityRun()} observedAt={observedAt} />);
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
  it('measures elapsed time from the saved start, including after reload', () => {
    render(
      <RunProgress
        run={getActivityRun({ status: 'running', started_at: '2026-09-18T10:00:00.000Z' })}
        observedAt={observedAt}
      />,
    );
    expect(screen.getByText('1m 0s')).toBeInTheDocument();
  });
  it('uses saved finish time and reports timeout details', () => {
    render(
      <RunProgress
        run={getActivityRun({
          status: 'timeout',
          started_at: '2026-09-18T10:00:00.000Z',
          finished_at: '2026-09-18T10:00:20.000Z',
          error: 'extract: Model deadline exceeded',
        })}
        observedAt={observedAt}
      />,
    );
    expect(screen.getByText('20s')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Timed out during extract. Model deadline exceeded.',
    );
  });
});
