'use client';

import { useEffect, useState } from 'react';

/** Where the bar stops creeping. The run itself decides when the bar completes or fails. */
const CEILING_PERCENT = 95;
/** Seconds for the bar to cover about two thirds of the ceiling. A dream run takes minutes. */
const TAU_MS = 40_000;
const TICK_MS = 500;

/** Fast at first, then slower and slower, and never past the ceiling on its own. */
export function creepProgress(elapsedMs: number): number {
  return CEILING_PERCENT * (1 - Math.exp(-elapsedMs / TAU_MS));
}

function formatElapsed(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A run in flight: what is running, over which space, for how long, and a bar that creeps. */
export function RunProgress({ spaceName, kindLabel }: { spaceName: string; kindLabel: string }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const value = creepProgress(elapsedMs);
  const label = `${kindLabel} over ${spaceName}`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs text-tertiary-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{formatElapsed(elapsedMs)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full bg-brand-600 transition-[width] duration-500 ease-linear motion-reduce:transition-none"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
