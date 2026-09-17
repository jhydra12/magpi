import Link from 'next/link';

import type { DreamRunSummary } from '@/lib/dreams/view-model';

import { RunStatus } from './run-status';

/** One row per run: what ran, where, over how many documents, and what came out. */
export function DreamRunList({ runs }: { runs: readonly DreamRunSummary[] }) {
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
      {runs.map((run) => {
        const isOrdinary = run.status.status === 'succeeded';

        return (
          <li key={run.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
            <Link
              href={`/dreams/${run.id}`}
              className="text-sm font-medium text-foreground hover:underline"
            >
              {run.kindLabel}
            </Link>
            <span className="text-sm text-muted-foreground">{run.spaceName}</span>
            <RunStatus status={run.status} />

            <span className="ml-auto text-xs text-tertiary-foreground">
              {run.inputSummary} read &middot; {run.duration} &middot;{' '}
              {run.outputDocumentId ? 'Wrote one document' : 'No output document'}
            </span>

            {isOrdinary ? null : (
              <p className="w-full max-w-[var(--measure-prose)] text-sm text-muted-foreground">
                {run.status.detail}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
