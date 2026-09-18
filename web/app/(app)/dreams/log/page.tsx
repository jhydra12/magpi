import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { DreamLog } from '@/components/dreams/dream-log';
import { loadDreamsPage } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

export default async function DreamLogPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');
  const { nights } = await loadDreamsPage(context);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-medium text-foreground">Dream log</h2>
      {nights.length === 0 ? <EmptyState title="No dreams yet" /> : <DreamLog nights={nights} />}
    </section>
  );
}
