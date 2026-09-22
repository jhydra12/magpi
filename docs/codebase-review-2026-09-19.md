# Codebase review, September 19, 2026

## Scope and evidence

Reviewed frontend routes and components, authentication, chat streaming, uploads, connection sync, Dreams, graph construction, Edge and Compute workers, provider adapters, database definitions, seeders, tests, CI, and deployment configuration. This is a repository-wide review of those paths, not a line-by-line proof of every file or a security certification. No dependency vulnerability scan or production database load test was performed.

Findings below come from source inspection unless explicitly marked as reproduced or measured. Live database schema parity, query plans, and concurrent worker throughput remain to be verified. All review changes remain local. The production graph fix still needs deployment and visual verification.

## Fix order

1. Finish the graph repair and replace expensive graph construction. Prove visible rendering and responsive navigation with browser tests.
2. Repair Dream submission, refresh, and queue claiming. Prove one-to-many worker scaling with the same workload.
3. Make ingestion and enqueue operations recoverable. Protect existing content when replacement fails.
4. Repair seed retries and processing limits. Make source-only demo seeding explicit.
5. Repair chat and upload error recovery, then make release checks cover these paths.

Each step should be a focused change with its own regression coverage. Database function or schema changes require design review under this repository's rules. Avoid a broad framework rewrite or renaming campaign.

## Graph and Dreams

### 1. Production graph rendering fails on theme colors

**Reproduced in production.** Hover targets work, but rendering throws from the installed color parser when it receives calculated OKLCH colors. The canvas also exceeds its container and uses fixed percentage offsets.

References: `web/components/dreams/entity-graph-canvas.tsx`, `web/components/dreams/graph-colors.ts`.

The pending repair converts theme colors through actual canvas pixels into sRGB values, sizes the renderer from its container, removes positioning offsets, and uses a transparent renderer background so the page itself supplies the background color. A real Chromium color-conversion regression test passes. That test does not prove graph rendering; deployment and visible graph checks in both themes remain required.

### 2. Graph construction blocks the main thread and can invent connections

**Measured and reproduced locally.** `entity-graph-canvas.tsx:87` loops through every entity pair and repeatedly scans documents. It also compares shared documents by title. Two different documents named “Weekly update” produce a false connection between their entities.

A local Node benchmark of the existing graph builder, with three document mentions per entity and one document per entity overall, produced:

| Entities | Documents | Output links | Construction time |
| -------- | --------- | ------------ | ----------------- |
| 100      | 100       | 500          | 29 ms             |
| 250      | 250       | 1,250        | 315 ms            |
| 500      | 500       | 2,500        | 2,993 ms          |

These are single-run synthetic measurements, not production browser timings. They establish a substantial synchronous cost that grows with the corpus.

**Change:** extract a pure graph builder. Index document IDs to entity IDs, enumerate pairs only within each shared document, and accumulate document IDs per entity pair. Use titles only for display. Work then follows actual mentions and co-mentions; dense documents can still generate many pairs. Preserve node positions by stable ID when new data arrives and avoid rebuilding unchanged input.

**Tests:** duplicate document titles, cross-space shared documents, incremental entity arrival, stable node positions, and a representative large graph with responsive navigation.

### 3. Entity refresh repeats expensive server work every two seconds

References: `web/components/dreams/entity-graph-live.tsx:17`, `web/app/(app)/dreams/entities/page.tsx`, `web/lib/dreams/activity-queries.ts:15`.

Active Dreams trigger a full route refresh every two seconds. The route asks for the latest Dream separately for every visible space, then chooses the newest overall. It also repeats space loading. This creates one avoidable database request per visible space on every refresh, alongside graph rebuilding.

**Change:** query the latest overall Dream once for this view; batch per-space summaries where needed elsewhere. Refresh entity changes independently of page metadata, stop polling when idle, and avoid overlapping requests.

**Tests:** query count remains bounded as space count grows; unchanged results do not reconstruct the graph; errors and slow requests do not lock navigation.

### 4. Global Dream submission does not limit concurrency

References: `web/components/dreams/space-dreaming.tsx:182`, `web/lib/dreams/edge.ts:28`.

