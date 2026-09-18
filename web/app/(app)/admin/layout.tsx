import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ErrorState } from '@/components/app/error-state';
import { SideNav, type NavItem } from '@/components/app/nav';
import { PageHeader } from '@/components/app/page-header';
import { resolveAdminAccess } from '@/lib/analytics/access';

const ADMIN_SECTIONS: readonly NavItem[] = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/searches', label: 'Searches' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/consumption', label: 'Consumption' },
  { href: '/admin/billing', label: 'Billing' },
  { href: '/admin/demo', label: 'Demo' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await resolveAdminAccess();

  if (access.kind === 'signed-out') redirect('/sign-in');

  if (access.kind === 'forbidden') {
    return (
      <>
        <PageHeader title="Admin" />
        <ErrorState
          title="You do not have access to this"
          detail="Admin analytics, members and billing are open to owners and admins. Ask one of them to change your role if you need to see this."
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <aside className="md:w-44 md:shrink-0">
          <SideNav items={ADMIN_SECTIONS} label="Admin sections" />
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
