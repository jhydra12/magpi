import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppFrame } from '@/components/app/app-sidebar';
import { CrumbTitleProvider } from '@/components/app/crumb-title';
import { getSessionContext } from '@/lib/supabase/context';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const canAdminister = context.role === 'owner' || context.role === 'admin';

  return (
    <CrumbTitleProvider>
      <AppFrame email={context.email} canAdminister={canAdminister}>
        {children}
      </AppFrame>
    </CrumbTitleProvider>
  );
}