The “four at a time” implementation schedules requests by timers rather than awaiting available capacity. With 37 spaces, all requests can be scheduled within roughly 800 ms regardless of completion. Successful responses do not update the pending run IDs, and refresh starts before submission finishes. Existing runs can obscure new queued state. The client expands “all” into three sequential requests, creating partial-success cases.

**Change:** use an explicit batch submission result containing accepted run IDs and failures. Use one supported batch contract or an actual bounded submission loop. Model pending, queued, running, completed, and failed state explicitly; poll the accepted IDs and prevent duplicate submissions while pending.

**Tests:** slow responses, partial enqueue failure, repeated clicks, existing completed runs, more than 100 tasks, and navigation while requests remain unresolved.

### 5. Query limits silently omit work and graph data

References: `web/lib/dreams/activity-queries.ts:51`, `web/lib/dreams/queries.ts`, `supabase/config.toml:18`.

Activity collection caps results at 100, while 37 spaces with three tasks create 111 tasks. Entities are limited to 500; related mentions and documents are not fully paginated. Failed related queries can become empty arrays, making query failures appear as missing data. Large ID lists also increase request size.

**Change:** paginate or aggregate activity around the active batch; batch related entity queries; report query failures distinctly. Make intentional graph limits explicit and retain accurate totals.

**Tests:** more than 100 active tasks, more than 500 entities, more than the API row limit of mentions, and failed mention/document queries.

### 6. Entities metadata miscounts members

Reference: `web/app/(app)/dreams/entities/page.tsx`.

Summing each space's member count counts memberships, so a person in several spaces appears repeatedly. The metadata also needs consistent scope when filtering a space.

**Change:** count distinct visible people within the selected scope and apply the same scope to document and Dream metadata. Preserve access controls.

**Tests:** one person in multiple spaces and a selected-space view.

### 7. Worker claiming creates contention during scaling

References: `supabase/compute/dream/src/dream-queue.ts:21`, `supabase/functions/_shared/jobs/dream_batch.ts`, `supabase/compute/dream/src/dream-worker.ts:75`.

Workers select the oldest queued rows before attempting conditional claims. Conditional updates prevent duplicate execution, but multiple workers can repeatedly select the same candidate. Edge and Compute duplicate the selection logic.

**Change:** share an atomic claim operation using the existing ingestion queue's `FOR UPDATE SKIP LOCKED` pattern. Evaluate a queued-Dream index with query plans. This requires database design review.

**Tests:** concurrent claims process each task once, failures recover, and one versus eleven workers complete the same workload. Faster draining is an expected benefit to measure, not an established speedup from this review.

### 8. Larger corpora exceed bounded Dream inputs

References: `supabase/functions/_shared/jobs/space_writer.ts:120`, `dream_entities.ts:29`, `dream_pass.ts:104`, `dream_digest.ts:46`, `dream_connections.ts:22`.

Entities read at most 400 recent chunks, digests 120, and connections 40 documents. Reads favor the oldest eligible inputs. Repeated runs can revisit the same inputs while later content remains excluded.

**Change:** define resumable work units and checkpoints or pagination. If sampling is intended, state it explicitly. Corpus growth alone cannot demonstrate increased completed work under these caps.

**Tests:** more than 400 eligible chunks and multiple runs eventually processing all intended inputs.

### 9. Entity enrichment repeats model calls

Reference: `supabase/functions/_shared/jobs/dream_entities.ts:258`.

Successful enrichment does not update the in-memory summary flag. The same entity can be summarized in subsequent batches. The documented 25-summary allowance also resets for each batch.

**Change:** return successfully enriched IDs, update the run's known entities, and maintain a run-wide remaining allowance.

**Tests:** repeated entities across multiple 40-chunk batches and more than 25 enrichment candidates. Assert model-call count and output.

## Ingestion, authorization, and accounting

### 10. Chunk replacement can remove graph evidence before success

References: `supabase/functions/_shared/jobs/ingest.ts:150`, `supabase/schemas/50_entities.sql:39`.

Ingestion deletes old chunks before inserting replacements in a separate request. Chunk deletion cascades to entity mentions. Failed insertion leaves neither old chunks nor mentions; successful replacement still removes mentions until another Dream rebuilds them.

**Change:** transactional replacement of chunks and document metadata, with an explicit policy for rebuilding mentions. Review the database change first.

**Tests:** replacement insert failure preserves the old content; successful replacement has the intended mention lifecycle.

