import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DreamTabs } from './dream-tabs';

const pathname = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => pathname() }));

describe('the dreams subtabs', () => {
  it('marks runs as the section a person is in', () => {
    pathname.mockReturnValue('/dreams');
    render(<DreamTabs />);

    expect(screen.getByRole('link', { name: 'Runs' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps runs selected while a single run is open, because it is the parent', () => {
    pathname.mockReturnValue('/dreams/11111111-2222-4333-8444-555555555555');
    render(<DreamTabs />);

    expect(screen.getByRole('link', { name: 'Runs' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks entities when that is the section', () => {
    pathname.mockReturnValue('/dreams/entities');
    render(<DreamTabs />);

    expect(screen.getByRole('link', { name: 'Entities' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Runs' })).not.toHaveAttribute('aria-current');
  });
  it('places Log after Entities and selects it on the history page', () => {
    pathname.mockReturnValue('/dreams/log');
    render(<DreamTabs />);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Runs',
      'Entities',
      'Log',
    ]);
    expect(screen.getByRole('link', { name: 'Log' })).toHaveAttribute('href', '/dreams/log');
    expect(screen.getByRole('link', { name: 'Log' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Runs' })).not.toHaveAttribute('aria-current');
  });
});
