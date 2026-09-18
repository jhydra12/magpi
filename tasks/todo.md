# Session queue, 2026-09-17 evening: Magpi on BYO-MCP

- [x] Hosted project: OAuth server on, dynamic registration on, consent path /oauth/consent
- [x] Function: compose with the block's `pipeline` and read MCP_SERVER_NAME / _DESCRIPTION
      from env, with Magpi's defaults. Keep the five tools, rate limit, model runner, notes.
- [x] Consent page: use the library block's `useOAuthConsent` hook; keep Magpi's UI on the tokens
- [x] Prove it: discovery chain, dynamic client registration, authorize URL, against hosted
- [x] Gate, PR, merge, rebase the three demo branches

## Review

PR #5 merged and deployed. The hosted MCP server answers on the block's pipeline
composition, the OAuth chain on the hosted project works end to end (discovery,
dynamic registration, authorize redirect to /oauth/consent), and the consent page
runs on the library's hook. docs/demo.md is the run sheet, with step 9 written,
and the same text is the first toggle under Theme 1 in Notion. README cut to
what Magpi is, how to run it, the demo accounts, deploying, tests. The three demo
branches are rebased on this main.

## Ingestion on Compute

- [x] Trace ingestion, credentials, atomic queue claims, and scheduling.
- [x] Package the existing ingestion code for the Node 2 GB Compute instance.
- [x] Add continuous polling with bounded concurrency and retry delays.
- [x] Verify the worker, deploy it, and retire the ingestion cron.
- [x] Verify hosted ingestion and document deployment and rollback.

### Ingestion review

Deployed to `compute-demo` on `vvfegdrzrzjyekvrfyoj`. A temporary upload completed
in one attempt and produced one embedded chunk; Compute reported one success and
zero failures. Removed the temporary document, job, chunks, and storage object.
Migration `20260917235000` removed the ingestion cron; source sync and nightly
dream queueing remain scheduled. Five worker tests and 28 shared ingestion tests
pass, along with type checking, Node-appropriate lint, and schedule validation.
Deployment and rollback instructions are in `docs/ingestion-compute.md`.

## Deploy ingestion as dream

- [x] Check hosted queue schema, schedules, and existing Compute deployments.
- [x] Name the Node ingestion deployment `dream` with 2 GB and update build commands.
- [x] Run worker tests, build, and deploy to the linked project.
- [x] Verify health and a temporary ingestion job; confirm ingestion cron is retired.
- [x] Record current deployment evidence and cleanup.

### Dream deployment review

On 2026-09-18, deployed the existing ingestion worker as `dream` on
`vvfegdrzrzjyekvrfyoj`: Node, 2 GB, one live and ready instance, image `5.0`.
Public health returned 200. Authenticated status reported one successful job
and zero failures after a temporary upload produced one embedded chunk in one
attempt. Unauthenticated status returned 401. Removed the temporary document,
job, chunks, and storage object.

All five Compute worker tests and 44 shared ingestion, batch, and claim tests
passed. The bundle build, formatting, diff whitespace check, and schedule
validation passed. Hosted migration `20260917235000` was already applied;
the only active cron jobs are source sync and nightly dream queueing.
This deployment runs ingestion; dream processing remains separate.

## Dream log on the dreams page

- [x] Group runs into nightly dreams per space: time taken, documents ingested, connections made.
- [x] Read dream link counts for the listed runs under the caller's RLS.
- [x] Replace the Runs list with a dream log table that still links to each run.
- [x] Tests for the grouping, the query, and the table; typecheck and lint.
- [ ] Cap dream digests in public.search so rehearsal digests cannot fill the passage budget; migration, pgTAP, docs.
- [x] Swap the local Supabase stack from Future Nerds to this app.

### Dream log review

The Runs list on the dreams page is now a dream log: one row per space per
night with the time the night took, the documents that came in that day, the
connections made, a status, and links to the three passes. `buildNightlyDreams`
in `web/lib/dreams/nightly.ts` does the grouping; the page reads dream link
counts under the caller's RLS to count connections.

`public.search` now caps dream digests at a quarter of `match_count`, so a week
of nightly digests, or an afternoon of rehearsals, cannot fill the chat's twelve
passages and push out the source that states a fact. Migration
`20260918143500`, pgTAP `21_search_dream_cap`, and docs/retrieval.md cover it.

Verified: web unit tests, typecheck, lint, pgTAP for search. Five pgTAP
assertions in 10_space_isolation, 12_admin and 60_functions fail locally on
anon grants; the local image's default privileges grant anon on every new
table, which predates this work and is not run in CI. The migration is not yet
applied to the hosted project.

## Dream log, second pass

- [x] Keep a dream from reading an earlier dream's output in the collect stage.
- [x] Delete the rehearsal digests from the hosted project.
- [x] Add who started the night, what it wrote, connections found and confirmed, and model tokens.

### Second pass review

The log now reads Night, Space, Started by, Time, Documents ingested,
Connections made, Model tokens, Wrote, Status, Passes. Started by is "Nightly"
for the schedule, "You" for the reader, "A member" otherwise, so no address
lookup is needed. Model tokens sum the dream and extract model calls that
happened while one of the night's passes was running; the column is only
shown to organization admins, since model_calls is admin-only under RLS.
Wrote links to the digest document. The hosted project has no dream runs,
links or dream documents left; the corpus is 196 documents and 299 chunks.
Reseed before recording so the corpus is inside the dream's 24 hour window.
