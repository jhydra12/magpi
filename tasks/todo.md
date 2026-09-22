# Demo admin reset

- [x] Define the reset scope and deletion order for demo-created dream data.
- [x] Add an admin-only reset action and Demo page.
- [x] Add Demo to the admin navigation below Billing.
- [x] Verify the action and page with focused checks and browser validation.

## Review

- Typecheck and lint pass; the authenticated browser shows Demo below Billing with the red Reset button. The action was not clicked during verification.

# Repair production demo reset

- [x] Add an explicit chat-history deletion stage to the reset flow.
- [x] Add regression coverage for chat deletion and reset-stage ordering.
- [x] Run the focused and release checks.
- [x] Deploy the missing execution-mode migrations and verify the production reset RPC.

## Review

- Production was missing the execution-mode and transactional queue migrations because the deploy workflow stopped at the outdated Supabase CLI action before `supabase db push`. The migrations were applied manually, production returned to Edge mode, and the queued Dream completed.
- The deploy action now uses the current setup action, and the reset includes conversation and folder deletion after workers pause.

# Connected Dream graph

- [x] Add bridge documents to the company corpus and seed them into the demo organization.
- [x] Write entity discoveries in batches so the graph can update during a run.
- [x] Merge matching entities across spaces in the graph.
- [x] Verify the entity worker tests, web typecheck, and connected hosted data.

## Review

- Eight bridge documents were added and ingested. The hosted entity data now resolves to one merged graph component.

# Expand the demo corpus

- [x] Define 30 additional team spaces, membership, document templates, and cross-space links.
- [x] Generate and manifest deterministic corpus documents for the 30 spaces.
- [x] Update seed and reset flows so the expanded demo is repeatable and scoped to the demo organization.
- [x] Update global Dream submission and rate limits for the expanded space count.
- [x] Add tests for space counts, document routing, cross-space links, and global Dream submission.
- [x] Reset and seed the hosted demo organization, then verify ingestion readiness.

## Review

- The hosted demo now has 37 spaces, 1,333 source documents, 1,788 chunks, and 1,333 successful ingest jobs. The 30 new spaces each have 12 documents across four providers.

# Simplify Spaces and Entities

- [x] Remove organization-wide membership copy and hide Spaces from the main navigation.
- [x] Add document, member, and latest Dream metadata to the Entities view.
- [x] Run focused tests, lint, and typecheck.

## Review

- Spaces is hidden from the main navigation. Entities now shows aggregate document and member counts plus the latest completed Dream time in UTC.

# Repair production graph rendering

- [x] Reproduce production renderer error and convert every graph color to sRGB bytes.
- [x] Size the canvas to its container and remove fixed positioning offsets.
- [x] Add real-browser color regression coverage and verify production in both themes.

## Review

- The production browser check paints visible nodes and links in Light and Dark themes, reports no page errors, and returns to Chat successfully. The test uses a disposable account and removes it after the run.

# Whole-codebase review before release

- [x] Audit frontend routes, state, queries, and component boundaries.
- [x] Audit backend jobs, queues, auth, database queries, and shared modules.
- [x] Audit seeders, tests, CI, dependency use, and deployment configuration.
- [x] Analyze Dreams submission, graph construction, rendering, and refresh costs.
- [x] Consolidate findings into a prioritized cleanup plan with validation requirements.
- [x] Keep review changes local; production graph verification remains pending release.

## Review

- Recorded 25 findings, measured graph construction, and ordered focused repairs in `docs/codebase-review-2026-09-19.md`.
- Audit covered application, workers, database definitions, seeders, and release tooling. Live database performance and schema parity were not verified.
- Review changed documentation only. Follow-up push remains stopped; graph deployment and visual verification are still pending.

# Implement all codebase review findings

- [x] Fix and verify review finding 1.
- [x] Fix and verify review finding 2.
- [x] Fix and verify review finding 3.
- [x] Fix and verify review finding 4.
- [x] Fix and verify review finding 5.
- [x] Fix and verify review finding 6.
- [x] Fix and verify review finding 7.
- [x] Fix and verify review finding 8.
- [x] Fix and verify review finding 9.
- [x] Fix and verify review finding 10.
- [x] Fix and verify review finding 11.
- [x] Fix and verify review finding 12.
- [x] Fix and verify review finding 13.
- [x] Fix and verify review finding 14.
- [x] Fix and verify review finding 15.
- [x] Fix and verify review finding 16.
- [x] Fix and verify review finding 17.
- [x] Fix and verify review finding 18.
- [x] Fix and verify review finding 19.
- [x] Fix and verify review finding 20.
- [x] Fix and verify review finding 21.
- [x] Fix and verify review finding 22.
- [x] Fix and verify review finding 23.
- [x] Fix and verify review finding 24.
- [x] Fix and verify review finding 25.

- [x] Run combined application, worker, database, seed, browser, lint, type, and build checks.
- [x] Verify real Edge processing and OAuth BYO MCP; test the manual Compute cutover without deploying it.
- [x] Commit reviewed changes and leave the working tree clean.

## Cleanup review

- All 25 findings have implemented repairs and regression evidence in `docs/codebase-review-2026-09-19.md`.
- The final local 20-step gate passed with no skipped checks; database, HTTP integration, browser navigation, real Dream output, and OAuth MCP checks also passed.
- Production source reconciliation now follows migration and Edge Function deployment. Compute deployment remains a manual demo action. Release promotion waits for the same commit to complete that sequence.
- Deployed graph visibility and the first gated production release remain the final verification steps.

