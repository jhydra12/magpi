import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DreamsLayout from './layout';

vi.mock('next/navigation', () => ({ usePathname: () => '/dreams' }));

describe('the dreams route', () => {
  it('shows the Dreams heading without explanatory copy', () => {
    render(<DreamsLayout>{null}</DreamsLayout>);

    expect(screen.getByRole('heading', { name: 'Dreams' })).toBeInTheDocument();
    expect(screen.queryByText(/dreaming is overnight processing/i)).not.toBeInTheDocument();
  });

  it('keeps the subtabs above the content, so a loading or error state cannot move them', () => {
    render(
      <DreamsLayout>
        <p>Something went wrong</p>
      </DreamsLayout>,
    );

    expect(screen.getByRole('navigation', { name: /dreams sections/i })).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
