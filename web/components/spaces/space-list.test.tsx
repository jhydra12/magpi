import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Space } from '@/lib/spaces/spaces';

import { SpaceList } from './space-list';

const getSpace = (overrides: Partial<Space> = {}): Space => ({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Growth',
  kind: 'team',
  dreamingEnabled: false,
  memberCount: 4,
  documentCount: 12,
  ...overrides,
});

describe('the list of spaces', () => {
  it('makes each name the way into that space', () => {
    render(<SpaceList spaces={[getSpace()]} />);

    expect(screen.getByRole('link', { name: 'Growth' })).toHaveAttribute(
      'href',
      '/spaces/33333333-3333-4333-8333-333333333333',
    );
  });

  it("says who can see each space, in the reader's own terms", () => {
    render(
      <SpaceList
        spaces={[
          getSpace({ id: 'a', name: 'Personal', kind: 'personal' }),
          getSpace({ id: 'b', name: 'Everyone', kind: 'org' }),
          getSpace({ id: 'c', name: 'Growth', kind: 'team' }),
        ]}
      />,
    );

    expect(screen.getByText('Only you')).toBeInTheDocument();
    expect(screen.getByText('Organization space')).toBeInTheDocument();
    expect(screen.getByText('The people you add')).toBeInTheDocument();
  });

  it('says how much is in a space without making anyone open it', () => {
    render(<SpaceList spaces={[getSpace({ documentCount: 12, memberCount: 4 })]} />);

    const [row] = screen.getAllByRole('listitem');
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(within(row).getByText('documents')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByText('members')).toBeInTheDocument();
  });

  it('calls one person a member rather than one members', () => {
    render(
      <SpaceList spaces={[getSpace({ name: 'Personal', kind: 'personal', memberCount: 1 })]} />,
    );

    expect(screen.getByText('member')).toBeInTheDocument();
    expect(screen.queryByText('members')).not.toBeInTheDocument();
  });

  it('calls an empty space members, not member', () => {
    render(<SpaceList spaces={[getSpace({ memberCount: 0 })]} />);

    expect(screen.getByText('members')).toBeInTheDocument();
  });

  it('keeps the order it was handed, so the list never reshuffles under a reader', () => {
    render(
      <SpaceList
        spaces={[
          getSpace({ id: 'a', name: 'Personal', kind: 'personal' }),
          getSpace({ id: 'b', name: 'Everyone', kind: 'org' }),
          getSpace({ id: 'c', name: 'Growth' }),
        ]}
      />,
    );

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Personal',
      'Everyone',
      'Growth',
    ]);
  });
});
