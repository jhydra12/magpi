import type { IngestJobRecord } from '../../../functions/_shared/jobs/ingest.ts';
import type { BatchResult } from '../../../functions/_shared/jobs/ingest_batch.ts';

export interface WorkerDependencies {
  claim(limit: number): Promise<IngestJobRecord[]>;
  run(jobs: IngestJobRecord[], concurrency: number): Promise<BatchResult[]>;
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
  reportError(error: unknown): void;
}

export interface WorkerOptions {
  concurrency?: number;
  idleMs?: number;
  retryMs?: number;
}

export interface WorkerStatus {
  running: boolean;
  ready: boolean;
  stopping: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  lastCompletedAt: string | null;
}

export interface IngestionWorker {
  status(): WorkerStatus;
  stop(): void;
  start(): Promise<void>;
}

/** Drains claimed jobs before asking for another batch and stops claiming on shutdown. */
export function createIngestionWorker(
  dependencies: WorkerDependencies,
  options: WorkerOptions = {},
): IngestionWorker {
  const concurrency = options.concurrency ?? 8;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error('Ingestion concurrency must be between 1 and 32');
  }
  const controller = new AbortController();
  let state: WorkerStatus = {
    running: false,
    ready: false,
    stopping: false,
    processed: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    lastCompletedAt: null,
  };

  async function cycle(): Promise<number> {
    // Claim only the work that starts immediately, including when a provider throttles.
    const jobs = await dependencies.claim(concurrency);
    state = { ...state, ready: true };
    if (jobs.length === 0) return options.idleMs ?? 5_000;
    const results = await dependencies.run(jobs, concurrency);
    const retrying = results.filter((result) => result.kind === 'retrying').length;
    state = {
      ...state,
      processed: state.processed + results.length,
      succeeded:
        state.succeeded +
        results.filter((result) => result.kind === 'succeeded' || result.kind === 'unchanged')
          .length,
      failed:
        state.failed +
        results.filter((result) => result.kind === 'failed' || result.kind === 'timeout').length,
      retrying: state.retrying + retrying,
      lastCompletedAt: new Date().toISOString(),
    };
    return retrying > 0 ? (options.retryMs ?? 120_000) : 0;
  }

  return {
    status: (): WorkerStatus => ({ ...state }),
    stop(): void {
      state = { ...state, stopping: true };
      controller.abort();
    },
    async start(): Promise<void> {
      if (state.running || state.stopping) return;
      state = { ...state, running: true };
      try {
        while (!controller.signal.aborted) {
          let delay: number;
          try {
            delay = await cycle();
          } catch (error) {
            state = { ...state, ready: false };
            dependencies.reportError(error);
            delay = options.retryMs ?? 120_000;
          }
          if (delay > 0 && !controller.signal.aborted) {
            await dependencies.wait(delay, controller.signal);
          }
        }
      } finally {
        state = { ...state, running: false };
      }
    },
  };
}
