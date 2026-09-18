import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DreamActivity } from '@/components/dreams/dream-activity';
import { SpaceDreaming } from '@/components/dreams/space-dreaming';
import { parseDreamRunIds } from '@/lib/dreams/activity';
import { loadDreamActivity, loadLastDreamTimes } from '@/lib/dreams/activity-queries';
import { loadDreamSpaces } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

import { startDreamRun } from './actions';

export default async function DreamsPage({
  searchParams,
}: {
  searchParams: Promise<{ runs?: string }>;
}) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const params = await searchParams;
  let runIds: readonly string[] | undefined;
  try {
    runIds = parseDreamRunIds(params.runs);
  } catch {
    return <p role="alert">Choose between 1 and 100 valid run IDs.</p>;
  }
  if (runIds) {
    const activity = await loadDreamActivity(context, runIds);
    return (
      <>
        <DreamActivity key={runIds.join(',')} initial={activity} isBatch />
        <Link href="/dreams" className="text-sm text-brand-link hover:underline">
          All Dream activity
        </Link>
      </>
    );
  }
  const [spaces, activity] = await Promise.all([
    loadDreamSpaces(context),
    loadDreamActivity(context),
  ]);
  const lastDreamTimes = await loadLastDreamTimes(
    context,
    spaces.map((space) => space.id),
  );

  return (
    <>
      <SpaceDreaming
        spaces={spaces}
        initial={activity}
        onRun={startDreamRun}
        nextDreamLabel="1:55am UTC"
        lastDreamTimes={lastDreamTimes}
      />
    </>
  );
}
