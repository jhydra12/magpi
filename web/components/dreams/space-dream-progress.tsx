'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { isDreamActive, type DreamActivityRun } from '@/lib/dreams/activity';
import { describeDreamStatus } from '@/lib/dreams/status';

import type { summarizeSpaceDream } from '@/lib/dreams/space-progress';

function formatFinishedAt(value: string): string {
  return `${new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
    .format(new Date(value))
    .replace(' AM', 'am')
    .replace(' PM', 'pm')} UTC`;
}

/** Shows activity while running and a completed bar only after a saved success. */
export function SpaceDreamProgress({
  spaceName,
  run,
  observedAt,
  tasks,
}: {
  spaceName: string;
  run: DreamActivityRun;
  observedAt: string;
  tasks?: ReturnType<typeof summarizeSpaceDream>;
}) {
  const isActive = isDreamActive(run);
  const [clock, setClock] = useState({ observedAt, now: Date.parse(observedAt) });
  const now = clock.observedAt === observedAt ? clock.now : Date.parse(observedAt);
  useEffect(() => {
    if (!isActive) return;
    const receivedAt = Date.now();
    const timer = setInterval(() => {
      setClock({ observedAt, now: Date.parse(observedAt) + Date.now() - receivedAt });
    }, 1000);
    return () => clearInterval(timer);
  }, [isActive, observedAt]);

  const elapsed = run.started_at
    ? Math.max(
        0,
        Math.floor(
          ((run.finished_at ? Date.parse(run.finished_at) : now) - Date.parse(run.started_at)) /
            1000,
        ),
      )
    : 0;
  const hours = Math.floor(elapsed / 3600);
  const minutes = String(Math.floor(elapsed / 60) % 60).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  const duration = `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${minutes}:${seconds}`;
  const status = describeDreamStatus({
    status: run.status,
    error: run.error,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
  });
  const isComplete = run.status === 'succeeded';
  const hasFailed = run.status === 'failed' || run.status === 'timeout';
  const label =
    tasks && tasks.total > 1
      ? tasks.label
      : isComplete && run.finished_at
        ? `Last dream: ${formatFinishedAt(run.finished_at)}`
        : status.label;
  const percent =
    isComplete || (hasFailed && (!tasks || tasks.total === 1))
      ? 100
      : tasks
        ? Math.floor((tasks.completed / tasks.total) * 100)
        : 0;
  const indeterminate = isActive && percent === 0;
  const outputRunId = tasks?.digestRunId ?? (isComplete && run.output_document_id ? run.id : null);

  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span
          role="status"
          className={
            isActive
              ? 'shimmer shimmer-duration-1400'
              : hasFailed
                ? 'text-destructive-600'
                : isComplete
                  ? 'text-brand-600'
                  : undefined
          }
        >
          {label}
        </span>
        <div className="flex items-center gap-3">
          {outputRunId ? (
            <Link href={`/dreams/${outputRunId}`} className="text-brand-link hover:underline">
              Open output
            </Link>
          ) : null}
          <span aria-label={`${spaceName} elapsed time`} className="font-mono tabular-nums">
            {duration}
          </span>
        </div>
      </div>
      <DreamProgressTrack
        spaceName={spaceName}
        label={label}
        percent={percent}
        indeterminate={indeterminate}
        isFailure={hasFailed}
      />
      {hasFailed ? (
        <p role="alert" className="text-xs text-destructive-600">
          {status.detail}
        </p>
      ) : null}
    </div>
  );
}

/** A thin track. An empty waiting bar still moves, so the row does not look stuck. */
export function DreamProgressTrack({
  spaceName,
  label,
  percent,
  indeterminate = false,
  isFailure = false,
}: {
  spaceName: string;
  label: string;
  percent: number;
  indeterminate?: boolean;
  isFailure?: boolean;
}) {
  return (
    <div
      role="progressbar"
      aria-label={`${spaceName} dreaming progress`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? 0 : percent}
      aria-valuetext={label}
      className="relative h-1.5 overflow-hidden rounded-full bg-muted"
    >
      {indeterminate ? (
        <span className="magpi-indeterminate absolute inset-y-0 left-0 w-1/3 rounded-full bg-brand-600 motion-reduce:inset-0 motion-reduce:w-full motion-reduce:animate-pulse" />
      ) : (
        <span
          className={`block h-full w-full origin-left transition-transform duration-300 ease-out motion-reduce:transition-none ${isFailure ? 'bg-destructive-600' : 'bg-brand-600'}`}
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      )}
    </div>
  );
}
