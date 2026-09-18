import { setTimeout } from 'node:timers/promises';

import type { EnvSource } from '../../../functions/_shared/env.ts';
import { toErrorResponse } from '../../../functions/_shared/errors.ts';
import { claimIngestJobs } from '../../../functions/_shared/jobs/claim.ts';
import { runIngestJob } from '../../../functions/_shared/jobs/ingest.ts';
import { runIngestBatch } from '../../../functions/_shared/jobs/ingest_batch.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../../../functions/_shared/jobs/runtime.ts';

import { createIngestionWorker } from './worker.ts';

const nodeEnv: EnvSource = { get: (name: string): string | undefined => process.env[name] };
const concurrency = Number(nodeEnv.get('SB_INGEST_CONCURRENCY') ?? 8);
const worker = createIngestionWorker(
  {
    claim: (limit) => claimIngestJobs(jobDepsFromEnv(nodeEnv).db, limit),
    run: (jobs, limit) =>
      runIngestBatch(
        jobs,
        { ...jobDepsFromEnv(nodeEnv), budgetMs: 5 * 60_000 },
        runIngestJob,
        limit,
      ),
    async wait(milliseconds, signal): Promise<void> {
      try {
        await setTimeout(milliseconds, undefined, { signal });
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    },
    reportError: (error) => console.error('Ingestion polling failed', error),
  },
  { concurrency },
);

process.once('SIGTERM', () => worker.stop());
process.once('SIGINT', () => worker.stop());
void worker.start().catch((error: unknown) => {
  console.error('Ingestion polling stopped unexpectedly', error);
  worker.stop();
});

export default {
  fetch(request: Request): Response {
    if (request.method !== 'GET') {
      return Response.json(
        { error: 'method_not_allowed' },
        {
          status: 405,
          headers: { Allow: 'GET' },
        },
      );
    }
    if (new URL(request.url).pathname.replace(/\/+$/, '').endsWith('/status')) {
      try {
        requireWorkerCaller(request.headers, nodeEnv);
        return Response.json(worker.status());
      } catch (error) {
        return toErrorResponse(error);
      }
    }
    const status = worker.status();
    const healthy = status.running && status.ready && !status.stopping;
    return Response.json(
      { service: 'ingestion', status: healthy ? 'ok' : 'unavailable' },
      {
        status: healthy ? 200 : 503,
      },
    );
  },
};
