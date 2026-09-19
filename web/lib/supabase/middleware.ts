import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';
import { safeNextPath } from '@/lib/safe-next-path';

/** Everything else requires a session. */
const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/auth', '/pricing', '/api/stripe'] as const;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Nothing may run between createServerClient and getClaims(), or users are signed out.
  const { data } = await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === '/' ||
    pathname === '/forgot-password' ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', safeNextPath(pathname, '/', request.nextUrl.origin));
    return NextResponse.redirect(url);
  }

  // Return this response object as it is. A fresh one loses the cookies set above.
  return supabaseResponse;
}
