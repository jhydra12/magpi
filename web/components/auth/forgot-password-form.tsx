'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

import { FormError } from './form-error';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function requestReset(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
    });

    if (resetError) {
      setError(resetError.message);
      setIsPending(false);
      return;
    }

    setIsSent(true);
    setIsPending(false);
  }

  if (isSent) {
    return (
      <p className="text-sm text-muted-foreground">
        Check {email} for a link to set a new password.
      </p>
    );
  }

  return (
    <form onSubmit={requestReset} className="flex flex-col gap-4">
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
