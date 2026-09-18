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
