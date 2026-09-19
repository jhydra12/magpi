# Dream rehearsal

The starting state uses Edge Functions only. **Start dreaming** queues three
real tasks per space: a summary, entity extraction, and document links. The
Edge driver drains that queue sequentially. Keep elapsed-time labels visible
when cutting waits. Progress comes from worker reports and saved task results.

## Starting state

1. Run the validation gate, including Compute build/tests and graph tests.
2. Deploy migrations, Edge Functions, and source documents through the main
   workflow. Wait for ingestion to complete.
3. Confirm no hosted `dream` Compute service is running. A previous rehearsal
   must be stopped before enabling Edge queue drivers. Never run competing
   Edge and Compute consumers for a timed comparison.
4. Confirm the Edge driver is enabled and Start dreaming progresses without
   leaving the page open. Open actual summaries, entity mentions, and links.

CI does not deploy Compute. Production promotion waits for the same-commit
validation, Edge deployment, and source ingestion. The GitHub
`Production release ready` check permits Vercel to assign production domains.

## Move to Compute during the demo

Build the bundle before recording. At the cutover, run:

```bash
pnpm compute:build
node scripts/dream-cutover.mjs --project-ref <project-ref>
```

The manual operation disables Edge queue drivers, waits for in-flight work to
finish, and deploys exactly one Compute instance. It does not submit synthetic
Dream results. Confirm one instance is ready before discussing throughput.

```bash
supabase-beta compute status dream --project-ref <project-ref>
supabase-beta compute logs dream --kind app -f --project-ref <project-ref>
```

While independent jobs remain queued, increase the service to eleven:

```bash
supabase-beta compute push dream --instances 11 --project-ref <project-ref>
supabase-beta compute status dream --project-ref <project-ref>
```

Show multiple spaces progressing, successful jobs completing, and new saved
entities appearing in the graph. Hover over a connection to show its source
files. Measure throughput after the added workers are ready.

## Matched workload

See [Compute demo positioning](compute-demo-positioning.md) for the claims the
recording must prove. Use identical source text, starting entity/link state,
models, task counts, and application budgets. Set the Dream application budget
to 300000 ms for both execution modes. Keep `SB_DREAM_CONCURRENCY=1` per Compute
instance. Edge sequencing is an application setting and must be described as
such; it is not an assertion that Edge Functions cannot run concurrently.

Record Edge invocation frequency, worker readiness, queue wait, execution time,
failed tasks, and saved output. An elevenfold speedup is not guaranteed. Model
quotas, job sizes, database work, and worker startup can limit throughput.

The full rehearsal CLI defaults to `--kind all`. Each temporary space receives
summary, entity, and document-link tasks. `--kind digest` is an explicit
summary-only alternative. Use a separate rehearsal dataset to keep these
spaces out of the keynote app.

It requires `NEXT_PUBLIC_SUPABASE_URL`, `SB_SERVICE_ROLE_KEY`, and
`SB_WEB_BASE_URL`. Select an existing ingested source space and a user with
access to it. Store each ownership manifest outside Git.

```bash
node --env-file=web/.env.local --experimental-strip-types scripts/dream-rehearsal.mts prepare \
  --source-space <space-id> --user <user-id> --count 37 --kind all \
  --manifest /tmp/dream-one.json
```

This copies real source text and embeddings before queueing 111 tasks. The
copies have fresh timestamps for the processing lookback window. It clones
up to 120 source chunks per space; increasing document volume beyond the
selected input does not increase this rehearsal's work.

Use a fresh manifest and copied spaces for the eleven-instance comparison.
Wait for the chosen worker count to be ready before queueing each batch.

```bash
node --env-file=web/.env.local --experimental-strip-types scripts/dream-rehearsal.mts status \
  --manifest /tmp/dream-one.json
```

Status reads all requested jobs in batches and reports nonempty digest
outputs, entity counts, mentions, and links. Inspect sample outputs and their
source citations. A successful task with no relevant entities or links is
possible; report the actual result rather than inserting fixtures.

## Cleanup and restore

After each batch finishes, delete only its owned temporary spaces:

```bash
node --env-file=web/.env.local --experimental-strip-types scripts/dream-rehearsal.mts cleanup \
  --manifest /tmp/dream-one.json
```

Cleanup refuses active jobs and checks ownership. Keep its manifest until
cleanup succeeds. To restore the keynote starting state, wait for processing
to finish, delete the hosted Compute service, verify that it has stopped,
and re-enable Edge queue drivers. The app must then process Dreams with no
Compute instances running.

After confirming Compute has stopped, restore the drivers using the privileged
SQL editor:

```sql
select public.set_dream_execution_mode('edge');
```

This enables the sequential Dream wakeup driver and the ingestion schedule.
Cutover switches the same mode to `compute`, which disables both drivers;
explicit source-ingestion calls from CI continue to use the Edge worker.

### Reset from the app

In Admin > Demo, press Reset. The checklist reports each completed operation:
pause new Dream and ingestion claims, wait for active work to finish, delete
`dream` Compute and verify its absence, delete generated Dream output, then
restore Edge processing. Source documents, spaces, members, and connections
remain. A failed step stops the reset; press Reset again to retry. Processing
stays paused after a failure until reset completes.

Hosted reset requires `SUPABASE_ACCESS_TOKEN` in the web server's environment,
with management access to the configured Supabase project. Keep this credential
server-only. Local Supabase skips hosted Compute deletion. The button never
creates a Compute instance.