### 11. Throttled ingestion leaves unstarted claims running

References: `supabase/functions/ingest-worker/index.ts:19`, `supabase/functions/_shared/jobs/ingest_batch.ts:35`, `supabase/schemas/80_functions.sql:375`.

Edge claims the requested batch before processing it. A throttled result stops further processing, leaving unstarted claims running until the 15-minute recovery. Compute already claims only its immediate concurrency count.

**Change:** claim available execution capacity or release unstarted claims on early termination.

**Test:** batch size 20, concurrency two, first request throttled; unstarted jobs remain eligible for prompt retry.

### 12. Document creation and enqueueing can partially succeed

References: `web/app/(app)/documents/actions.ts:55`, `supabase/functions/mcp-server/tools/add_note.ts:59`, `supabase/functions/_shared/jobs/sync.ts:129`.

Document creation and job creation happen separately. Queue failures can leave documents without ingest jobs; retries can duplicate uploads or documents.

**Change:** share a transactional, idempotent document-and-job operation with explicit storage cleanup on failure. Keep authentication and provider adapters outside this operation.

**Tests:** failure and retry at each storage, document, and job step produces one ingestible document.

### 13. Malformed provider responses can become empty documents

References: `supabase/functions/_shared/sources/common.ts:107`, `supabase/functions/_shared/sources/notion.ts:239`.

Successful HTTP responses with invalid JSON return null, and adapters can substitute empty fields. Ingestion can accept empty replacement content.

**Change:** throw a retryable source error and validate required response fields before replacing content.

**Test:** an existing valid document followed by HTTP 200 with malformed JSON preserves the old content and records a retryable failure.

### 14. Failed model parsing loses token accounting

Reference: `supabase/functions/_shared/model_client.ts:164`.

Reported usage is discarded when application response parsing throws; error accounting records zero tokens.

**Change:** retain provider-reported usage independently of content validation.

**Test:** truncated completion with nonzero usage records the actual tokens and a failed result.

### 15. Forbidden requests consume a space's quota

Reference: `supabase/functions/dream-run/index.ts:17`.

Space rate limits are consumed before membership is verified. An authenticated caller with another space's ID can exhaust that space's allowance.

**Change:** retain user throttling before authorization; consume space quota only after membership passes.

**Test:** forbidden calls leave the target space's quota unchanged.

## Other frontend recovery issues

### 16. Chat can remain busy after a stream failure

References: `web/components/chat/conversation-view.tsx:31`, `web/lib/chat/client.ts:37`.

Rejected transport operations lack a complete error path. Stream EOF without a terminal event does not clear the asking state. Reader cleanup and cancellation need explicit ownership.

**Change:** always emit a terminal result, release the reader in finally, and support cancellation on unmount.

**Tests:** rejected fetch, rejected read, premature EOF, retry, and leaving a conversation during streaming.

### 17. Signed-out password recovery is blocked

Reference: `web/lib/supabase/middleware.ts:9`.

The public-route list excludes `/forgot-password`. `/update-password` should retain its recovery-session requirements.

**Change and test:** allow the exact password-request route for signed-out visitors and verify the recovery flow end to end.

### 18. Upload state and resource cleanup need one owner

References: `web/components/documents/upload-dialog.tsx:81`, `web/hooks/use-supabase-upload.ts:65`.

The dialog can show completion before ingestion enqueue succeeds. Exceptions can leave loading active; up to 50 uploads run concurrently. Preview object URLs are not revoked on removal, reset, or unmount. The hook also retains rejected files alongside accepted files; current UI validation reduces exposure, but the hook should enforce its own upload contract.

**Change:** per-file states for validation, upload, enqueue, completion, and retry; bounded concurrency; finally cleanup; revoke preview URLs.

**Tests:** enqueue failure after upload, thrown transport error, validation failure, retry, concurrency cap, and object URL cleanup.

### 19. Analytics silently omits later messages

Reference: `web/lib/analytics/queries.ts:106`.

An ascending query takes only the oldest 1,000 messages. Larger datasets lose later activity.

**Change:** aggregate in the database or paginate all relevant records.

**Test:** more than 1,000 messages spanning the reporting period.

## Seeders and release checks

### 20. Seed retries cannot repair incomplete or changed records

