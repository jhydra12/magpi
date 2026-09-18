import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { DreamLog } from '@/components/dreams/dream-log';
import { SpaceDreaming } from '@/components/dreams/space-dreaming';
import { loadDreamsPage } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

import { setSpaceDreaming, startDreamRun } from './actions';

export default async function DreamsPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const { nights, spaces } = await loadDreamsPage(context);

  return (
    <>
      <SpaceDreaming spaces={spaces} onToggle={setSpaceDreaming} onRun={startDreamRun} />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-medium text-foreground">Dream log</h2>
        {nights.length === 0 ? (
          <EmptyState
            title="No dreams yet"
            description="Dreaming runs overnight. Start one now with the button above."
          />
        ) : (
          <DreamLog nights={nights} />
        )}
      </section>
    </>
  );
}
