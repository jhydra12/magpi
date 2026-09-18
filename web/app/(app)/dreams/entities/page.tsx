import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/app/empty-state';
import { EntityGroups } from '@/components/dreams/entity-groups';
import { EntityGraph } from '@/components/dreams/entity-graph';
import { EntityGraphLive } from '@/components/dreams/entity-graph-live';
import { isDreamActive } from '@/lib/dreams/activity';
import { loadDreamActivity } from '@/lib/dreams/activity-queries';
import { loadEntities } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string }>;
}) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const { space } = await searchParams;
  const [{ groups }, activity] = await Promise.all([
    loadEntities(context, space),
    loadDreamActivity(context),
  ]);

  return (
    <>
      {groups.length === 0 ? (
        <EmptyState title="No entities yet" />
      ) : (
        <>
          <EntityGraphLive active={activity.runs.some(isDreamActive)}>
            <EntityGraph groups={groups} />
          </EntityGraphLive>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-4 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
              <span className="transition-transform group-open:rotate-90">›</span>
              Detail
            </summary>
            <EntityGroups groups={groups} />
          </details>
        </>
      )}
    </>
  );
}
