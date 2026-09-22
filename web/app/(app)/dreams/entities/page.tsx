import { redirect } from 'next/navigation';

import { EntityGraphLive } from '@/components/dreams/entity-graph-live';
import { isDreamActive } from '@/lib/dreams/activity';
import { loadDreamActivity } from '@/lib/dreams/activity-queries';
import { loadEntities } from '@/lib/dreams/queries';
import { loadLatestDreamTime } from '@/lib/dreams/activity-queries';
import { loadDreamSpaces } from '@/lib/dreams/queries';
import { loadSpaceMetadata } from '@/lib/spaces/metadata';
import { getSessionContext } from '@/lib/supabase/context';

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string }>;
}) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const { space } = await searchParams;
  const [{ groups }, activity, spaces] = await Promise.all([
    loadEntities(context, space),
    loadDreamActivity(context),
    loadDreamSpaces(context),
  ]);
  const scopedSpaces = spaces.filter((item) => !space || item.id === space);
  const [lastDream, metadata] = await Promise.all([
    loadLatestDreamTime(context, space),
    loadSpaceMetadata(
      context.supabase,
      scopedSpaces.map((item) => item.id),
    ),
  ]);
  const lastDreamLabel = lastDream
    ? `${new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      })
        .format(new Date(lastDream))
        .replace(' AM', 'am')
        .replace(' PM', 'pm')} UTC`
    : 'Never';

  return (
    <>
      <p className="text-xs text-muted-foreground tabular-nums">
        {metadata.documentCount} documents
        <span aria-hidden="true"> · </span>
        {metadata.memberCount} members
        <span aria-hidden="true"> · </span>
        Last dream: {lastDreamLabel}
      </p>
      <EntityGraphLive groups={groups} active={activity.runs.some(isDreamActive)} spaceId={space} />
    </>
  );
}
