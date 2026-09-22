import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LiveTitle } from './live-title';

afterEach(() => {
  vi.useRealTimers();
});

describe('LiveTitle', () => {
  it('shows the first name without a departing one', () => {
    render(<LiveTitle text="New conversation" />);

    expect(screen.getByText('New conversation')).toBeInTheDocument();
    expect(screen.queryByText('New conversation', { selector: '[aria-hidden]' })).toBeNull();
  });

  it('holds the old name while the new one arrives, then lets it go', () => {
    vi.useFakeTimers();
    const view = render(<LiveTitle text="New conversation" />);

    view.rerender(<LiveTitle text="Fold S1 materials" />);

    expect(screen.getByText('Fold S1 materials')).toBeInTheDocument();
    expect(screen.getByText('New conversation')).toHaveAttribute('aria-hidden', 'true');

    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(screen.queryByText('New conversation')).not.toBeInTheDocument();
    expect(screen.getByText('Fold S1 materials')).toBeInTheDocument();
  });
});
