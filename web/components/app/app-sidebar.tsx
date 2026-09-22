'use client';

import { Cable, FileText, Layers, Menu, Moon, SquarePen, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';

import { MagpieMark } from '@/components/brand/magpie-mark';
import { ChatHistoryNav } from '@/components/chat/chat-history-nav';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { cn } from '@/lib/utils';

import { Nav, type NavItem } from './nav';
import { UserMenu } from './user-menu';

type SidebarIcon = ComponentType<{ className?: string }>;

type SidebarItem = NavItem & { readonly icon: SidebarIcon };

const PRIMARY: readonly SidebarItem[] = [
  { href: '/chat', label: 'New chat', icon: SquarePen },
  { href: '/connections', label: 'Connections', icon: Cable },
  { href: '/dreams', label: 'Dreams', icon: Moon },
];

const LIBRARY: readonly SidebarItem[] = [
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/spaces', label: 'Spaces', icon: Layers },
];

export function AppFrame({
  email,
  canAdminister,
  children,
}: {
  email: string | null;
  canAdminister: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <aside className="hidden h-full w-[var(--measure-sidebar)] shrink-0 flex-col border-r border-border bg-background md:flex">
        <SidebarBody email={email} canAdminister={canAdminister} />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
        <MobileChrome email={email} canAdminister={canAdminister} />
        <AppContent>{children}</AppContent>
      </div>
    </div>
  );
}

function SidebarBody({ email, canAdminister }: { email: string | null; canAdminister: boolean }) {
  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-2.5">
        <Link
          href="/chat"
          className="flex min-w-0 items-center gap-2.5 font-heading text-[15px] tracking-tight text-foreground"
        >
          <MagpieMark size={22} />
          Magpi
        </Link>
        <div className="shrink-0">
          <ThemeToggle />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-2 pb-2">
        <div className="flex shrink-0 flex-col gap-4">
          <Nav items={PRIMARY} orientation="vertical" />
          <div className="flex flex-col gap-1">
            <p className="px-2.5 text-xs text-tertiary-foreground" aria-hidden="true">
              Library
            </p>
            <Nav items={LIBRARY} orientation="vertical" label="Library" />
          </div>
        </div>
        <ChatHistoryNav />
      </div>

      <div className="mt-auto w-full shrink-0 p-2">
        <UserMenu email={email} canAdminister={canAdminister} />
      </div>
    </>
  );
}

function MobileChrome({ email, canAdminister }: { email: string | null; canAdminister: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openPath, setOpenPath] = useState(pathname);
  if (pathname !== openPath) {
    setOpenPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 md:hidden">
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-lg p-1.5 text-tertiary-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      <Link
        href="/chat"
        className="flex items-center gap-2.5 font-heading text-[15px] tracking-tight text-foreground"
      >
        <MagpieMark size={22} />
        Magpi
      </Link>

      {open ? (
        <div className="fixed inset-0 z-[var(--z-overlay)] md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/20"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[var(--measure-sidebar)] flex-col border-r border-border bg-background">
            <SidebarBody email={email} canAdminister={canAdminister} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function AppContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname.startsWith('/chat');

  return (
    <main className="flex min-h-0 flex-1 [scrollbar-gutter:stable] flex-col overflow-y-auto">
      <div
        className={cn(
          'mx-auto flex w-full max-w-[var(--measure-shell)] flex-1 flex-col px-6 sm:px-8',
          isChat ? 'min-h-0 overflow-hidden' : 'gap-6 py-7',
        )}
      >
        {children}
      </div>
    </main>
  );
}
