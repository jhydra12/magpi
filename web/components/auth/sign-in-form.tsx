'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeNextPath } from '@/lib/safe-next-path';
import { createClient } from '@/lib/supabase/client';

import { FormError } from './form-error';
import { SocialSignIn } from './social-sign-in';

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setIsPending(false);
      return;
    }

    // A full navigation, so the new session cookie is carried on the very next request.
    window.location.assign(safeNextPath(next, '/chat'));
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={signIn} className="flex flex-col gap-4">
        <FormError message={error} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-tertiary-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot it?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-tertiary-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <SocialSignIn next={next} />
    </div>
  );
}
