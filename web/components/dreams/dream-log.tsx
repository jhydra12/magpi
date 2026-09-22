import Link from 'next/link';

import { formatTokens, type NightlyDream } from '@/lib/dreams/nightly';
import type { StatusTone } from '@/lib/ui/status-tone';
import { cn } from '@/lib/utils';

const TONE_TEXT: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  positive: 'text-muted-foreground',
  progress: 'text-muted-foreground',
  warning: 'text-warning-600',
  destructive: 'text-destructive-600',
};

/** Short enough to sit on one line; the run page carries the full name. */
const PASS_LABEL: Record<NightlyDream['runs'][number]['kind'], string> = {
  entities: 'Entities',
  digest: 'Digest',
  connections: 'Links',
};

function PassLinks({ night }: { night: NightlyDream }) {
  const seen = new Set<NightlyDream['runs'][number]['kind']>();
  const passes = night.runs.filter((run) => {
    if (seen.has(run.kind)) return false;
    seen.add(run.kind);
    return true;
  });

  return (
    <span className="flex gap-x-3">
      {passes.map((run) => (
        <Link key={run.id} href={`/dreams/${run.id}`} className="text-brand-link hover:underline">
          {PASS_LABEL[run.kind]}
        </Link>
      ))}
    </span>
  );
}

function connectionsText(night: NightlyDream): string {
  if (night.connectionsFound === 0) return '0 connections';
  return `${night.connectionsFound} found, ${night.connectionsConfirmed} confirmed`;
}

/** One night per row. The space is the title; the figures sit underneath. */
export function DreamLog({ nights }: { nights: readonly NightlyDream[] }) {
  return (
    <ul className="divide-y divide-border">
      {nights.map((night) => (
        <li
          key={night.id}
          aria-label={`${night.spaceName}, ${night.nightLabel}`}
          className="flex items-start justify-between gap-6 py-3.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{night.spaceName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {night.nightLabel}
              <span aria-hidden="true"> · </span>
              Started by {night.startedBy}
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">{night.durationLabel}</span>
            </p>
            <p className="mt-1 text-xs text-tertiary-foreground">
              <span className="tabular-nums">
                {night.documentsIngested.toLocaleString('en-US')}
              </span>{' '}
              documents ingested
              <span aria-hidden="true"> · </span>
              {connectionsText(night)}
              {night.modelTokens !== null && night.modelTokens > 0 ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">{formatTokens(night.modelTokens)}</span> model
                  tokens
                </>
              ) : null}
            </p>
            <div className="mt-1.5 flex items-center gap-x-3 text-xs">
              <PassLinks night={night} />
              {night.output ? (
                <Link
                  href={`/documents/${night.output.id}`}
                  className="text-brand-link hover:underline"
                >
                  Open
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1 text-right">
            <span className={cn('text-xs font-medium', TONE_TEXT[night.status.tone])}>
              {night.status.label}
            </span>
            {night.status.detail ? (
              <p className="max-w-64 text-xs text-muted-foreground">{night.status.detail}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