# Restore the Edge-only opening state

- [x] Process queued Dreams on Edge Functions with one active task and durable wakeups; keep submission and navigation responsive.
- [x] Remove automatic Compute deployment from CI and keep source ingestion on Edge in the initial state.
- [x] Document and test an explicit handover from Edge to one Compute instance, followed by eleven instances.
- [x] Verify all three Dream outputs locally with the Compute process stopped.
- [ ] Release the Edge-only baseline, remove the previously deployed Compute service, and verify production graph and processing.

## Full demo reset

- [x] Pause workers and wait for active work before deleting Compute.
- [x] Verify Compute is absent before clearing generated data and restoring Edge.
- [x] Show actual reset stages, success and failure icons, and the completion toast.
- [x] Test reset behavior and configure server-only management access.

Reset verification: focused UI, action, and management API tests pass; 287 database assertions and 10 integration tests pass. Production build passes. Server management access is configured as a production secret; deployed reset verification remains pending.

# Improve the Digital Brain entity graph

- [x] Make the graph frame adapt to short and narrow viewports; fit the camera on first render and after size changes.
- [x] Add a compact category and relationship legend plus keyboard- and touch-accessible entity selection and details.
- [x] Replace the timed arranging overlay with status based on active Dream state and persisted graph counts; keep node positions during refresh.
- [x] Align graph colors with theme tokens and verify rendered pixels, layout, and browser errors in both themes at desktop and mobile sizes.
- [x] Run focused tests, lint, typecheck, and production build; record evidence for each improvement.

## Review

- Completed on `improve-digital-brain-graph` in four commits, one for each graph improvement.
- The web suite passed: 1,281 tests across 141 files. Web lint had no errors and seven warnings in unrelated files.
- The production build and web typecheck passed. The color-token check passed.
- Three real-browser graph tests passed, including color conversion, visible pixels, responsive sizing, entity selection, and no page errors in Light and Dark at desktop and mobile sizes.

# Restore the missing worker migration

- [x] Read the remote migration record and compare it with the live function definition.
- [x] Restore the exact recorded migration file and verify local and remote histories match.
- [x] Run the project gate and merge the fix.
- [ ] Verify the Supabase deploy workflow after restarting its stalled hosted gate.

## Review

- The merge deployment failed because remote migration `20260919230000` was absent from the repository. Restored its exact recorded SQL and confirmed its live function definition matches.
- `supabase migration list --linked` now shows every local and remote migration in sync. A separate dry run was blocked by a temporary database connection circuit breaker and made no changes.
- The post-merge deploy run stopped reporting progress in its 15-minute light-gate job for over an hour; it is being restarted before migration deployment can be confirmed.

# Reset all Compute services

- [x] Trace the reset action and confirm it only deletes the service named `dream`.
- [x] Delete every service returned by the Compute management API and wait until none remain before clearing data.
- [x] Add tests for multiple services, in-progress deletions, and retry behavior.
- [x] Run the project gate and verify the reset checklist wording.
- [ ] Create and merge the fix PR.

## Review

- Reset must remove every named service in this demo project before deleting generated data or restoring Edge execution.
- Every locally available light-gate check passed, including the production build; all 23 focused reset tests passed.
- Do not invoke the live reset while testing this change.

# Rename the demo to Digital Brain

- [x] Replace the displayed product name across the app, prompts, emails, tests, and docs.
- [x] Keep the existing magpie logo and internal compatibility identifiers.
- [x] Run focused tests and check the live app in the browser.

## Review

- The app now displays Digital Brain while retaining the magpie logo and internal compatibility names.
- The web suite passed 1,323 tests, the function suite passed 639 tests, and lint, type checks, and the production build passed. Lint reported seven existing warnings and no errors.
- Browser verification confirmed Digital Brain appears in the app sidebar with the existing logo.

# Apply the accepted demo edits

- [x] Rewrite the existing Notion demo script with all eight accepted changes and the single Copple prompt.
- [x] Rename the Dreams controls to `Process all` and `Process` and update their tests and demo instructions.
- [x] Make a full demo reset seed a deterministic mixed Dreams state: several red `Timed out` rows and successful green rows finished at 6:01am UTC on the reset date.
- [x] Run focused tests, verify the reset-state rendering, and check the control labels in the browser.
- [x] Make `Reset dreams` recreate the same mixed red and green starting state while preserving Compute services.
- [x] Give successful reset rows sequential completion times with gaps below the Edge worker's five-minute budget.

## Review

- The Notion section now removes the terminal scaling and optional diff, joins Compute to MCP, uses the simplified permissions explanation, and ends with the exact Copple prompt and close.
- A full reset now adds three finished timeout rows plus successful rows timestamped at 6:01am UTC. Timeout labels and tracks are red; successful labels and tracks are green.
- The Dreams page now shows `Process all` and `Process`. Browser verification confirmed both labels in the running app.
- The web suite passed 1,327 tests. Lint completed with the same seven existing warnings, and type checks and the production build passed. The final focused suite passed 46 tests.
- The live reset was not invoked during verification because it deletes every Compute service and all generated Dream data.
- `Reset dreams` now recreates the same mixed state while preserving Compute services and restoring the processor mode it was already using.
- The web suite passed 1,329 tests after this addition. Lint completed with the same seven existing warnings, and type checks and the production build passed.
- Successful reset rows now finish one minute apart beginning at 6:01am UTC. Each seeded success lasts 30 seconds, below the Edge worker's five-minute budget. The focused reset and rendering suite passed 51 tests, and type checking passed.
