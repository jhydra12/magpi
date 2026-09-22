import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { DemoSignIn } from '@/components/auth/demo-sign-in';
import { SignInForm } from '@/components/auth/sign-in-form';
import { safeNextPath } from '@/lib/safe-next-path';

export const metadata = { title: 'Sign in to Digital Brain' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Off unless a deployment turns it on. NODE_ENV would be wrong here: a preview build runs in
  // production mode, so the button would appear on every preview and never locally.
  const isDemo = process.env.SB_DEMO_LOGIN === 'true';

  return (
    <AuthShell
      title="Sign in"
      description="Ask your team's knowledge base a question."
      footer={
        <>
          No account yet?{' '}
          <Link href="/sign-up" className="text-foreground underline underline-offset-4">
            Create one
          </Link>
        </>
      }
    >
      <SignInForm next={safeNextPath(next, '/chat', 'http://placeholder.invalid')} />
      {isDemo ? (
        <DemoSignIn next={safeNextPath(next, '/chat', 'http://placeholder.invalid')} />
      ) : null}
    </AuthShell>
  );
}
