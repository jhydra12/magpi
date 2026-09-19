// POST /ingest-worker. Claims queued ingest jobs and calls runIngestJob for each one.

import { jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { parseBody, workerBatchSchema } from '../_shared/validate.ts';
import { claimIngestJobs } from '../_shared/jobs/claim.ts';
import { runIngestJob } from '../_shared/jobs/ingest.ts';
import { DEFAULT_CONCURRENCY, runIngestBatch } from '../_shared/jobs/ingest_batch.ts';
import { jobDepsFromEnv, requireWorkerCaller } from '../_shared/jobs/runtime.ts';

const DEFAULT_BATCH = 5;

serveFunction('ingest-worker', async (core) => {
  requireWorkerCaller(core.headers);
  const input = parseBody(workerBatchSchema, core.body ?? {});
  const deps = jobDepsFromEnv();

  // Claims a whole batch in one statement, answering in the error envelope when it cannot.
  const jobs = await claimIngestJobs(
    deps.db,
    Math.min(input.batch ?? DEFAULT_BATCH, input.concurrency ?? DEFAULT_CONCURRENCY),
    input.org_id,
  );

  // One job's failure is recorded on its own row and does not stop the batch. A provider asking
  // us to slow down does stop it, because the next job would be told the same thing.
  const results = await runIngestBatch(
    jobs,
    deps,
    runIngestJob,
    input.concurrency ?? DEFAULT_CONCURRENCY,
  );

  return jsonResponse({ claimed: results.length, results });
});
