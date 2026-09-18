import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { NightlyDream } from '@/lib/dreams/nightly';
import type { StatusTone } from '@/lib/ui/status-tone';
import { cn } from '@/lib/utils';

const TONE_TEXT: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  positive: 'text-muted-foreground',
  progress: 'text-muted-foreground',
  warning: 'text-warning-600',
  destructive: 'text-destructive-600',
};

/** The three passes as links, so a night's own pages stay one click away. */
function PassLinks({ night }: { night: NightlyDream }) {
  return (
    <span className="flex flex-wrap gap-x-2">
      {night.runs.map((run) => (
        <Link
          key={run.id}
          href={`/dreams/${run.id}`}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {run.kindLabel}
        </Link>
      ))}
    </span>
  );
}

/** One row per space per night: how long it took, what it read, and what it connected. */
export function DreamLog({ nights }: { nights: readonly NightlyDream[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Night</TableHead>
          <TableHead>Space</TableHead>
          <TableHead className="text-right">Time</TableHead>
          <TableHead className="text-right">Documents ingested</TableHead>
          <TableHead className="text-right">Connections made</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Passes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nights.map((night) => (
          <TableRow key={night.id}>
            <TableCell className="whitespace-nowrap text-foreground">{night.nightLabel}</TableCell>
            <TableCell className="text-foreground">{night.spaceName}</TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
              {night.durationLabel}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
              {night.documentsIngested.toLocaleString('en-US')}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
              {night.connectionsMade.toLocaleString('en-US')}
            </TableCell>
            <TableCell>
              <span className={cn('text-xs font-medium', TONE_TEXT[night.status.tone])}>
                {night.status.label}
              </span>
              {night.status.detail ? (
                <p className="max-w-[var(--measure-prose)] text-xs text-muted-foreground">
                  {night.status.detail}
                </p>
              ) : null}
            </TableCell>
            <TableCell>
              <PassLinks night={night} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
