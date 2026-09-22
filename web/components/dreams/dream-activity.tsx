'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  countDreamActivity,
  measureDreamBatch,
  type DreamActivitySnapshot,
} from '@/lib/dreams/activity';
import { describeDreamKind } from '@/lib/dreams/status';

import { RunProgress } from './run-progress';
import { useDreamActivity } from './use-dream-activity';

/** Queue totals and real outcomes for a fixed set of caller-visible runs. */
export function DreamActivity({
  initial,
  isBatch = false,
}: {
  initial: DreamActivitySnapshot;
  isBatch?: boolean;
}) {
  const router = useRouter();
  const { snapshot, failure } = useDreamActivity(initial, () => router.refresh());
  const totals = countDreamActivity(snapshot.runs);
  const batch = measureDreamBatch(snapshot);
  const elapsedSeconds = batch.elapsedMs === null ? null : Math.floor(batch.elapsedMs / 1000);
  const elapsedLabel =
    elapsedSeconds === null
      ? 'Unavailable'
      : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
  return (
    <section className="flex flex-col gap-3" aria-label="Dream processing">
      <h2 className="font-heading text-sm font-medium text-foreground">
        {isBatch ? 'Dream batch' : 'Recent Dream activity'}
      </h2>
      {isBatch ? (
        <>
          <p className="text-xs text-tertiary-foreground">
            Runs from this batch that you can access.
          </p>
          <dl className="flex flex-wrap gap-6" aria-live="polite">
            {Object.entries(totals).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground capitalize">{label}</dt>
                <dd className="font-heading text-lg font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      {isBatch ? (
        <div className="flex flex-col gap-2">
          <dl className="flex flex-wrap gap-6" aria-label="Batch measurements" aria-live="polite">
            <div>
              <dt className="text-xs text-muted-foreground">Remaining</dt>
              <dd className="font-heading text-lg font-medium tabular-nums">{batch.remaining}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Batch elapsed</dt>
              <dd className="font-heading text-lg font-medium tabular-nums">{elapsedLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Completed in last 30s</dt>
              <dd className="font-heading text-lg font-medium tabular-nums">
                {batch.completedInLast30Seconds}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-tertiary-foreground">
            Measured at {snapshot.observedAt.slice(11, 19)} UTC. Elapsed time includes waiting in
            the queue.
          </p>
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className="text-xs text-destructive-600">
          {failure}
        </p>
      ) : null}
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {snapshot.runs.map((run) => (
          <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="flex flex-col gap-1">
              <Link href={`/dreams/${run.id}`} className="text-sm text-brand-link hover:underline">
                {describeDreamKind(run.kind).label} · {run.id.slice(0, 8)}
              </Link>
              <RunProgress run={run} observedAt={snapshot.observedAt} />
            </div>
            {run.status === 'succeeded' ? (
              <Link href={`/dreams/${run.id}`} className="text-xs text-brand-link hover:underline">
                {run.output_document_id ? 'Open output' : 'Open results'}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {snapshot.runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No visible runs.</p>
      ) : null}
    </section>
  );
}
