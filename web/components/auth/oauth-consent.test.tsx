import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OAuthConsent } from './oauth-consent';

const AUTHORIZATION = 'auth-1';
const REDIRECT = 'https://claude.ai/api/mcp/callback?code=abc';

type Call = { method: string; args: readonly unknown[] };

type ConsentOptions = {
  user?: { id: string; email: string } | null;
  details?: Record<string, unknown>;
  detailsError?: { message: string } | null;
  decisionError?: { message: string } | null;
};

const calls: Call[] = [];
const client = { current: consentClient() };
const replace = vi.fn();
// The block's hook leaves the consent page in history after a decision, so it uses assign.
const assign = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => client.current }));

/** The authorization as Supabase describes it when the person has not decided yet. */
function authorizationDetails(overrides: Record<string, unknown> = {}) {
  return {
    authorization_id: AUTHORIZATION,
    redirect_uri: 'https://claude.ai/api/mcp/callback',
    client: { id: 'client-1', name: 'Claude', uri: 'https://claude.ai', logo_uri: '' },
    user: { id: 'user-1', email: 'jane@example.com' },
    scope: 'openid email',
    ...overrides,
  };
}

function consentClient(options: ConsentOptions = {}) {
  const record =
    (method: string, answer: unknown, error: unknown = null) =>
    (...args: readonly unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve({ data: answer, error });
    };

  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: options.user === undefined ? { id: 'user-1' } : options.user },
          error: null,
        }),
      oauth: {
        getAuthorizationDetails: record(
          'getAuthorizationDetails',
          options.details ?? authorizationDetails(),
          options.detailsError ?? null,
        ),
        approveAuthorization: record(
          'approveAuthorization',
          { redirect_url: REDIRECT },
          options.decisionError ?? null,
        ),
        denyAuthorization: record(
          'denyAuthorization',
          { redirect_url: `${REDIRECT}&error=access_denied` },
          options.decisionError ?? null,
        ),
      },
    },
  };
}

function consenting(options: ConsentOptions = {}) {
  client.current = consentClient(options);
  return client.current;
}

beforeEach(() => {
  calls.length = 0;
  consenting();
  vi.stubGlobal('location', {
    origin: 'https://magpi.test',
    pathname: '/oauth/consent',
    search: `?authorization_id=${AUTHORIZATION}`,
    replace,
    assign,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  assign.mockReset();
});

describe('deciding whether an application may read your knowledge base', () => {
  it('names the application and says what it would be able to do', async () => {
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);

    expect(await screen.findByText(/Claude wants to read your Digital Brain/)).toBeInTheDocument();
    expect(screen.getByText(/Search and read the documents in your spaces/)).toBeInTheDocument();
    expect(screen.getByText(/Write notes into a space you are a member of/)).toBeInTheDocument();
    // The account being handed over, so the wrong one is visible before the button is pressed.
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
  });

  it('says what each requested scope means rather than printing the scope', async () => {
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);

    expect(await screen.findByText('See your email address')).toBeInTheDocument();
    expect(screen.queryByText('openid email')).not.toBeInTheDocument();
  });

  it('approving hands the decision back to the application', async () => {
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));

    expect(calls.map((call) => call.method)).toEqual([
      'getAuthorizationDetails',
      'approveAuthorization',
    ]);
    expect(assign).toHaveBeenCalledWith(REDIRECT);
  });

  it('denying sends them back with a refusal rather than doing nothing', async () => {
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Deny' }));

    expect(calls.map((call) => call.method)).toContain('denyAuthorization');
    expect(assign).toHaveBeenCalledWith(`${REDIRECT}&error=access_denied`);
  });

  // A second press would spend the same authorization twice, and the second one fails.
  it('takes one decision however many times the button is pressed', async () => {
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);
    const allow = await screen.findByRole('button', { name: 'Allow' });

    await userEvent.click(allow);
    await userEvent.click(allow);

    expect(calls.filter((call) => call.method === 'approveAuthorization')).toHaveLength(1);
  });

  it('sends a signed-out person to sign in and back to this same authorization', async () => {
    consenting({ user: null });
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);

    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        `/sign-in?next=${encodeURIComponent(`/oauth/consent?authorization_id=${AUTHORIZATION}`)}`,
      ),
    );
    expect(calls).toHaveLength(0);
  });

  // Supabase answers with somewhere to go rather than something to ask when they said yes before.
  it('does not ask twice when this application was already allowed', async () => {
    consenting({ details: { redirect_url: REDIRECT } });
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(REDIRECT));
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument();
  });

  it('a link with no authorization on it grants nothing and says so', async () => {
    render(<OAuthConsent authorizationId={null} />);

    expect(await screen.findByText(/needs an authorization_id/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('shows why an unreadable authorization could not be shown', async () => {
    consenting({ detailsError: { message: 'that authorization has expired' } });
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);

    expect(await screen.findByText('that authorization has expired')).toBeInTheDocument();
  });

  it('lets them try again when the decision itself failed', async () => {
    consenting({ decisionError: { message: 'the authorization server is down' } });
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));

    expect(await screen.findByText('the authorization server is down')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeEnabled();
  });

  it('an application that registered itself with no name is still described', async () => {
    consenting({
      details: authorizationDetails({ client: { id: 'c', name: '', uri: '', logo_uri: '' } }),
    });
    render(<OAuthConsent authorizationId={AUTHORIZATION} />);

    expect(
      await screen.findByText(/An application wants to read your Digital Brain/),
    ).toBeInTheDocument();
  });
});
