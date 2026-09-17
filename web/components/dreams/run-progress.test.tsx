import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunProgress } from './run-progress';

const valueNow = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));

describe('the progress of a dream run', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('names what is running and where, and starts from nothing', () => {
    render(<RunProgress spaceName="Engineering" kindLabel="Digest" />);

    expect(
      screen.getByRole('progressbar', { name: 'Digest over Engineering' }),
    ).toBeInTheDocument();
    expect(valueNow()).toBe(0);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('creeps: a quarter of the way after ten seconds, and still short of full after two minutes', () => {
    render(<RunProgress spaceName="Engineering" kindLabel="Digest" />);

    act(() => vi.advanceTimersByTime(10_000));
    expect(valueNow()).toBeGreaterThanOrEqual(18);
    expect(valueNow()).toBeLessThanOrEqual(25);
    expect(screen.getByText('0:10')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(110_000));
    expect(valueNow()).toBeGreaterThan(85);
    expect(valueNow()).toBeLessThan(100);
    expect(screen.getByText('2:00')).toBeInTheDocument();
  });
});
