import type { ReactNode } from 'react';

import { SideNav, type NavItem } from '@/components/app/nav';
import { PageHeader } from '@/components/app/page-header';

const SETTINGS_SECTIONS: readonly NavItem[] = [
  { href: '/settings', label: 'Profile' },
  { href: '/settings/embeddings', label: 'Embeddings' },
  { href: '/settings/mcp', label: 'MCP and API' },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Your account, and how agents reach your work." />

      <SideNav items={SETTINGS_SECTIONS} label="Settings sections" orientation="horizontal" />

      {children}
    </>
  );
}
