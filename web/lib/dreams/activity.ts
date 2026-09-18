import { z } from 'zod';

/** Bounded, caller-visible run records used by the queue monitor. */
export const dreamActivitySchema = z.object({
  id: z.uuid(),
  space_id: z.uuid(),
  kind: z.enum(['entities', 'digest', 'connections']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'timeout']),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  input_document_count: z.number(),
  output_document_id: z.uuid().nullable(),
  error: z.string().nullable(),
});

export const dreamActivityResponseSchema = z.object({
  runs: z.array(dreamActivitySchema).max(100),
  observedAt: z.string(),
});

export type DreamActivityRun = z.infer<typeof dreamActivitySchema>;
export type DreamActivitySnapshot = z.infer<typeof dreamActivityResponseSchema>;

/** An absent filter selects recent activity; an invalid filter must never broaden a query. */
export function parseDreamRunIds(value: string | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  return z.array(z.uuid()).min(1).max(100).parse(value.split(','));
}

export function isDreamActive(run: DreamActivityRun): boolean {
  return run.status === 'queued' || run.status === 'running';
}

export function countDreamActivity(runs: readonly DreamActivityRun[]) {
  return {
    queued: runs.filter((run) => run.status === 'queued').length,
    running: runs.filter((run) => run.status === 'running').length,
    completed: runs.filter((run) => run.status === 'succeeded').length,
    failed: runs.filter((run) => run.status === 'failed' || run.status === 'timeout').length,
  };
}

export type DreamBatchMetrics = {
  readonly remaining: number;
  readonly elapsedMs: number | null;
  readonly completedInLast30Seconds: number;
};

/** Measure only the visible batch, using saved timestamps and the server observation time. */
export function measureDreamBatch(snapshot: DreamActivitySnapshot): DreamBatchMetrics {
  const { runs } = snapshot;
  const remaining = runs.filter(isDreamActive).length;
  const observedMs = Date.parse(snapshot.observedAt);
  const completedInLast30Seconds = runs.filter((run) => {
    if (run.status !== 'succeeded' || !run.finished_at) return false;
    const finishedMs = Date.parse(run.finished_at);
    return finishedMs > observedMs - 30_000 && finishedMs <= observedMs;
  }).length;
  if (runs.length === 0) return { remaining, elapsedMs: null, completedInLast30Seconds };

  const createdTimes = runs.map((run) => Date.parse(run.created_at));
  const finishTimes = runs.map((run) => (run.finished_at ? Date.parse(run.finished_at) : NaN));
  const endMs = remaining > 0 ? observedMs : Math.max(...finishTimes);
  const startMs = Math.min(...createdTimes);
  const elapsedMs =
    Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null;
  return { remaining, elapsedMs, completedInLast30Seconds };
}
