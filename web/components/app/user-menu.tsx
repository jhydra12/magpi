'use client';

import { ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { CurrentUserAvatar } from '@/components/current-user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';

export function UserMenu({
  email,
  canAdminister,
}: {
  email: string | null;
  canAdminister: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Your account"
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left ring-offset-background transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
      >
        <CurrentUserAvatar />
        {email ? (
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{email}</span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        <ChevronsUpDown className="size-3.5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>

        {canAdminister ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">Admin</Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