References: `scripts/seed-corpus.mjs:353`, `scripts/seed-dreams.mjs:140`.

Corpus seeding skips an existing external ID before comparing content or ensuring a job exists. A document created just before interruption can remain unprocessed permanently. Dream-history seeding skips an entire night if any run exists, leaving partially created history unrepaired.

**Change:** compare content hashes, ensure the expected ingest job, and upsert deterministic fixture identities per item. Use transactions where appropriate.

**Tests:** interruption after each persistence step and reruns after a source document changes.

### 21. Seed completeness and drain success are unreliable

References: `scripts/seed-dreams.mjs:105`, `scripts/seed-demo.mjs:203`.

Dream fixtures request up to 2,000 documents without pagination despite the local API's 1,000-row cap; missing references are silently filtered. Drain logic can stop after zero claims or a pass limit and still report success. Its work is not scoped to the target organization.

**Change:** paginate, reject unresolved fixture references, scope draining, and return explicit remaining queued/running/failed counts. Fail when the requested drain is incomplete.

**Tests:** corpus above API limits, missing references, stalled workers, exhausted pass limit, and another organization's jobs.

### 22. Default seeding mixes source data with synthetic Dream results

References: `scripts/seed-demo.mjs:350`, `scripts/seed-dreams.mjs:200`.

The default seed invokes synthetic Dream history and successful activity records. Those records can be mistaken for work performed by the current demo.

**Change:** separate source-only initialization from an explicit history-fixture option. Document both commands and expected results.

**Test:** source-only initialization has documents ready to process and no fabricated Dream runs or usage.

### 23. Corpus checks skip the added document bodies

References: `scripts/check-corpus.mjs:24`, `scripts/generate-demo-corpus.mjs:38`.

The repetitive generator was removed when the Launch Week corpus replaced its output.

Content validation enumerates the original seven folders and misses 360 documents added for the new spaces. The generated documents also repeat closely related templates.

**Change:** use one shared corpus manifest for generation, seeding, and validation. Validate every body, dates, references, and intended cross-space connections. Increase content variety where it affects the keynote workload.

**Tests:** a malformed document in any added space fails validation; expected cross-space references resolve.

### 24. Deployment and regression checks are disconnected

References: `.github/workflows/deploy.yml`, `.github/workflows/light-gate.yml`, `scripts/gate.mjs:22`, `scripts/workflow-contract-check.mjs`.

Main-branch deployment and the light gate run independently. Compute, rehearsal, and demo-space tests are absent from the gate. Browser coverage requires separate execution; the new graph test verifies conversion, not visible rendering.

**Change:** require the relevant checks for the exact commit before deployment. Add worker, seed, and focused browser regressions to appropriate automated gates, including a production-build graph smoke test. Update workflow contract checks to allow that policy.

**Tests:** a failing worker or graph regression prevents release; successful deployment runs a visible graph/navigation smoke check.

### 25. Setup documentation has drifted

Reference: `README.md:134`.

Corpus and history counts are stale, and no-op rerun claims do not describe partial failures or date-shifted fixtures.

**Change:** document actual seed modes, dynamic counts, retry behavior, required checks, and what release verification proves. Generate counts from the manifest where possible.

## Module boundaries to keep and improve

Keep the existing provider contracts, dependency-injected job functions, separate Dream passes, authenticated action wrapper, query/view-model separation, and RLS-aware reads. They already make targeted changes possible.

Extract the graph builder from the React renderer; separate renderer sizing/theme lifecycle from graph updates. Give Dream submission and activity tracking one explicit state model. Share atomic queue claiming across Edge and Compute. Share document/job persistence across uploads, sync, and MCP. Split the space writer's reads from transactional writes when implementing those changes. Share corpus configuration across seed and validation tools.

Do not split files solely to meet a line count or introduce a generic job framework. Reduce repeated logic and clarify ownership when fixing the behavior above. Coalesce connection-sync refresh events as a smaller follow-up after the main refresh problems are resolved.

## Validation and release status

Before this review, the graph branch passed the complete 16-step light gate, including application/function tests, formatting, lint, types, corpus checks, and production build. The real Chromium color regression and focused graph-data test also passed. These results do not validate the proposed refactors.

The first graph repair commit is already on its feature branch. The transparent-background follow-up is committed locally. The follow-up push was stopped at the user's request. No graph repair PR has been merged, and production visual verification remains open.

