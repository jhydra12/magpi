import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { DreamActivity } from '@/components/dreams/dream-activity';
import { DreamOutput } from '@/components/dreams/dream-output';
import { LinkCandidates } from '@/components/dreams/link-candidates';
import { RunFailure } from '@/components/dreams/run-failure';
import { RunStatus } from '@/components/dreams/run-status';
import { loadDreamActivity } from '@/lib/dreams/activity-queries';
import { loadDreamRun } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

import { confirmDreamLink, deleteDreamOutput, dismissDreamLink } from '../actions';

export default async function DreamRunPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const { id } = await params;
  const detail = await loadDreamRun(context, id);
  if (!detail) notFound();

  const { run, output, candidates } = detail;
  const activity = await loadDreamActivity(context, [id]);

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-base font-medium text-foreground">{run.kindLabel}</h2>
          <span className="text-sm text-muted-foreground">{run.spaceName}</span>
          <RunStatus status={run.status} />
          <Link href="/dreams" className="text-sm text-tertiary-foreground hover:text-foreground">
            All runs
          </Link>
        </div>

        <p className="text-xs text-tertiary-foreground">
          {run.inputSummary} read &middot; {run.duration}
        </p>
      </section>

      {activity.runs.some((run) => run.status === 'queued' || run.status === 'running') ? (
        <DreamActivity initial={activity} isBatch />
      ) : null}

      <RunFailure status={run.status} inputDocumentCount={run.inputDocumentCount} />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-medium text-foreground">What it wrote</h2>
        <DreamOutput output={output} onDelete={deleteDreamOutput} />
      </section>

      {run.kind === 'connections' ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-sm font-medium text-foreground">Candidate pairs</h2>
          <p className="max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
            Nothing here is applied until a person confirms it.
          </p>
          <LinkCandidates
            candidates={candidates}
            onConfirm={confirmDreamLink}
            onDismiss={dismissDreamLink}
          />
        </section>
      ) : null}
    </>
  );
}
