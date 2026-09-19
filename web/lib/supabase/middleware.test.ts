import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Cookie = { readonly name: string; readonly value: string };
type CookieWrite = Cookie & { readonly options?: Record<string, unknown> };

type CookieHandlers = {
  readonly getAll: () => readonly Cookie[];
  readonly setAll: (cookies: readonly CookieWrite[]) => void;
};

const session = {
  claims: null as Record<string, unknown> | null,
  refreshed: [] as CookieWrite[],
  handlers: null as CookieHandlers | null,
};

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: CookieHandlers }) => ({
    auth: {
      getClaims: async () => {
        session.handlers = options.cookies;
        if (session.refreshed.length > 0) options.cookies.setAll(session.refreshed);
        return { data: session.claims ? { claims: session.claims } : null };
      },
    },
  }),
}));

const { updateSession } = await import('./middleware');

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function signIn(): void {
  session.claims = { sub: '77777777-7777-4777-8777-777777777777' };
}

beforeEach(() => {
  session.claims = null;
  session.refreshed = [];
  session.handlers = null;
});

describe('the session check every request runs through', () => {
  it('lets a signed-in reader reach the page they asked for', async () => {
    signIn();

    const response = await updateSession(request('/chat'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it('sends a signed-out visitor to sign in, remembering where they were going', async () => {
    const response = await updateSession(request('/dreams/entities'));

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('next')).toBe('/dreams/entities');
  });

  it('lets a signed-out visitor read the marketing page', async () => {
    const response = await updateSession(request('/'));

    expect(response.headers.get('location')).toBeNull();
  });

  it.each([
    '/forgot-password',
    '/sign-in',
    '/sign-up',
    '/auth/confirm',
    '/pricing',
    '/api/stripe/webhook',
  ])('lets a signed-out visitor reach %s', async (path) => {
    const response = await updateSession(request(path));

    expect(response.headers.get('location')).toBeNull();
  });

  it('hands the client the cookies the browser sent, which is where the session is', async () => {
    signIn();

    await updateSession(request('/chat', 'sb-access-token=sent-by-the-browser'));

    expect(session.handlers?.getAll()).toEqual([
      { name: 'sb-access-token', value: 'sent-by-the-browser' },
    ]);
  });

  it('carries a refreshed session cookie onto the response, so nobody is signed out at random', async () => {
    signIn();
    session.refreshed = [
      { name: 'sb-access-token', value: 'refreshed', options: { httpOnly: true } },
    ];

    const response = await updateSession(request('/chat', 'sb-access-token=stale'));

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed');
  });
});
