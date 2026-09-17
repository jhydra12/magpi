'use client';

import Link from 'next/link';
import { useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { ActionState } from '@/lib/actions/state';
import type { DreamRunOutcome } from '@/lib/dreams/edge';
import { DREAM_KINDS, describeDreamKind, type DreamKind } from '@/lib/dreams/status';

import { RunProgress } from './run-progress';

export type DreamingSpace = {
  readonly id: string;
  readonly name: string;
  readonly dreaming_enabled: boolean;
};

type ToggleDreaming = (spaceId: string, enabled: boolean) => Promise<ActionState<undefined>>;

type RunDream = (spaceId: string, kind: DreamKind) => Promise<ActionState<DreamRunOutcome>>;

function describeOutcome(outcome: DreamRunOutcome): string {
  switch (outcome.status) {
    case 'succeeded':
      return outcome.outputDocumentId
        ? 'The run finished and wrote a document.'
        : 'The run finished and produced nothing, because it found nothing it could cite.';
    case 'timeout':
      return 'The run timed out. Open it to see which stage it died in.';
    case 'failed':
      return 'The run failed. Open it to see which stage it died in.';
    default: {
      const unhandled: never = outcome.status;
      throw new Error(`Unhandled dream run status: ${String(unhandled)}`);
    }
  }
}

function SpaceRow({
  space,
  onToggle,
  onRun,
}: {
  space: DreamingSpace;
  onToggle: ToggleDreaming;
  onRun: RunDream;
}) {
  const kindFieldId = useId();
  const [kind, setKind] = useState<DreamKind>('digest');
  // Held here as well as written, so the switch shows the saved value without a reload.
  const [isDreaming, setDreaming] = useState(space.dreaming_enabled);
  const [failure, setFailure] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DreamRunOutcome | null>(null);
  // Only a run shows the bar. The switch also goes through the transition and must not.
  const [isRunning, setRunning] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setFailure(null);
    startTransition(async () => {
      const result = await onToggle(space.id, next);
      if (result.status === 'error') setFailure(result.message);
      else setDreaming(next);
    });
  };

  const runNow = () => {
    setFailure(null);
    setOutcome(null);
    setRunning(true);
    startTransition(async () => {
      const result = await onRun(space.id, kind);
      if (result.status === 'error') setFailure(result.message);
      else if (result.status === 'success') setOutcome(result.data);
      setRunning(false);
    });
  };

  return (
    <div role="group" aria-label={space.name} className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Switch
            checked={isDreaming}
            aria-label={`Dreaming in ${space.name}`}
            disabled={isPending}
            onCheckedChange={toggle}
          />
          <span className="text-sm text-foreground">{space.name}</span>
          {isDreaming ? null : (
            <span className="text-xs text-tertiary-foreground">Dreaming is off in this space</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={kindFieldId} className="sr-only">
              Kind
            </label>
            <select
              id={kindFieldId}
              value={kind}
              disabled={!isDreaming || isPending}
              onChange={(event) => {
                const chosen = DREAM_KINDS.find((candidate) => candidate === event.target.value);
                if (chosen) setKind(chosen);
              }}
              className="h-8 rounded-[var(--radius-panel)] border border-input bg-card px-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-input focus-visible:outline-none"
            >
              {DREAM_KINDS.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {describeDreamKind(candidate).label}
                </option>
              ))}
            </select>
          </div>

          <Button size="sm" variant="outline" disabled={!isDreaming || isPending} onClick={runNow}>
            Run now
          </Button>
        </div>
      </div>

      {isRunning ? (
        <RunProgress spaceName={space.name} kindLabel={describeDreamKind(kind).label} />
      ) : null}

      {outcome ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {describeOutcome(outcome)}
          <Link href={`/dreams/${outcome.dreamRunId}`} className="text-brand-link hover:underline">
            Open the run
          </Link>
        </p>
      ) : null}

      {failure ? (
        <p role="alert" className="text-xs text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/** Dreaming is a per-space setting, because a dream run is scoped to exactly one space. */
export function SpaceDreaming({
  spaces,
  onToggle,
  onRun,
}: {
  spaces: readonly DreamingSpace[];
  onToggle: ToggleDreaming;
  onRun: RunDream;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-medium text-foreground">Dreaming by space</h2>
      <p className="max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
        Switch off to suspend dreaming for a space.
      </p>
      <div className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
        {spaces.map((space) => (
          <SpaceRow key={space.id} space={space} onToggle={onToggle} onRun={onRun} />
        ))}
      </div>
    </section>
  );
}
