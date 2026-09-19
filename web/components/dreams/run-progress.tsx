import type { DreamActivityRun } from '@/lib/dreams/activity';
import { describeDreamStatus, formatRunDuration } from '@/lib/dreams/status';

/** Display persisted status and elapsed execution time, without estimating percent complete. */
export function RunProgress({ run, observedAt }: { run: DreamActivityRun; observedAt: string }) {
  const status = describeDreamStatus({
    status: run.status,
    error: run.error,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
  });
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-tertiary-foreground">
      <span>{run.status === 'succeeded' ? 'Completed' : status.label}</span>
      <span className="font-mono tabular-nums">
        {formatRunDuration(run.started_at, run.finished_at ?? observedAt)}
      </span>
      {run.started_at ? <span>{run.input_document_count} documents read</span> : null}
      {run.status === 'failed' || run.status === 'timeout' ? (
        <span role="alert" className="text-destructive-600">
          {status.detail}
        </span>
      ) : null}
    </div>
  );
}
