import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SocialSignIn } from './social-sign-in';
import { authClient, type AuthClientOptions } from './test-support';

const PAGE_ORIGIN = 'https://magpi.test';

const client = { current: authClient() };

vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current.supabase }));

function goTrue(options: AuthClientOptions = {}) {
  client.current = authClient(options);
  return client.current;
}

const continueWithGitHub = () =>
  userEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }));

beforeEach(() => {
  goTrue();
  vi.stubGlobal('location', { origin: PAGE_ORIGIN });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signing in through GitHub', () => {
  it('gives GitHub a return address inside this app that carries the page the reader wanted', async () => {
    const { calls } = goTrue();
    render(<SocialSignIn next="/chat/abc?q=1" />);

    await continueWithGitHub();

    expect(calls).toEqual([
      {
        method: 'signInWithOAuth',
        args: [
          {
            provider: 'github',
            options: {
              redirectTo: `${PAGE_ORIGIN}/auth/oauth?next=${encodeURIComponent('/chat/abc?q=1')}`,
            },
          },
        ],
      },
    ]);
  });

  it('refuses to carry an off-origin return address through the provider', async () => {
    const { calls } = goTrue();
    render(<SocialSignIn next="https://evil.example/steal" />);

    await continueWithGitHub();

    expect(calls[0].args).toEqual([
      {
        provider: 'github',
        options: { redirectTo: `${PAGE_ORIGIN}/auth/oauth?next=%2Fchat` },
      },
    ]);
  });

  it('tells the reader why the handoff failed, and leaves the button usable', async () => {
    goTrue({ error: { message: 'Provider is not enabled' } });
    render(<SocialSignIn next="/chat" />);

    await continueWithGitHub();

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider is not enabled');
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeEnabled();
  });

  it('says it is redirecting while the handoff is in flight, since the page is about to leave', async () => {
    goTrue({ neverResolves: true });
    render(<SocialSignIn next="/chat" />);

    await continueWithGitHub();

    expect(screen.getByRole('button', { name: 'Redirecting…' })).toBeDisabled();
  });
});
