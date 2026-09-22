'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon?: LucideIcon;
};

const covers = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

/** The longest match wins, so /admin does not stay lit on /admin/members. */
function currentHref(pathname: string, items: readonly NavItem[]): string | null {
  const matches = items.filter((item) => covers(pathname, item.href));
  if (matches.length === 0) return null;

  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).href;
}

export const SIDEBAR_LINK =
  'flex items-center gap-2.5 rounded-lg px-2.5 py-1 text-sm transition-colors motion-reduce:transition-none';
export const SIDEBAR_LINK_ACTIVE = 'bg-muted font-medium text-foreground';
export const SIDEBAR_LINK_IDLE = 'text-muted-foreground hover:bg-muted hover:text-foreground';

function NavLinks({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  const current = currentHref(pathname, items);

  return items.map((item) => {
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={item.href === current ? 'page' : undefined}
        className={cn(
          SIDEBAR_LINK,
          item.href === current ? SIDEBAR_LINK_ACTIVE : SIDEBAR_LINK_IDLE,
        )}
      >
        {Icon ? <Icon className="size-4 shrink-0" /> : null}
        {item.label}
      </Link>
    );
  });
}

/** The section links in the header. They sit outside every asynchronous content state below. */
export function Nav({
  items,
  orientation = 'horizontal',
  label = 'Sections',
}: {
  items: readonly NavItem[];
  orientation?: 'horizontal' | 'vertical';
  label?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        orientation === 'vertical' ? 'flex flex-col gap-0.5' : 'flex items-center gap-0.5',
      )}
      aria-label={label}
    >
      <NavLinks items={items} pathname={pathname} />
    </nav>
  );
}

/** The same links stacked, for a section that carries its own sub-navigation. */
export function SideNav({
  items,
  label,
  orientation = 'responsive',
}: {
  items: readonly NavItem[];
  label: string;
  orientation?: 'responsive' | 'horizontal' | 'vertical';
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        orientation === 'horizontal' && 'flex flex-row gap-0.5 overflow-x-auto',
        orientation === 'vertical' && 'flex flex-col gap-0.5',
        orientation === 'responsive' &&
          'flex flex-row gap-0.5 overflow-x-auto md:flex-col md:overflow-visible',
      )}
      aria-label={label}
    >
      <NavLinks items={items} pathname={pathname} />
    </nav>
  );
}
