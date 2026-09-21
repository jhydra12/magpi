'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/actions/state';
import {
  isDreamActive,
  type DreamActivityRun,
  type DreamActivitySnapshot,
} from '@/lib/dreams/activity';
import type { DreamRunOutcome } from '@/lib/dreams/edge';
import { beginDreamSubmission } from '@/lib/dreams/submission-events';
import { submitDream } from '@/lib/dreams/submit';
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
  onQueued: (outcome: DreamRunOutcome) => void;
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
  const finishedAt = run?.finished_at;
  const isAwaitingRun = submittedRunId !== null && !runs.some((item) => item.id === submittedRunId);
  const isStarting = isPending || isAwaitingRun;
  const showQueuedPlaceholder = isGloballyQueued;
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

  const startDreaming = () => {
    setFailure(null);
    setSubmittedRunId(null);
    startTransition(async () => {
      let result: ActionState<DreamRunOutcome>;
      try {
        result = await onRun(space.id, 'all');
      } catch {
        setFailure('That Dream could not be started.');
        return;
      }
      if (result.status === 'error') setFailure(result.message);
      else if (result.status === 'success') {
        setSubmittedRunId(result.data.dreamRunId);
        onQueued(result.data);
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
        ) : run ? (
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

/** Shows active Dreams and keeps each space's last result, and its output link, until the next run. */
export function SpaceDreaming({
  spaces,
  initial,
  onRun = submitDream,
  nextDreamLabel,
  lastDreamTimes = {},
}: {
  spaces: readonly DreamingSpace[];
  initial: DreamActivitySnapshot;
  onRun?: RunDream;
  nextDreamLabel: string;
  lastDreamTimes?: Readonly<Record<string, string | null>>;
}) {
  const [acceptedBySpace, setAcceptedBySpace] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [acceptedIds, setAcceptedIds] = useState<readonly string[]>([]);
  const [isGlobalPending, setIsGlobalPending] = useState(false);
  const { snapshot, failure } = useDreamActivity(initial, () => {}, acceptedIds);
  const onQueued = (spaceId: string, outcome: DreamRunOutcome) => {
    setAcceptedBySpace((current) => ({ ...current, [spaceId]: outcome.dreamRunIds }));
    setAcceptedIds((current) => [...new Set([...current, ...outcome.dreamRunIds])]);
  };
  const trackedRun: RunDream = async (spaceId, kind) => {
    const finish = beginDreamSubmission();
    try {
      return await onRun(spaceId, kind);
    } finally {
      finish();
    }
  };
  const [globallyQueued, setGloballyQueued] = useState<ReadonlySet<string>>(() => new Set());
  const [globalFailure, setGlobalFailure] = useState<string | null>(null);
  const headerTarget =
    typeof document === 'undefined' ? null : document.getElementById('dreams-header-action');
  const recent = [...snapshot.runs].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const startAllDreams = async () => {
    if (isGlobalPending) return;
    const enabledSpaces = spaces.filter(
      (space) =>
        space.dreaming_enabled &&
        !snapshot.runs.some((run) => run.space_id === space.id && isDreamActive(run)),
    );
    const finishSubmission = beginDreamSubmission();
    setGlobalFailure(null);
    setIsGlobalPending(true);
    setGloballyQueued(new Set(enabledSpaces.map((space) => space.id)));
    try {
      for (let offset = 0; offset < enabledSpaces.length; offset += 4) {
        await Promise.all(
          enabledSpaces.slice(offset, offset + 4).map(async (space) => {
            try {
              const result = await onRun(space.id, 'all');
              if (result.status === 'error') setGlobalFailure(result.message);
              else if (result.status === 'success') {
                setAcceptedBySpace((current) => ({
                  ...current,
                  [space.id]: result.data.dreamRunIds,
                }));
                onQueued(space.id, result.data);
              }
            } catch {
              setGlobalFailure('That Dream could not be started.');
            } finally {
              setGloballyQueued((current) => {
                const next = new Set(current);
                next.delete(space.id);
                return next;
              });
            }
          }),
        );
      }
    } finally {
      finishSubmission();
      setIsGlobalPending(false);
    }
  };
  const globalButton = (
    <Button
      variant="default"
      aria-label="Start dreaming in all spaces"
      disabled={isGlobalPending || spaces.every((space) => !space.dreaming_enabled)}
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
          const accepted = acceptedBySpace[space.id];
          const runs = recent.filter(
            (run) => run.space_id === space.id && (!accepted || accepted.includes(run.id)),
          );
          return (
            <SpaceRow
              key={space.id}
              space={space}
              runs={runs}
              observedAt={snapshot.observedAt}
              onRun={trackedRun}
              onQueued={(outcome) => onQueued(space.id, outcome)}
              nextDreamLabel={nextDreamLabel}
              lastDreamAt={lastDreamTimes[space.id] ?? null}
              isGloballyQueued={
                globallyQueued.has(space.id) ||
                Boolean(
                  acceptedBySpace[space.id]?.some(
                    (id) => !snapshot.runs.some((run) => run.id === id),
                  ),
                )
              }
              isGlobalPending={isGlobalPending}
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