This review changed documentation only. Implement the prioritized repairs in small changes, each with the failure cases listed above, before treating the broader cleanup as complete.

## Implementation follow-up

The numbered findings above describe the reviewed baseline. The repair branch now implements the following changes; release and live rehearsal verification are tracked in `tasks/todo.md`.

| Findings | Implemented repair                                                                                                                                   | Verification                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–2      | sRGB conversion, transparent background, measured container sizing, document-ID graph indexing, retained node positions                              | Real Chromium visible-pixel tests in both themes, exact background comparison, duplicate-title and large-graph regressions; local browser visual check |
| 3–6      | Incremental graph endpoint, bounded HTTP submission, accepted-run tracking, paginated reads, one latest Dream per space, distinct-member counts      | Component/API/query regressions; nested query exercised against local PostgREST                                                                        |
| 7–9      | Atomic concurrent claims, complete eligible-input paging with bounded batches, run-wide enrichment allowance                                         | Eleven workers claim 33 distinct jobs over real HTTP; 441-document extraction regression; summary call-count tests                                     |
| 10–15    | Atomic chunk/document/job writes, capacity-sized claims, retryable malformed responses, accurate failed-call usage, authorization before space quota | Database rollback/idempotency tests and provider/worker regressions                                                                                    |
| 16–19    | Chat stream recovery/cancellation, password-request routing, upload lifecycle/concurrency/cleanup, complete analytics reads                          | Frontend recovery and pagination tests                                                                                                                 |
| 20–23    | Repairable source seeding, deterministic optional history fixtures, scoped latest-attempt drain checks, validation of every corpus body              | Seed/corpus regression tests; live source-seed verification tracked separately                                                                         |
| 24       | Same-commit CI dependency, worker/seed/rehearsal/graph checks, Edge-only deployment, Vercel production promotion requirement                         | Workflow contract tests and configured production deployment check; first release still to be verified                                                 |
| 25       | Correct source-only setup instructions and linked Compute positioning evidence                                                                       | Documentation review against scripts and current Slack/Linear research                                                                                 |

The full 20-step light gate passed during implementation, including the production build. Backend verification passed 626 Deno tests, 12 Compute tests, 264 database assertions, and 10 HTTP integration tests. Further changes receive focused checks and a final combined gate before release. A test result is not a hosted throughput measurement. The live demo must still prove its actual output, worker readiness, and OAuth client behavior.

Post-repair graph construction on the same sparse synthetic shape took 0.79 ms at 100 entities, 0.92 ms at 250, 1.69 ms at 500, and 2.50 ms at 1,000. These are local single-run timings, useful for identifying the removed cost rather than promising browser throughput.

The live local source seed reconciled 564 documents with zero queued, running, failed, or timed-out latest ingestion attempts. Historical failed attempts remain as history after successful retries. Dream-run count stayed unchanged, confirming source-only seeding did not add synthetic Dream history. Seven Chromium application journeys passed, including navigation and reload while submission was delayed.

Final local verification passed the full 20-step light gate with nothing skipped. A real application Dream completed all three tasks and saved eight entities, 88 source mentions, 18 document links, and a digest. Navigation to Entities remained responsive during submission. The OAuth smoke test passed dynamic client creation, S256 PKCE code exchange, MCP discovery/tool execution, and cross-organization search isolation using the OAuth-issued token. Fixtures were removed afterward.

Final review also found and fixed a completion race: entity refresh now reads job activity before entity evidence, so its last response includes writes committed before completion. A regression failed before the fix and passed afterward.

The release baseline is Edge-only. Compute remains a manual demo operation: pause new Edge claims, finish current work, deploy one Compute instance, then scale to eleven. CI builds and tests the Compute code but never deploys it. Source ingestion remains real and must finish before production promotion.

The Edge-only local check completed entity extraction, document linking, and a digest against 12 source documents with the Compute process stopped. Task execution was sequential, and navigation to Entities completed while processing continued. A development-server reload interrupted the first digest attempt; that attempt remains recorded as timed out, and its explicit retry succeeded. Production preparation removed the old eight-instance Compute service and cleared generated Dream data while preserving 1,333 source documents, 37 spaces, and seven members. No new Compute instance was deployed.
