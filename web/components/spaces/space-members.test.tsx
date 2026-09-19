import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SpaceMembers, type SpaceMember } from './space-members';

const getMember = (overrides: Partial<SpaceMember> = {}): SpaceMember => ({
  userId: '77777777-7777-4777-8777-777777777777',
  joinedAt: '2026-09-09T14:20:00.000Z',
  ...overrides,
});

describe('who is in a space', () => {
  it('counts one person as a member, not as one members', () => {
    render(<SpaceMembers kind="team" members={[getMember()]} />);

    expect(screen.getByRole('heading', { name: '1 member' })).toBeInTheDocument();
  });

  it('counts several people as members', () => {
    render(
      <SpaceMembers
        kind="team"
        members={[getMember(), getMember({ userId: '88888888-8888-4888-8888-888888888888' })]}
      />,
    );

    expect(screen.getByRole('heading', { name: '2 members' })).toBeInTheDocument();
  });

  it('counts an empty space as members, so the heading never reads 0 member', () => {
    render(<SpaceMembers kind="team" members={[]} />);

    expect(screen.getByRole('heading', { name: '0 members' })).toBeInTheDocument();
  });

  it('shows each person and the day they joined', () => {
    render(<SpaceMembers kind="team" members={[getMember()]} />);

    expect(screen.getByText('77777777')).toBeInTheDocument();
    expect(screen.getByText('joined 2026-09-09')).toHaveAttribute(
      'datetime',
      '2026-09-09T14:20:00.000Z',
    );
  });
});

describe('what a reader is told about membership they cannot change', () => {
  it('says a personal space is one person and stays one person', () => {
    render(<SpaceMembers kind="personal" members={[getMember()]} />);

    expect(screen.getByText(/one member, always. Nobody can be added to it/i)).toBeInTheDocument();
  });

  it('explains neither of those for a team space, where the list is the membership', () => {
    render(<SpaceMembers kind="team" members={[getMember()]} />);

    expect(screen.queryByText(/Nobody can be added to it/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Everyone in the organization is in this space/i),
    ).not.toBeInTheDocument();
  });

  it('does not tell a personal space reader about organization membership', () => {
    render(<SpaceMembers kind="personal" members={[getMember()]} />);

    expect(screen.queryByText(/Everyone in the organization/i)).not.toBeInTheDocument();
  });
});
