# Compute demo positioning

Research checked September 19, 2026. This note combines current repository behavior with the product team's Slack discussion, Linear documents, and the private-alpha guide's source branch. Product availability and a successful rehearsal are separate checks.

## What the demo should say

“Magpi reads our documents and builds a connected view of the company. We can run that background work on Supabase Compute, alongside our database. Watch what happens when we add ten more workers.”

Use the Dreams queue to show completed work increasing, then leave the presenter on the entity graph while new entities and document connections appear. Hover over a connection to show its source files. Keep the corpus, models, and processing code identical during the comparison. Report the measured change in completion rate after the new instances are ready.

The product direction is broader: Compute becomes the common foundation for servers, sandboxes, workflows, scheduled jobs, and Edge Functions. In the private alpha, Edge Functions and Compute coexist in the dashboard and CLI. Present consolidation as the direction. [Lakshan's positioning discussion, September 16](https://supabase.slack.com/archives/C0BB4MAJW58/p1789588363435129)

## Claims and their evidence

| Claim                                                       | Current evidence                                                                                                                                                       | Demo treatment                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Long-running code and additional worker instances           | Private-alpha guide documents maintained instances, Node/Deno/Dockerfile runtimes, and scaling with `compute push --instances`.                                        | Show the actual instance count and worker readiness.                                                                 |
| Compute runs in the database's AWS region                   | Product owner confirms this and reports double-digit millisecond database communication. Published comparative benchmarks were still being prepared in the discussion. | Say “alongside our database.” Measure the demo's database calls before quoting latency or a competitive speed claim. |
| More workers drain independent queued work faster           | The application shares a durable queue across workers. Each instance defaults to one concurrent Dream task.                                                            | Compare one versus eleven ready workers on the same queued workload; count successful jobs and real output.          |
| Private networking makes database communication more secure | Product owner explicitly describes this as future work outside private alpha.                                                                                          | Keep private-network security out of the current capability demonstration.                                           |
| Compute replaces Edge Functions immediately                 | The team says both coexist during alpha.                                                                                                                               | Describe moving this workload and the longer-term product direction.                                                 |

Sources: [positioning thread](https://supabase.slack.com/archives/C0BB4MAJW58/p1789588363435129), [private-alpha guide source](https://github.com/supabase/supabase/blob/func-913-compute-agent-docs/apps/docs/content/guides/ai-tools/compute-private-alpha.mdx), [draft CLI PRFAQ](https://linear.app/supabase/document/prfaq-supabase-compute-cli-0ea25778834e).

## Current app behavior

`supabase/config.toml` defines `compute.dream` with the Node runtime, 2 GB size, public exposure, and a bundled `dist` directory. It doesn't pin an instance count. `scripts/build-ingest-compute.mts` bundles dependencies into the deployed JavaScript.

`supabase/compute/dream/src/index.ts` starts both polling loops at process startup. Dream concurrency defaults to one per instance; ingestion concurrency defaults to eight. Eleven instances can therefore attempt eleven Dream tasks concurrently, with additional ingestion work competing for resources. Finish corpus ingestion before recording.

The worker uses Supabase's HTTP client and Data API. This demonstration doesn't currently establish a direct Postgres connection or measure private-network latency.

The current default already expects Compute to drain Dreams. `dream-run` authorizes and queues tasks. `schedule_workers()` schedules nightly queue creation, without scheduling an Edge Dream drain. The Edge `dream-worker` still exists and uses the shared processing code. A genuine Edge before-state requires an explicit Edge-only execution phase with Compute stopped. Pressing Start dreaming alone doesn't establish that phase.

Each Dream has an application processing budget; Compute defaults to five minutes. Treat a timeout as a measured outcome and preserve partial-progress evidence. Do not describe the application as unlimited.

## What to record

1. Seed and ingest source documents. Clear generated Dream outputs and confirm the entity graph starts empty. Save the source manifest and source counts.
2. Establish an Edge-only baseline with an actual worker invocation. Record accepted task IDs, successful tasks, failures, elapsed time, and document coverage. Avoid artificial delays.
3. Run the same workload on one Compute instance. Confirm readiness and show real processing in the queue and logs.
4. Scale the service to eleven instances. Confirm the platform reports eleven ready instances, then measure successful tasks per minute. Show additional spaces progressing together.
5. Leave the graph visible as saved entity mentions arrive. Open shared source files from a graph connection.

Use the existing expanded corpus first. Increase document volume only if the measured queue drains before the presenter reaches the scaling step. Additional independent spaces provide parallel tasks. More documents within a single task primarily increase that task's duration. Eleven instances don't imply an elevenfold speedup; model quotas, database writes, task sizes, and startup time affect the result.

## Recent alpha changes to account for

**Node dependency installation is changing.** On September 18, Matt reported lockfile-based npm, pnpm, and Yarn installation working in staging, with production expected shortly. FUNC-893 is marked Done; its PRFAQ remains Draft and lists some runtime checks as open. The local Compute skill and agent-guide branch still say Node dependencies must be vendored. The demo's bundled deployment avoids reliance on the new install behavior. Verify the project's actual runtime before changing packaging. [Staging confirmation](https://supabase.slack.com/archives/C0BB4MAJW58/p1789726171063249), [dependency PRFAQ](https://linear.app/supabase/document/prfaq-compute-dependency-resolution-950c4498f78f), [FUNC-893](https://linear.app/supabase/issue/FUNC-893/compute-dependencies-prfaq)

**Direct database restrictions need explicit configuration.** FUNC-918 is Backlog and documents direct connections failing under network restrictions. The newer agent-guide branch supplies Compute egress CIDRs and an append-only allowlist command. Data API access is unaffected. This is a documented workaround, with production verification still required for a direct-connection demo. [FUNC-918](https://linear.app/supabase/issue/FUNC-918/allow-compute-to-connect-with-database-network-restrictions), [guide network restrictions](https://github.com/supabase/supabase/blob/func-913-compute-agent-docs/apps/docs/content/guides/ai-tools/compute-private-alpha.mdx#network-restrictions)

**Moving the MCP endpoint requires an explicit OAuth resource URL.** Raúl successfully tested BYO MCP on Compute after passing `resourceServer` to `withOAuthProtectedResource`; Compute doesn't inject `SUPABASE_FUNCTION_SLUG`. Our MCP endpoint currently uses the zero-argument helper on Edge. The Dreams move doesn't require migrating that endpoint. [September 18 test report](https://supabase.slack.com/archives/C0BB4MAJW58/p1789732340985439)

The older template PRFAQ proposes local `build`/`start` configuration and a curated workload list. It is explicitly Draft and conflicts with parts of the newer dependency design. Keep its proposed commands and timings out of the recording until confirmed against the CLI in use. [Existing-software PRFAQ](https://linear.app/supabase/document/prfaq-deploying-existing-software-to-supabase-compute-f0f5a2204afb)
