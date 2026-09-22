import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignUpForm } from './sign-up-form';
import { authClient, type AuthClientOptions } from './test-support';

const PAGE_ORIGIN = 'https://magpi.test';

const client = { current: authClient() };
const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current.supabase }));

function goTrue(options: AuthClientOptions = {}) {
  client.current = authClient(options);
  return client.current;
}

async function signUp({ confirmation = 'correct horse' } = {}) {
  await userEvent.type(screen.getByLabelText('Email'), 'reader@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
  await userEvent.type(screen.getByLabelText('Password again'), confirmation);
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

beforeEach(() => {
  goTrue();
  vi.stubGlobal('location', { origin: PAGE_ORIGIN });
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('what happens after the account exists', () => {
  it('goes straight to chat when the project needs no confirmation', async () => {
    const assign = vi.fn();
    goTrue({ session: { access_token: 'a-real-session' } });
    vi.stubGlobal('location', { origin: PAGE_ORIGIN, assign });
    render(<SignUpForm />);

    await signUp();

    // No email was sent, so telling the reader to go and look for one is a lie.
    expect(assign).toHaveBeenCalledWith('/chat');
    expect(push).not.toHaveBeenCalled();
  });

  it('sends the reader to look for an email only when one is actually coming', async () => {
    goTrue({ session: null });
    render(<SignUpForm />);

    await signUp();

    expect(push).toHaveBeenCalledWith('/sign-up-success');
  });
});

describe('creating an account', () => {
  it('sends the address and password, with a confirmation link that comes back to this app', async () => {
    const { calls } = goTrue();
    render(<SignUpForm />);

    await signUp();

    expect(calls).toEqual([
      {
        method: 'signUp',
        args: [
          {
            email: 'reader@example.com',
            password: 'correct horse',
            options: { emailRedirectTo: `${PAGE_ORIGIN}/auth/confirm?next=/chat` },
          },
        ],
      },
    ]);
  });

  it('takes the new reader to the screen that tells them to check their email', async () => {
    render(<SignUpForm />);

    await signUp();

    expect(push).toHaveBeenCalledWith('/sign-up-success');
  });

  it('stops a reader who typed two different passwords before anything is sent', async () => {
    const { calls } = goTrue();
    render(<SignUpForm />);

    await signUp({ confirmation: 'correct hose' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Those two passwords are different.',
    );
    expect(calls).toEqual([]);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('tells the reader what the auth server said when the address is already taken', async () => {
    goTrue({ error: { message: 'User already registered' } });
    render(<SignUpForm />);

    await signUp();

    expect(await screen.findByRole('alert')).toHaveTextContent('User already registered');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('says it is creating the account while the request is in flight', async () => {
    goTrue({ neverResolves: true });
    render(<SignUpForm />);

    await signUp();

    expect(screen.getByRole('button', { name: 'Creating your account…' })).toBeDisabled();
  });
});
