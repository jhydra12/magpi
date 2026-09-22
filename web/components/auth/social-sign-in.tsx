'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { safeNextPath } from '@/lib/safe-next-path';
import { createClient } from '@/lib/supabase/client';

import { FormError } from './form-error';

export function SocialSignIn({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function signInWithGitHub() {
    setIsPending(true);
    setError(null);

    const supabase = createClient();
    const target = safeNextPath(next, '/chat');
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/oauth?next=${encodeURIComponent(target)}`,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <Button variant="outline" className="w-full" disabled={isPending} onClick={signInWithGitHub}>
        {isPending ? 'Redirecting…' : 'Continue with GitHub'}
      </Button>
    </div>
  );
}
