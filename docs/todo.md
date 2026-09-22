# Digital Brain: progress ledger

One ledger, checkable items. A phase is done when it works end to end, has a
test, and is committed.

## Phase 1: Scaffold

- [x] pnpm workspace, Node 22, `.nvmrc`
- [x] Next 16 App Router in `/web`
- [x] Doppler project `supabase-recall-demo`, `doppler.yaml` pinned
- [x] Supabase design tokens vendored, `scripts/sync-tokens.mjs`, UPSTREAM SHA
- [x] Theme switching with `next-themes`, three themes, `data-theme` on `<html>`
- [x] `supabase/schemas/` declarative model, first generated migration
- [x] Storage policies and realtime publication as hand-written migrations
- [x] Generated database types committed
- [x] vitest with coverage thresholds
- [x] Gate scripts, workflow contract check, light gate in CI
- [x] Supabase agent skills installed at project scope
- [x] shadcn initialised against the Supabase Library registry
- [x] `impeccable` skill at `.agents/skills/impeccable`
- [x] Table privileges declared in `95_grants.sql`
- [x] Function and column privileges as a hand-written migration
- [x] Raw color check, and the gate step that runs it

## Phase 2: Auth and organizations

- [x] `password-based-auth-nextjs` and `social-auth-nextjs` blocks
- [x] Sign up, sign in, callback, sign out
- [x] Org and personal space created by a trigger on signup
- [x] Invite and accept
- [x] Auth lifecycle journey in Playwright

## Phase 3: Spaces

- [x] Personal auto-created, team and org spaces
- [x] Membership management
- [x] pgTAP proving isolation, 170 assertions across nine files

## Phase 4: Upload and ingest

- [x] `dropzone-nextjs` to Storage
- [x] Extract, chunk, embed, write chunks
- [x] Realtime progress and visible failures
- [x] Jobs claimed atomically, attempts capped, stale claims taken back
- [ ] Edge Function ceiling measured, written into `docs/limits.md`

## Phase 5: Search

- [x] Hybrid search RPC
- [x] `hnsw.iterative_scan` on the function, measured 0 of 5 against 5 of 5
- [ ] Digital Brain measured at 10k, 100k, 1M with a 1 percent filter, in `docs/retrieval.md`

## Phase 6: Chat

- [x] Streaming route handler, citations resolved on read
- [x] Question condensing, conversation titling, history sidebar
- [x] Two-user permission lifecycle journey
- [x] Dropped-connection test: the question survives, no orphaned answer

## Phase 7: Connections

- [x] OAuth flow ported from the magpi badge project: begin, callback, claim
- [x] Notion end to end, against recorded fixtures

## Phase 8: Remaining providers

- [x] Linear
- [x] Slack
- [x] Google Drive, with the registry pinned to `seed.sql`

## Phase 9: Token refresh and incremental sync

- [x] `refresh()` called, tested against an expired token
- [x] Cursors per provider
- [x] Connection status visible, with a display name rather than a slug

## Phase 10: Dreaming

- [x] Entities
- [x] Digest
- [x] Connections
- [x] Per space, enforced by composite foreign keys rather than convention
- [x] Cited through `source_chunk_ids`, visible, switchable off

## Phase 11: Admin analytics

- [x] Ingest health, search volume and latency, top questions, dead content, usage
- [x] Storage metered through usage_events rather than a scan

## Phase 12: Billing

- [x] Checkout and portal as route handlers
- [x] Plan limits enforced in the database
- [x] Webhook: price id read, intent first through `metadata.plan`, then price
- [x] Webhook: schemas widened to Stripe's real payload shapes

## Phase 13: MCP stub

- [x] `supabase/functions/mcp-server/` with `whoami`, `docs/mcp.md`

## Phase 14: Polish

- [x] Sample corpus, 70 documents across five sources and five spaces
- [x] Deploy config and cron entries
- [x] README
- [x] Five-minute clone-to-answer path, `scripts/seed-demo.mjs`

## Blockers

**Two measurements, and both are keynote slides.** Neither can be done tonight
and neither is guessable.

