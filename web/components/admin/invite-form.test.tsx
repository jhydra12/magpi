import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { errorState, successState, type ActionState } from '@/lib/actions/state';
import type { InvitedMember } from '@/app/(app)/admin/members/actions';

import { InviteForm, type InviteAction } from './invite-form';

const BASE_URL = 'https://magpi.test';
const TOKEN = 'JJvJj0kZ7Yc2mWl8pQ3sR1tU4vX7yA0bC3dE6fG9hI';

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

function invited(overrides: Partial<InvitedMember> = {}): InvitedMember {
  return { email: 'grace@example.com', token: TOKEN, ...overrides };
}

function answering(state: ActionState<InvitedMember>): {
  action: InviteAction;
  submitted: FormData[];
} {
  const submitted: FormData[] = [];

  const action: InviteAction = async (_previous, formData) => {
    submitted.push(formData);
    return state;
  };

  return { action, submitted };
}

async function invite(action: InviteAction, email = 'grace@example.com') {
  render(<InviteForm action={action} baseUrl={BASE_URL} />);
  await user.type(screen.getByLabelText('Email address'), email);
  await user.click(screen.getByRole('button', { name: 'Send invitation' }));
}

describe('inviting a colleague', () => {
  it('sends the address and the role the admin picked', async () => {
    const { action, submitted } = answering(successState(invited()));

    render(<InviteForm action={action} baseUrl={BASE_URL} />);
    await user.type(screen.getByLabelText('Email address'), 'grace@example.com');
    await user.selectOptions(screen.getByLabelText('Role'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(submitted).toHaveLength(1);
    expect(submitted[0].get('email')).toBe('grace@example.com');
    expect(submitted[0].get('role')).toBe('admin');
  });

  it('starts a new invitation at member, so an admin is something you choose on purpose', () => {
    const { action } = answering(successState(invited()));

    render(<InviteForm action={action} baseUrl={BASE_URL} />);

    expect(screen.getByLabelText('Role')).toHaveValue('member');
  });

  it('shows the link to send on, and says it will not be shown again', async () => {
    const { action } = answering(successState(invited()));

    await invite(action);

    expect(await screen.findByText(`${BASE_URL}/invite/${TOKEN}`)).toBeInTheDocument();
    expect(
      screen.getByText(
        'This is the only time the link is shown. Digital Brain stores a hash of it.',
      ),
    ).toBeInTheDocument();
  });

  it('names the person the link was made for', async () => {
    const { action } = answering(successState(invited({ email: 'ada@example.com' })));

    await invite(action, 'ada@example.com');

    expect(
      await screen.findByText('Invitation created for ada@example.com. Send them this link.'),
    ).toBeInTheDocument();
  });

  it('says why an invitation was refused, and offers no link', async () => {
    const { action } = answering(errorState('That address already has an invitation waiting.'));

    await invite(action);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That address already has an invitation waiting.',
    );
    expect(screen.queryByText(new RegExp(TOKEN))).not.toBeInTheDocument();
  });

  it('shows no link and no error before anything has been asked for', () => {
    const { action } = answering(successState(invited()));

    render(<InviteForm action={action} baseUrl={BASE_URL} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(TOKEN))).not.toBeInTheDocument();
  });

  it('closes the button while the invitation is being created, so it is not sent twice', async () => {
    const inFlight = { finish: () => {} };

    const action: InviteAction = async () => {
      await new Promise<void>((resolve) => {
        inFlight.finish = resolve;
      });
      return successState(invited());
    };

    await invite(action);

    const button = await screen.findByRole('button', { name: 'Inviting' });
    expect(button).toBeDisabled();

    inFlight.finish();
    expect(await screen.findByRole('button', { name: 'Send invitation' })).toBeEnabled();
  });
});
