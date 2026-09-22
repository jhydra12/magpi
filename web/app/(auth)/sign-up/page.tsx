import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata = { title: 'Create a Digital Brain account' };

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create an account"
      description="You get a workspace and a personal space."
      footer={
        <>
          Already have one?{' '}
          <Link href="/sign-in" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
