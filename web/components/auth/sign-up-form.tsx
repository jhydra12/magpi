'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

import { FormError } from './form-error';
import { SocialSignIn } from './social-sign-in';

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function signUp(event: React.FormEvent) {
    event.preventDefault();

    if (password !== confirmation) {
      setError('Those two passwords are different.');
      return;
    }

    setIsPending(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/chat` },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsPending(false);
      return;
    }

    // signUp returns a session when email confirmation is off, so the account is already usable.
    if (data.session) {
      window.location.assign('/chat');
      return;
    }

    router.push('/sign-up-success');
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={signUp} className="flex flex-col gap-4">
        <FormError message={error} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmation">Password again</Label>
          <Input
            id="confirmation"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-tertiary-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <SocialSignIn next="/chat" />
    </div>
  );
}
