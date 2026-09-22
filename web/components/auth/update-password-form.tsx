'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

import { FormError } from './form-error';

export function UpdatePasswordForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsPending(false);
      return;
    }

    window.location.assign('/chat');
  }

  return (
    <form onSubmit={updatePassword} className="flex flex-col gap-4">
      <FormError message={error} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save password'}
      </Button>
    </form>
  );
}
