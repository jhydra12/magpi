'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { isDreamActive, type DreamActivityRun } from '@/lib/dreams/activity';
import { describeDreamStatus } from '@/lib/dreams/status';

import type { summarizeSpaceDream } from '@/lib/dreams/space-progress';

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
  const label = tasks && tasks.total > 1 ? tasks.label : isComplete ? 'Completed' : status.label;
  const percent = isComplete ? 100 : tasks ? Math.floor((tasks.completed / tasks.total) * 100) : 0;

  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span role="status">{label}</span>
        <div className="flex items-center gap-3">
          {isComplete && run.output_document_id ? (
            <Link href={`/dreams/${run.id}`} className="text-brand-link hover:underline">
              Open output
            </Link>
          ) : null}
          <span aria-label={`${spaceName} elapsed time`} className="font-mono tabular-nums">
            {duration}
          </span>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={`${spaceName} dreaming progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={label}
        className="relative h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full bg-brand-600 transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      {hasFailed ? (
        <p role="alert" className="text-xs text-destructive-600">
          {status.detail}
        </p>
      ) : null}
    </div>
  );
}
