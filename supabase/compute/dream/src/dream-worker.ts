import type { BatchOutcome } from '../../../functions/_shared/jobs/dream_batch.ts';

export interface DreamWorkerDependencies {
  drain(limit: number): Promise<BatchOutcome & { selected: number }>;
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
  reportError(error: unknown): void;
}

export interface DreamWorkerStatus {
  running: boolean;
  ready: boolean;
  stopping: boolean;
  concurrency: number;
  processed: number;
  succeeded: number;
  failed: number;
  contended: number;
  lastCompletedAt: string | null;
}

export interface DreamWorker {
  start(): Promise<void>;
  stop(): void;
  status(): DreamWorkerStatus;
}

/** Processes bounded batches, immediately checking remaining work after a competing claim. */
export function createDreamWorker(
  dependencies: DreamWorkerDependencies,
  concurrency = 1,
): DreamWorker {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error('Dream concurrency must be between 1 and 32');
  }
  const controller = new AbortController();
  let state: DreamWorkerStatus = {
    running: false,
    ready: false,
    stopping: false,
    concurrency,
    processed: 0,
    succeeded: 0,
    failed: 0,
    contended: 0,
    lastCompletedAt: null,
  };
  return {
    status: () => ({ ...state }),
    stop(): void {
      state = { ...state, stopping: true };
      controller.abort();
    },
    async start(): Promise<void> {
      if (state.running || state.stopping) return;
      state = { ...state, running: true };
      try {
        while (!controller.signal.aborted) {
          let delay = 0;
          try {
            const batch = await dependencies.drain(concurrency);
            state = {
              ...state,
              ready: true,
              processed: state.processed + batch.results.length,
              succeeded:
                state.succeeded +
                batch.results.filter((result) => result.kind === 'succeeded').length,
              failed:
                state.failed + batch.results.filter((result) => result.kind !== 'succeeded').length,
              contended: state.contended + batch.contended,
              lastCompletedAt: batch.results.length
                ? new Date().toISOString()
                : state.lastCompletedAt,
            };
            delay = batch.selected === 0 ? 5_000 : 0;
          } catch (error) {
            state = { ...state, ready: false };
            dependencies.reportError(error);
            delay = 5_000;
          }
          if (delay && !controller.signal.aborted)
            await dependencies.wait(delay, controller.signal);
        }
      } finally {
        state = { ...state, running: false };
      }
    },
  };
}