The Edge Function ceiling. Every row in the table in `docs/limits.md` reads
`not measured`. It needs the real runtime and a real corpus, and the local
runtime does not enforce the same budgets. The product is built to hit this
wall visibly: a timed-out job names the stage it died in, the run page leads
with it, and the copy says a space this size is expected to fail. What is
missing is the number.

Digital Brain at scale. `docs/retrieval.md` has the method written down and no
numbers, at 10k, 100k and 1M chunks with a filter matching 1 percent of rows.
What is settled is the correctness: `hnsw.iterative_scan` is on the function
because with it off a caller got zero of their own five rows. What is not
settled is the cost. No latency claim goes on a slide before that table has
values in it.

## The search flake, resolved by moving the question

`20_search.test.sql` asserted that a caller still gets their own rows back once
`hnsw.iterative_scan` is on. It failed about one run in three inside the full
gate and passed every time it was run in isolation: 12 direct runs, 6 through
the CLI runner, 3 under deliberate machine load, 4 under `doppler run`, and 3
after the browser and integration suites, with no failures in any of them.

Ruled out by measurement, not by reasoning: a non-deterministic fixture (it is
fixed vectors and fixed ids), machine load, the `doppler` environment, gate
ordering, and accumulated test data. That last one turned up a real bug on the
way. Forty-one orphaned organizations had built up, because deleting an auth
user cascades their personal space and their memberships and leaves the
organization standing. Both suites now clean up after themselves, and the flake
survived the fix.

The cause is the tier. A pgTAP file is one transaction that rolls back, so the
thousand rows are inserted and queried without ever being committed, which is
not how the index is used in production. Asking an approximate index for a
guarantee about uncommitted entries is a question it does not answer.

The assertion is now deterministic: `public.search` carries
`hnsw.iterative_scan = relaxed_order` in its `proconfig`. That catches the
regression that matters, somebody removing the setting, and it is verified in
both directions. Four consecutive full-gate runs, no failures.

The behavioural numbers belong in `docs/retrieval.md` against a committed corpus
at 10k, 100k and 1M, which is already a named task and already blocked on the
same measurement. That is the same argument the suite accepted for not testing
the worker timeout path from pgTAP: a property that needs committed data does
not belong in a rolled-back transaction.

## Known gaps, recorded rather than discovered later

**Page components have only browser coverage.** `app/**/page.tsx` and
`layout.tsx` are excluded from the coverage report because vitest has no RSC
runtime and a test there could only assert that a function returns a promise.
Their real coverage is three Playwright journeys across fourteen routes, which
is thin. A green coverage gate does not mean the pages are tested.

**Entry-point wrappers under `supabase/functions/*/index.ts` have no direct
tests.** The job bodies they call are tested thoroughly without a server, which
is the split section 7 asks for, but the wrappers themselves are not. The three
newest, `connections-scopes`, `connections-sync` and `dream-run`, carry more
branching than the earlier ones.

**Google Drive does not index binary files.** The driver exports Google-native
documents and downloads text types; a PDF in Drive raises "that file type is not
indexed yet". `extract.ts` already handles PDFs on the upload path, so wiring
Drive into it is a small follow-up rather than new work.

**Four function files are over 300 lines.**

## Post-demo

Things deliberately out of scope for "done", recorded so they are not
rediscovered as gaps.

- Penetration testing, SOC 2 controls
- SSO and SCIM
- Abuse and rate limiting beyond the per-user windows already specified
- i18n beyond a string catalog
- Accessibility beyond what the Supabase components give us
- Load targets above what the keynote needs
- **Google Drive does not index PDFs or other binary files.** The driver exports
  Google-native documents and downloads text types; anything else raises "that
  file type is not indexed yet". Binary extraction already exists in
  `supabase/functions/_shared/extract.ts` and serves the upload path, so closing
  this is wiring the Drive driver into it rather than new work. Left out because
  Drive's export endpoints answer with text and the download path answers with
  bytes, which is a second response shape in a driver that otherwise has one.
