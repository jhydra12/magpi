# Ingestion on Supabase Compute

`dream` runs the existing ingestion jobs in Node with 2 GB of memory.
The source is `supabase/compute/dream/src/index.ts`. It imports the job
code from `supabase/functions/_shared/jobs` and uses the existing project secrets.

The worker claims up to eight jobs at once, processes that batch, then checks
again. An empty queue waits five seconds. A retryable failure waits two minutes.
Each job has a five-minute budget checked between processing stages. The database
can reclaim a job after fifteen minutes if its worker disappears.

Uploads and connected sources keep their existing enqueue paths. The
`ingest-worker` Edge Function remains available for manual calls and rollback.
The migration removes its automatic cron schedule. Hourly source sync continues.

## Verified deployment

On 2026-09-18, `dream` reported one live and ready Node instance with 2 GB.
A temporary upload completed in one attempt and produced one embedded chunk.
The worker reported one success and zero failures. The temporary document,
job, chunks, and storage object were removed after verification.

The ingestion cron is disabled on the hosted project. This deployment processes
ingestion jobs; dream processing remains separate.

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
`{"service":"ingestion","status":"ok"}`, then apply
`20260917235000_ingestion_on_compute.sql` with `supabase-beta db push --linked`.
That migration removes the ingestion cron and updates `schedule_workers()`.

## Check

```bash
supabase-beta compute status dream --project-ref vvfegdrzrzjyekvrfyoj
supabase-beta compute logs dream --kind app --project-ref vvfegdrzrzjyekvrfyoj
curl https://vvfegdrzrzjyekvrfyoj.supabase.co/compute/v1/dream/
```

`GET /status` accepts a bearer token containing `SB_SERVICE_ROLE_KEY` and reports
processing counters for the current instance. Public health returns 503 until
the first successful database claim, after a polling error, and during shutdown.

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
