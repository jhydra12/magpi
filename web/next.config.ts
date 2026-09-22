import type { NextConfig } from 'next';

/**
 * The browser talks to exactly one host besides this one: the Supabase project,
 * over https for PostgREST, GoTrue and Storage, and over wss for Realtime. Read
 * at call time rather than at module load so the value is the one the build was
 * given.
 */
function supabaseOrigins(): readonly string[] {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return [];

  try {
    const { origin } = new URL(configured);
    return [origin, origin.replace(/^http/, 'ws')];
  } catch {
    return [];
  }
}

/**
 * No nonce, so inline scripts are allowed by keyword. next-themes writes the
 * stored theme onto <html> from an inline script before first paint, and the
 * streamed RSC payload arrives as inline script tags, so both need either a
 * nonce or 'unsafe-inline'. A nonce has to be minted per request in proxy.ts,
 * which renders every route dynamically and gives up the prerendering the
 * pricing and auth pages have today. The directives that matter against
 * ingested text are the ones deciding where a request may go: connect-src,
 * form-action, object-src and base-uri.
 *
 * Development adds 'unsafe-eval' because React refresh compiles modules with
 * eval, and ws: for the hot reload socket.
 */
function contentSecurityPolicy(): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const connect = ["'self'", ...supabaseOrigins(), ...(isDevelopment ? ['ws:'] : [])];

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // blob: is the preview a dropzone makes of the file in the reader's hand.
    "img-src 'self' data: blob:",
    // next/font/google downloads the faces at build time and serves them here.
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    // The billing forms post to this origin, which answers 303 to Stripe. Some
    // browsers check the redirect target against this directive as well.
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * typedRoutes is deliberately off. It derives its route union from `.next/types`,
 * which does not exist until a build has run, so it turns `tsc --noEmit` on a
 * cold checkout into a wall of errors on every dynamic href. Nothing checks a
 * link on its own: the journeys cover auth, chrome and permissions only, so a
 * broken internal href is caught by that component's own test or not at all.
 */
const nextConfig: NextConfig = {
  /**
   * The dev server treats 127.0.0.1 as cross-origin and blocks its own client
   * chunks, so nothing hydrates and every form falls back to a native GET. The
   * Supabase CLI prints 127.0.0.1 URLs and Playwright drives that host, so both
   * spellings have to be allowed.
   */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
          // Two years, matching the preload list's floor. Digital Brain is not submitted
          // for preloading, so subdomains carry the header without the pledge.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Ingested files are served back through Storage links. A text/plain
          // upload sniffed as HTML would run in this origin.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // A document title is in the path of a shared link. The origin is all
          // another site needs to see.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Nothing in the app asks for a device, and a page that never asks
          // should say so where a browser will enforce it.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
