import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignInForm } from './sign-in-form';
import { authClient, type AuthClientOptions } from './test-support';

const PAGE_ORIGIN = 'https://magpi.test';

const client = { current: authClient() };
const assign = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current.supabase }));

function goTrue(options: AuthClientOptions = {}) {
  client.current = authClient(options);
  return client.current;
}

async function signIn() {
  await userEvent.type(screen.getByLabelText('Email'), 'reader@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  goTrue();
  vi.stubGlobal('location', { origin: PAGE_ORIGIN, assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
  assign.mockReset();
});

describe('signing in with a password', () => {
  it('hands the auth server the address and password the reader typed', async () => {
    const { calls } = goTrue();
    render(<SignInForm next="/chat" />);

    await signIn();

    expect(calls).toEqual([
      {
        method: 'signInWithPassword',
        args: [{ email: 'reader@example.com', password: 'correct horse' }],
      },
    ]);
  });

  it('takes the reader on to the page they were headed for, query and all', async () => {
    render(<SignInForm next="/chat/abc?q=1#top" />);

    await signIn();

    expect(assign).toHaveBeenCalledWith('/chat/abc?q=1#top');
  });

  it('refuses to hand a signed-in reader off to another site', async () => {
    render(<SignInForm next="https://evil.example/steal" />);

    await signIn();

    expect(assign).toHaveBeenCalledWith('/chat');
  });

  it('tells the reader what the auth server said, and leaves them able to try again', async () => {
    goTrue({ error: { message: 'Invalid login credentials' } });
    render(<SignInForm next="/chat" />);

    await signIn();

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('says nothing is wrong before the reader has tried anything', () => {
    render(<SignInForm next="/chat" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says it is signing in, and refuses a second attempt, while the first is in flight', async () => {
    const { calls } = goTrue({ neverResolves: true });
    render(<SignInForm next="/chat" />);

    await signIn();

    const button = screen.getByRole('button', { name: 'Signing in…' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(calls).toHaveLength(1);
  });
});
