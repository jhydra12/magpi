import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authClient, type AuthClientOptions } from './test-support';
import { UpdatePasswordForm } from './update-password-form';

const client = { current: authClient() };
const assign = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current.supabase }));

function goTrue(options: AuthClientOptions = {}) {
  client.current = authClient(options);
  return client.current;
}

async function saveNewPassword() {
  await userEvent.type(screen.getByLabelText('New password'), 'a longer secret');
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
}

beforeEach(() => {
  goTrue();
  vi.stubGlobal('location', { origin: 'https://magpi.test', assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
  assign.mockReset();
});

describe('setting a new password after a reset link', () => {
  it('saves the password the reader typed', async () => {
    const { calls } = goTrue();
    render(<UpdatePasswordForm />);

    await saveNewPassword();

    expect(calls).toEqual([{ method: 'updateUser', args: [{ password: 'a longer secret' }] }]);
  });

  it('drops the reader into chat once the password is saved', async () => {
    render(<UpdatePasswordForm />);

    await saveNewPassword();

    expect(assign).toHaveBeenCalledWith('/chat');
  });

  it('tells the reader what the auth server refused, and leaves them on the form', async () => {
    goTrue({ error: { message: 'New password should be different from the old password.' } });
    render(<UpdatePasswordForm />);

    await saveNewPassword();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'New password should be different from the old password.',
    );
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('says it is saving while the request is in flight', async () => {
    goTrue({ neverResolves: true });
    render(<UpdatePasswordForm />);

    await saveNewPassword();

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
