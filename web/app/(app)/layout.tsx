import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Breadcrumbs } from '@/components/app/breadcrumbs';
import { CrumbTitleProvider } from '@/components/app/crumb-title';
import { Nav, type NavItem } from '@/components/app/nav';
import { ShellRow } from '@/components/app/shell-row';
import { UserMenu } from '@/components/app/user-menu';
import { MagpieMark } from '@/components/brand/magpie-mark';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { getSessionContext } from '@/lib/supabase/context';

const SECTIONS: readonly NavItem[] = [
  { href: '/chat', label: 'Chat' },
  { href: '/connections', label: 'Connections' },
  { href: '/dreams', label: 'Dreams' },
];

/**
 * Off. With one nav and shallow routes the trail only ever repeats the heading below it. The
 * component and its tests are left wired up, so turning this back on is the whole change.
 */
const SHOW_BREADCRUMBS = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const canAdminister = context.role === 'owner' || context.role === 'admin';

  return (
    <CrumbTitleProvider>
      <div className="flex min-h-svh flex-col">
        <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-background">
          <ShellRow className="flex h-14 items-center gap-6">
            <Link
              href="/chat"
              className="flex shrink-0 items-center gap-2 font-heading text-base tracking-tight text-foreground"
            >
              <MagpieMark />
              Magpi
            </Link>

            <div className="min-w-0 flex-1 overflow-x-auto">
              <Nav items={SECTIONS} />
            </div>

            <UserMenu email={context.email} canAdminister={canAdminister} />
          </ShellRow>

          {SHOW_BREADCRUMBS ? (
            <div className="border-t border-border">
              <ShellRow>
                <Breadcrumbs />
              </ShellRow>
            </div>
          ) : null}
        </header>

        <main className="flex-1">
          <ShellRow className="flex flex-col gap-6 py-6">{children}</ShellRow>
        </main>

        <footer className="border-t border-border">
          <ShellRow className="flex items-center justify-between gap-4 py-4 text-xs text-tertiary-foreground">
            <Link
              href="https://github.com/supabase-community/magpi"
              className="transition-colors hover:text-foreground motion-reduce:transition-none"
            >
              Source
            </Link>
            <ThemeToggle />
          </ShellRow>
        </footer>
      </div>
    </CrumbTitleProvider>
  );
}
