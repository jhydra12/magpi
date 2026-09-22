import Link from 'next/link';
import type { ReactNode } from 'react';

import { ShellRow } from '@/components/app/shell-row';
import { MagpieMark } from '@/components/brand/magpie-mark';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border">
        <ShellRow className="flex h-14 items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-heading text-base tracking-tight text-foreground"
          >
            <MagpieMark />
            Digital Brain
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/pricing"
              className="text-sm text-tertiary-foreground hover:text-foreground"
            >
              Pricing
            </Link>
            <Button asChild size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </ShellRow>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="border-t border-border">
        <ShellRow className="flex items-center justify-between gap-4 py-4 text-xs text-tertiary-foreground">
          <Link
            href="https://github.com/supabase/select-2026-demo"
            className="transition-colors hover:text-foreground motion-reduce:transition-none"
          >
            Source
          </Link>
          <ThemeToggle />
        </ShellRow>
      </footer>
    </div>
  );
}
