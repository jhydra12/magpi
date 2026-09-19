'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/actions/state';
import {
  isDreamActive,
  type DreamActivityRun,
  type DreamActivitySnapshot,
} from '@/lib/dreams/activity';
import type { DreamRunOutcome } from '@/lib/dreams/edge';
import type { DreamKind } from '@/lib/dreams/status';
import { summarizeSpaceDream } from '@/lib/dreams/space-progress';

import { SpaceDreamProgress } from './space-dream-progress';
import { useDreamActivity } from './use-dream-activity';

export type DreamingSpace = {
  readonly id: string;
  readonly name: string;
  readonly dreaming_enabled: boolean;
};

type RunDream = (spaceId: string, kind: DreamKind | 'all') => Promise<ActionState<DreamRunOutcome>>;

function SpaceRow({
  space,
  runs,
  observedAt,
  onRun,
  onQueued,
  nextDreamLabel,
  lastDreamAt,
  isGloballyQueued,
  isGlobalPending,
}: {
  space: DreamingSpace;
  runs: readonly DreamActivityRun[];
  observedAt: string;
  onRun: RunDream;
  onQueued: () => void;
  nextDreamLabel: string;
  lastDreamAt: string | null;
  isGloballyQueued: boolean;
  isGlobalPending: boolean;
}) {
  const progress = summarizeSpaceDream(runs);
  const run = progress?.run;
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submittedRunId, setSubmittedRunId] = useState<string | null>(null);
  const isActive = run ? isDreamActive(run) : false;
  const [initialFinishedRunId] = useState(() => (isActive ? null : run?.id));
  const [expiredRunId, setExpiredRunId] = useState<string | null>(null);
  const runId = run?.id;
  const finishedAt = run?.finished_at;
  const showProgress = isActive || (runId !== initialFinishedRunId && runId !== expiredRunId);
  const isAwaitingRun = submittedRunId !== null && submittedRunId !== run?.id;
  const isStarting = isPending || isAwaitingRun;
  const showQueuedPlaceholder = isGloballyQueued && !run;
  const lastFinishedAt = [lastDreamAt, finishedAt]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const lastDreamLabel = lastFinishedAt
    ? `${new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      })
        .format(new Date(lastFinishedAt))
        .replace(' AM', 'am')
        .replace(' PM', 'pm')} UTC`
    : 'Never';

  useEffect(() => {
    if (!runId || isActive || !showProgress) return;
    const elapsed = finishedAt ? Math.max(0, Date.parse(observedAt) - Date.parse(finishedAt)) : 0;
    const timer = setTimeout(() => setExpiredRunId(runId), Math.max(0, 300_000 - elapsed));
    return () => clearTimeout(timer);
  }, [runId, finishedAt, isActive, showProgress, observedAt]);

  const startDreaming = () => {
    setFailure(null);
    setSubmittedRunId(null);
    startTransition(async () => {
      const result = await onRun(space.id, 'all');
      if (result.status === 'error') setFailure(result.message);
      else if (result.status === 'success') {
        setSubmittedRunId(result.data.dreamRunId);
        onQueued();
      }
    });
  };

  return (
    <div role="group" aria-label={space.name} className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-5">
        <span className="w-28 shrink-0 text-sm text-foreground">{space.name}</span>
        {isStarting || showQueuedPlaceholder ? (
          <div className="flex min-w-40 flex-1 flex-col gap-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span role="status">{isPending ? 'Starting' : 'Queued'}</span>
              <span className="font-mono tabular-nums">00:00</span>
            </div>
            <div
              role="progressbar"
              aria-label={`${space.name} dreaming progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={0}
              aria-valuetext={isPending ? 'Starting' : 'Queued'}
              className="relative h-1.5 overflow-hidden rounded-full bg-muted"
            ></div>
          </div>
        ) : run && showProgress ? (
          <SpaceDreamProgress
            spaceName={space.name}
            run={run}
            observedAt={observedAt}
            tasks={progress}
          />
        ) : (
          <div className="min-w-40 flex-1 text-center text-xs text-muted-foreground">
            {space.dreaming_enabled ? (
              <>
                <span title={lastFinishedAt ? new Date(lastFinishedAt).toUTCString() : undefined}>
                  Last dream: {lastDreamLabel}
                </span>
                <span aria-hidden="true"> · </span>
                <span>Next dream: {nextDreamLabel}</span>
              </>
            ) : null}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!space.dreaming_enabled || isStarting || isActive || isGlobalPending}
          onClick={startDreaming}
        >
          Start dreaming
        </Button>
      </div>
      {!space.dreaming_enabled ? (
        <p className="text-xs text-tertiary-foreground">Dreaming is off in this space</p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-xs text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/** Shows active Dreams and keeps their results briefly until refresh or dismissal. */
export function SpaceDreaming({
  spaces,
  initial,
  onRun,
  nextDreamLabel,
  lastDreamTimes = {},
}: {
  spaces: readonly DreamingSpace[];
  initial: DreamActivitySnapshot;
  onRun: RunDream;
  nextDreamLabel: string;
  lastDreamTimes?: Readonly<Record<string, string | null>>;
}) {
  const router = useRouter();
  const { snapshot, failure } = useDreamActivity(initial, () => router.refresh());
  const [globallyQueued, setGloballyQueued] = useState<ReadonlySet<string>>(() => new Set());
  const [globalFailure, setGlobalFailure] = useState<string | null>(null);
  const headerTarget =
    typeof document === 'undefined' ? null : document.getElementById('dreams-header-action');
  const recent = [...snapshot.runs].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const startAllDreams = () => {
    const enabledSpaces = spaces.filter((space) => space.dreaming_enabled);
    setGlobalFailure(null);
    setGloballyQueued(new Set(enabledSpaces.map((space) => space.id)));
    const submit = (space: DreamingSpace) => {
      void onRun(space.id, 'all')
        .catch((error: unknown) => ({
          status: 'error' as const,
          message: error instanceof Error ? error.message : 'That Dream could not be started.',
        }))
        .then((result) => {
          if (result.status !== 'error') return;
          setGlobalFailure(result.message);
          setGloballyQueued((current) => {
            const next = new Set(current);
            next.delete(space.id);
            return next;
          });
        });
    };
    enabledSpaces.slice(0, 4).forEach(submit);
    enabledSpaces.slice(4).forEach((space, index) => {
      window.setTimeout(() => submit(space), Math.floor(index / 4) * 100);
    });
    router.refresh();
  };
  const globalButton = (
    <Button
      variant="default"
      aria-label="Start dreaming in all spaces"
      disabled={spaces.every((space) => !space.dreaming_enabled)}
      onClick={startAllDreams}
    >
      Start dreaming
    </Button>
  );
  return (
    <section className="flex flex-col gap-3">
      {headerTarget ? createPortal(globalButton, headerTarget) : globalButton}
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-sm font-medium text-foreground">
          Spaces in your organization
        </h2>
      </div>
      <div className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
        {spaces.map((space) => {
          const runs = recent.filter((run) => run.space_id === space.id);
          return (
            <SpaceRow
              key={space.id}
              space={space}
              runs={runs}
              observedAt={snapshot.observedAt}
              onRun={onRun}
              onQueued={() => router.refresh()}
              nextDreamLabel={nextDreamLabel}
              lastDreamAt={lastDreamTimes[space.id] ?? null}
              isGloballyQueued={globallyQueued.has(space.id)}
              isGlobalPending={false}
            />
          );
        })}
      </div>
      {failure ? (
        <p role="alert" className="text-xs text-destructive-600">
          {failure}
        </p>
      ) : null}
      {globalFailure ? (
        <p role="alert" className="text-xs text-destructive-600">
          {globalFailure}
        </p>
      ) : null}
    </section>
  );
}
