import type { ReactNode } from 'react';

import { PageHeader } from '@/components/app/page-header';
import { DreamTabs } from '@/components/dreams/dream-tabs';

/** Keeps the Dreams heading and navigation above each section. */
export default function DreamsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Dreams" />
      <DreamTabs />
      {children}
    </>
  );
}
