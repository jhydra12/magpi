# Ingestion and Dreams on Supabase Compute

The starting demo uses Edge Functions with no Compute service deployed. This
guide describes the manual Compute phase after the cutover in
[Dream rehearsal](dream-rehearsal.md). CI deploys Edge Functions and source data only.

After cutover, `dream` runs ingestion and queued Dream jobs in Node with 2 GB of memory.
The source is `supabase/compute/dream/src/index.ts`. It imports the job
code from `supabase/functions/_shared/jobs` and uses the existing project secrets.

The worker claims up to eight jobs at once, processes that batch, then checks
again. An empty queue waits five seconds. A retryable failure waits two minutes.
Each job has a five-minute budget checked between processing stages. The database
can reclaim a job after fifteen minutes if its worker disappears.

The separate Dream loop defaults to one job at a time per instance. It uses
`SB_DREAM_CONCURRENCY` and `SB_DREAM_BUDGET_MS` (300000 by default, at most 600000).
Database and model requests have timeouts. Dream jobs log processing stages and
terminal results with their run ID and worker ID. Interrupted Dreams are marked
as timed out after fifteen minutes and require an explicit new run.

The manual `dream-run` endpoint validates access and returns a queued run ID with
HTTP 202. In Edge mode, the durable Edge driver processes the queue. The manual
cutover disables the Edge driver before deploying one Compute instance. See
[Dream rehearsal](dream-rehearsal.md) for recording and isolated scaling batches.

Uploads and connected sources keep their existing enqueue paths. The
`ingest-worker` Edge Function remains available for manual calls and rollback.
Edge mode enables its automatic cron schedule. Compute mode disables that
schedule; explicit CI ingestion requests still use Edge. Hourly source sync continues.

## Earlier ingestion deployment

On 2026-09-18, `dream` reported one live and ready Node instance with 2 GB.
A temporary upload completed in one attempt and produced one embedded chunk.
The worker reported one success and zero failures. The temporary document,
job, chunks, and storage object were removed after verification.

That deployment processed ingestion only. The Dream changes on this branch need
their own deployment and hosted verification; the earlier result does not verify them.

## Deploy

```bash
pnpm install
pnpm compute:test
pnpm compute:push --project-ref vvfegdrzrzjyekvrfyoj
```

The build bundles dependencies into `supabase/compute/dream/dist/index.mjs`.
The CLI uploads that directory. Rebuild before each push; generated files are ignored.

Project secrets must include `SUPABASE_URL`, `SB_SERVICE_ROLE_KEY`, and
`OPENAI_API_KEY`. Connected sources also use `SB_TOKEN_ENC_KEY` and their existing
OAuth secrets. `SB_INGEST_CONCURRENCY` optionally sets concurrency from 1 to 32.

On the first deployment, verify that `/` returns
`{"service":"dream","status":"ok"}`, then apply
`20260917235000_ingestion_on_compute.sql` with `supabase-beta db push --linked`.
That migration removes the ingestion cron and updates `schedule_workers()`.

## Check

```bash
supabase-beta compute status dream --project-ref vvfegdrzrzjyekvrfyoj
supabase-beta compute logs dream --kind app --project-ref vvfegdrzrzjyekvrfyoj
curl https://vvfegdrzrzjyekvrfyoj.supabase.co/compute/v1/dream/
```

`GET /status` accepts a bearer token containing `SB_SERVICE_ROLE_KEY` and returns
`worker_id`, `ingestion`, and `dream` counters for the current instance. Public
health returns 503 until both loops complete a successful poll, after a polling
error, and during shutdown. The app reads aggregate run status through RLS.

## Roll back

Delete only this Compute instance and wait until it disappears from the list:

```bash
supabase-beta compute delete dream --project-ref vvfegdrzrzjyekvrfyoj --yes
supabase-beta compute list --project-ref vvfegdrzrzjyekvrfyoj
```

Then restore the ingestion cron in the SQL editor:

```sql
select cron.schedule(
  'ingest-worker', '*/2 * * * *',
  $job$select public.invoke_worker('ingest-worker', 100)$job$
);
```

For a permanent rollback, restore the ingestion entry in `schedule_workers()`
and the declarative schema with a new migration. A later call to the current
`schedule_workers()` removes the restored cron.
