# Dream rehearsal

**Start dreaming** queues three real tasks: a daily summary, entity extraction,
and document links. Verify their saved output. The bar uses worker-reported task progress and completed tasks. Keep elapsed-time labels
when cutting waits.

## Deploy order

1. Run `pnpm compute:test`, `pnpm compute:build`, and the Dream function tests.
2. Deploy `dream` with `pnpm compute:push --project-ref <project-ref>`.
3. Check its health and application logs before deploying the queue-only
   `dream-run` Edge Function and the updated web app.
4. Start a fresh Dream from the app. Follow all three run IDs in the logs, then
   open the daily summary and its sources, saved entities, and document links.

The historical Edge version at `7bfed9298646ef133b9609c70ef7b6f04e9efc3f`
used a configurable application timeout. Its recording demonstrates that
version's configured behavior. A platform comparison requires matched inputs,
outputs, and processing code. The existing `dream-worker` remains available
to an operator.

## Worker settings

`SB_DREAM_CONCURRENCY` defaults to 1 per instance. `SB_DREAM_BUDGET_MS` defaults
to 300000 and accepts at most 600000. Keep both fixed when comparing instance
counts. Ingestion runs alongside Dreams with its existing concurrency setting.

For a fair comparison, explicitly set the same 300000 ms application budget for both Edge and Compute. These budgets are application
settings. Hosted [Edge Function limits](https://supabase.com/docs/guides/functions/limits)
currently include 150 seconds of worker wall time on Free and 400 seconds on
paid plans, 2 seconds of CPU time per request excluding async I/O, and a
150-second request idle timeout. Record the actual error before attributing a
failure to a platform limit.

Edge's queue worker already runs eight jobs concurrently by default. Compute
uses the same processing code and model APIs, with continuous polling. Measure
queue wait separately from execution time. A hosted speedup has yet to be
verified.

Each instance claims separate queued Dream runs. An interrupted run is marked
as timed out after the abandonment interval. It is not automatically retried.
Start a fresh run after inspecting any partial output.

## Prepare a full Dream batch

The CLI defaults to `--kind all`: summary, entities, and document links for each temporary space. `--kind digest` remains available for a summary-only test. Use a separate rehearsal dataset to keep temporary spaces out of the demo app.

Choose an existing space with ingested source documents and a user who belongs
to that organization. Use a trusted demo dataset. The script copies source
text and embeddings into temporary team spaces and grants the selected user
access. It leaves the source space unchanged.

Load the intended project's environment before invoking the script. It needs
`NEXT_PUBLIC_SUPABASE_URL`, `SB_SERVICE_ROLE_KEY`, and `SB_WEB_BASE_URL`.
Keep the manifest outside Git; it contains fixture IDs and no credentials.

```bash
node --env-file=web/.env.local --experimental-strip-types scripts/dream-rehearsal.mts prepare \
  --source-space <space-id> --user <user-id> --count 37 --kind all \
  --manifest /tmp/dream-one.json
```

All source copies are prepared before the Dream runs enter the queue. Open the
printed `/dreams?runs=...` URL as the selected user. The counters include only
those runs the user can read. The copied chunks have fresh timestamps, so they
are eligible for the digest's 24-hour lookback window.

## Show processing and scaling

Start the first take with one instance. Submit a batch and open its dedicated
queue page. Show jobs waiting, one job running, the remaining count, and
completions in the last 30 seconds. Follow the logs:

```bash
supabase-beta compute logs dream --kind app -f --project-ref <project-ref>
```

While the batch has work waiting, scale and return to its page:

```bash
supabase-beta compute push dream --instances 11 --project-ref <project-ref>
supabase-beta compute status dream --project-ref <project-ref>
```

Return to the same batch page. Show multiple jobs running, the remaining count
falling faster, and more completions in the last 30 seconds. Keep batch elapsed
time visible. Open one digest and its sources. The measurements come from stored
run records and show the observation time. The final elapsed time stops when
the last job finishes.

Rehearse startup time before recording. If one instance finishes the batch
before the added instances are ready, prepare a larger batch with `--count`
(up to 100). Record the actual queue through the transition.

For a numerical comparison, record separate complete batches using the same
source text, starting entity/link state, job kinds, job count, and model. Record
application budgets, worker count, and concurrency per worker. Compare one and
eleven Compute instances with fixed per-instance concurrency. For Edge versus
Compute, also record invocation frequency and total concurrency. Wait for the
intended workers before queuing each batch.
Use a fresh manifest and temporary spaces for each. Collect status afterward:

```bash
node --env-file=web/.env.local --experimental-strip-types scripts/dream-rehearsal.mts status \
  --manifest /tmp/dream-one.json
```

Status reads run IDs in batches, so 37 spaces cover all 111 tasks. It reports nonempty digest outputs and saved entity, mention, and link counts. Inspect sample outputs and source citations for each task kind. Report measured completion time and successful outputs. Include failures in the
comparison. Model-provider limits and uneven job durations can affect throughput.

Inspect current processing caps before increasing source volume. Previously configured caps were: 120 chunks for a
summary, 400 chunks for entities, and 40 documents for links. Entity discovery
is capped at 100 names, entity summaries at 25, and links at 30. Processing a
larger corpus requires paginated batches before generating extra documents can
demonstrate that workload.

## Clean up

After the batch finishes, remove only its temporary spaces and their contents:

```bash
node --env-file=web/.env.local --experimental-strip-types scripts/dream-rehearsal.mts cleanup \
  --manifest /tmp/dream-one.json
```

Cleanup refuses active jobs and validates fixture ownership. Keep the manifest
until cleanup succeeds. Restore the intended Compute instance count after recording.

## Local verification, 18 September 2026

A 24-job batch used real model calls and 68 source documents per job against
local Supabase. One Node worker completed three jobs in 32.2 seconds. Seven
additional workers then joined the same queue; the remaining 21 jobs completed
in 42.6 seconds. All 24 produced nonempty digests with source citations, and
logs identified eight distinct workers. Browser checks confirmed the live
queue and the manual submission-to-output flow. Temporary spaces were removed.

These measurements cover local worker processes. Rehearse hosted Compute
startup and the one-to-eleven transition before recording the keynote.

## Record the actual before and after

See [Compute demo positioning](compute-demo-positioning.md) for the claims the recording must prove.
The Edge take requires an Edge-only queue driver. There is no automatic Edge
Dream cron to assume is running. Stop Compute Dream consumers before starting
the Edge take, explicitly drive the Edge worker, and record its invocation rate
and concurrency. Keep source data, model, application budget, and total submitted
jobs identical across takes. Restore the intended Compute service afterwards.

For one versus eleven Compute instances, first record the existing deployment's
instance count with `supabase-beta compute status dream --project-ref <project-ref> -o json`.
Deploy one instance, wait until it is ready, prepare the first 37-space full batch,
and save its final status. Then deploy eleven instances, wait until all eleven
are ready, and prepare an identical batch using a fresh manifest. Restore the
original count after both batches finish and cleanup succeeds. A deployment of
new code preserves the existing instance count; rehearsal scaling is explicit.

Production deployment waits for the same-commit validation, then applies
migrations and Edge Functions and updates Compute before the GitHub
`Production release ready` check allows Vercel to assign production domains.
