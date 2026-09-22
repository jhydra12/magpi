import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordForm } from './forgot-password-form';
import { authClient, type AuthClientOptions } from './test-support';

const PAGE_ORIGIN = 'https://magpi.test';

const client = { current: authClient() };

vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current.supabase }));

function goTrue(options: AuthClientOptions = {}) {
  client.current = authClient(options);
  return client.current;
}

async function askForALink() {
  await userEvent.type(screen.getByLabelText('Email'), 'reader@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
}

beforeEach(() => {
  goTrue();
  vi.stubGlobal('location', { origin: PAGE_ORIGIN });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('asking for a password reset link', () => {
  it('tells the reader which address the link went to', async () => {
    render(<ForgotPasswordForm />);

    await askForALink();

    expect(await screen.findByText(/check reader@example\.com for a link/i)).toBeInTheDocument();
  });

  it('takes the email box away once the link is sent, so nobody asks twice', async () => {
    render(<ForgotPasswordForm />);

    await askForALink();

    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('asks for a link that lands the reader on the screen where they set a new password', async () => {
    const { calls } = goTrue();
    render(<ForgotPasswordForm />);

    await askForALink();

    expect(calls).toEqual([
      {
        method: 'resetPasswordForEmail',
        args: [
          'reader@example.com',
          { redirectTo: `${PAGE_ORIGIN}/auth/confirm?next=/update-password` },
        ],
      },
    ]);
  });

  it('tells the reader what the auth server said, and keeps the form so they can retry', async () => {
    goTrue({ error: { message: 'Email rate limit exceeded' } });
    render(<ForgotPasswordForm />);

    await askForALink();

    expect(await screen.findByRole('alert')).toHaveTextContent('Email rate limit exceeded');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled();
  });

  it('says it is sending while the request is in flight', async () => {
    goTrue({ neverResolves: true });
    render(<ForgotPasswordForm />);

    await askForALink();

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });
});
