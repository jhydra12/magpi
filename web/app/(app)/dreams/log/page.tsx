import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { DreamLog } from '@/components/dreams/dream-log';
import { loadDreamsPage } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

export default async function DreamLogPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');
  const { nights } = await loadDreamsPage(context);

  return nights.length === 0 ? <EmptyState title="No dreams yet" /> : <DreamLog nights={nights} />;
}
