import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

const NUMBER = 'text-right whitespace-nowrap text-muted-foreground tabular-nums';

/** Short enough to sit three to a line; the run page carries the full name. */
const PASS_LABEL: Record<NightlyDream['runs'][number]['kind'], string> = {
  entities: 'Entities',
  digest: 'Digest',
  connections: 'Links',
};

/** The three passes as links under the night, so a night's own pages stay one click away. */
function PassLinks({ night }: { night: NightlyDream }) {
  return (
    <span className="mt-0.5 flex gap-x-2 whitespace-nowrap">
      {night.runs.map((run) => (
        <Link
          key={run.id}
          href={`/dreams/${run.id}`}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {PASS_LABEL[run.kind]}
        </Link>
      ))}
    </span>
  );
}

function connectionsText(night: NightlyDream): string {
  if (night.connectionsFound === 0) return '0';
  return `${night.connectionsFound} found, ${night.connectionsConfirmed} confirmed`;
}

/** One row per space per night: who started it, how long it took, what it read, spent, and wrote. */
export function DreamLog({ nights }: { nights: readonly NightlyDream[] }) {
  const showsTokens = nights.some((night) => night.modelTokens !== null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Night</TableHead>
          <TableHead>Space</TableHead>
          <TableHead className="whitespace-nowrap">Started by</TableHead>
          <TableHead className="text-right">Time</TableHead>
          <TableHead className="text-right">Documents ingested</TableHead>
          <TableHead className="text-right">Connections made</TableHead>
          {showsTokens ? <TableHead className="text-right">Model tokens</TableHead> : null}
          <TableHead>Digest</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nights.map((night) => (
          <TableRow key={night.id}>
            <TableCell className="whitespace-nowrap text-foreground">
              {night.nightLabel}
              <PassLinks night={night} />
            </TableCell>
            <TableCell className="text-foreground">{night.spaceName}</TableCell>
            <TableCell className="text-muted-foreground">{night.startedBy}</TableCell>
            <TableCell className={NUMBER}>{night.durationLabel}</TableCell>
            <TableCell className={NUMBER}>
              {night.documentsIngested.toLocaleString('en-US')}
            </TableCell>
            <TableCell className={NUMBER}>{connectionsText(night)}</TableCell>
            {showsTokens ? (
              <TableCell className={NUMBER}>
                {night.modelTokens === null ? '' : formatTokens(night.modelTokens)}
              </TableCell>
            ) : null}
            <TableCell>
              {night.output ? (
                <Link
                  href={`/documents/${night.output.id}`}
                  className="text-sm whitespace-nowrap text-foreground hover:underline"
                >
                  Open
                </Link>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </TableCell>
            <TableCell>
              <span className={cn('text-xs font-medium', TONE_TEXT[night.status.tone])}>
                {night.status.label}
              </span>
              {night.status.detail ? (
                <p className="min-w-[10rem] text-xs text-muted-foreground">{night.status.detail}</p>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
