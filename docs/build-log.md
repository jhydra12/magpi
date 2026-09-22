# Build log

One entry per phase: what shipped, what did not, what needs a human, how long it
took. First thing read in the morning.

## Phase 1: Scaffold

**Shipped.** pnpm workspace with `web` as the only Node package. Next 16 App
Router. Supabase design tokens vendored from `supabase/supabase` at
`83c33e903c` by `scripts/sync-tokens.mjs`, with the SHA in
`web/styles/supabase/UPSTREAM`. Three themes through `next-themes` on
`data-theme`. The whole declarative schema in `supabase/schemas/`, the generated
initial migration, storage policies and realtime publication as hand-written
migrations. Generated types committed. vitest with the spec's coverage
thresholds. Both gates, the workflow contract check, the raw color check, and
the light gate in CI. Doppler project `supabase-recall-demo` created and pinned.

**Did not ship.** Nothing.

**Needs a human.** Nothing.

**Notes.** Local Supabase ports moved to 552xx because a stack for another
project was already on 543xx. Both run at once.

## Phase 2: Auth and organizations

**Shipped.** The `password-based-auth-nextjs` and `social-auth-nextjs` blocks,
reorganized into an `(auth)` route group with one shared shell. GitHub social
sign-in alongside the password form. The Library's client split kept as the
canonical version, with the generated `Database` generic added. A trigger gives
every new user an organization, a personal space and an org space. Two Playwright
journeys.

**Did not ship.** Organization invite and accept. The `org_invites` table and its
policies exist; the UI is with the admin surface.

**Needs a human.** Nothing.

**Notes.** The shadcn primitives were rewritten onto the Supabase semantic tokens
before entering the tree, as the spec requires. `Card` lost its shadow, since a
border plus a soft wide shadow on one element is a banned pattern.

## Phase 3: Spaces

**Shipped.** Personal, team and org spaces with membership, the space list and
detail screens, the per-space dreaming switch, and 170 pgTAP assertions across
nine files covering signup, space isolation, conversations, admin access,
search, dreaming, plan limits, storage and function privileges.

**Did not ship.** Nothing.

**Needs a human.** Nothing.

**Notes.** pgTAP earned its place twice on the first run. It found that every
policy in the repo was unreachable because `supabase db diff` had stripped the
DML grants, and that every security-definer function was executable by PUBLIC
because the diff emits grants and never revokes. Both are written up in
`docs/lessons.md`.

## Phases 4 to 12, in parallel

Six workstreams ran at once against a shared tree, partitioned by directory.
That worked, and the two things that went wrong were both mine: a `git add -A`
that swept three workstreams into one commit, and `typedRoutes`, which broke
every dynamic href across three of them at once.

**Shipped.** Upload and ingest with visible failures. Hybrid search. Streaming
chat with citations resolved on read. Connections and dreams surfaces. Admin
analytics with five panels. Checkout, portal and plan limits. The MCP stub. 436
web tests, 183 pgTAP assertions, 7 integration assertions, 3 browser journeys.

**Did not ship.** The Stripe webhook has four parsing bugs, one of which puts
every paying subscription on the Team plan. The sample corpus is being written.
Nothing is measured yet.

**Needs a human.** Real OAuth credentials, a Stripe account, and the two
measurements: the Edge Function ceiling and recall at scale.

**Notes.** pgTAP earned its place four times. It found that every policy was
unreachable, that every security definer function was executable by anon, that a
dream run could write into a space it did not own, and that the fix for the
third broke deleting a dream output. The fourth is the one worth remembering:
the assertions that caught the regression were written before the bug existed.

The database now reports no drift. `supabase db diff` on a clean tree says "No
schema changes found", which took moving four hand-written migrations back into
`supabase/schemas/` so the shadow database matches the real one.

## Phases 13 and 14, and the close

**Shipped.** The MCP stub with `whoami` and the four intended tool contracts in
`docs/mcp.md`. The sample corpus: 70 documents across five simulated sources and
five spaces, with the decision that changed planted across three of them, two
questions whose answers exist only by combining two documents, and an
exact-match target that appears in exactly one chunk. `scripts/seed-demo.mjs`
takes an empty database to a working demo in one command.

**The full gate passes. All sixteen steps, nothing skipped.**

```
format check (web)        format check (functions)
lint (web)                lint (functions)
typecheck (web)           typecheck (functions)
web unit tests            function unit tests
workflow contract         raw color
web build                 mobile-spec contract
coverage thresholds       pgTAP
integration               e2e and lifecycle
```

905 web tests, 426 function tests, 209 pgTAP assertions, 10 integration
assertions, 3 browser journeys. Coverage 97.12 statements, 93.14 branches,
98.96 functions, 97.9 lines, read from `coverage-summary.json` rather than from
the text table, which omits rows. `supabase db diff` reports no schema changes.

**What needs a human, and it is the same two things it was at midnight.** The
Edge Function ceiling and recall at scale. Both are keynote slides, both need
the real runtime and a real corpus, and neither is guessable. Everything around
them is built: a timed-out job names its stage, the run page leads with it, and
the copy says a space this size is expected to fail. Only the numbers are
missing.

Plus the four things outside the code: OAuth apps for Notion, Slack, Linear and
Google, a Stripe account with three products, Google verification filed early
because it will not complete before 2 October, and real credentials into
Doppler.

**What the tests found, which is the part worth reading.** The pgTAP suite found
seven real bugs, a regression inside one of the fixes, and a gap in its own
tripwire that it found by auditing a claim it had made to me. Four of those were
invisible to every other check in the repo. Two were in code written immediately
after being warned about that exact class of mistake.

Three assertions turned out to be unable to fail, and none was found by reading
them. A fixture with `claimed_at = now()` could not falsify a window of any
width, because `now()` does not move inside a transaction. A search test passed
at any `iterative_scan` setting because at test-corpus size the planner picks a
sequential scan. Thirteen storage assertions ran zero times while the total read
196 instead of 209, and the only thing that caught it was somebody knowing the
number should be 209.

The lesson that came out of that is in `docs/lessons.md` and it is the most
useful thing in this repository: an assertion that cannot run and an assertion
that cannot fail look identical from the outside. Knowing what the passing
number should be catches the first. Breaking the thing underneath catches the
second. Neither catches both.

## Phase 15: The corpus grows, and three bugs it exposed

**Shipped.** The corpus went from 136 documents to 196. Colourways, eleven
markets in three tiers, six buyer segments from an 1,800 respondent panel,
packaging, accessories and the finance model behind all of it. `COMPANY.md`
gained a commercial section so the new facts have a reference to agree with,
including the first-quarter split of 180,000 units that every table in the
corpus reconciles to.

Three real bugs came out of writing it, none of which was visible at 136
documents because every document then looked like it came from one source.

`scripts/seed-corpus.mjs` never created connection rows, so every document had
a null `connection_id`. The dream's connections pass drops any pair whose halves
share a source, and with one source it dropped every pair. Zero links, and the
run reported success in under a second because it never reached the model. The
seed now creates one connection per space and provider and stamps
`connection_id` on each synced document.

`scripts/build-corpus-manifest.mjs` set a document's edit date to the latest
date mentioned anywhere in its body. A test plan saying "booked from
2026-09-14" was stamped as edited that day. Six documents sat past the end of
the corpus and sorted to the top of every recency window. It now reads the
document's own `Updated`, `Last edited` or `Created` stamp and clamps to the
corpus end date.

`dream_connections.ts` had two. It passed a whole chunk as the full-text query
to `public.search`, and `websearch_to_tsquery` ANDs every term, so a 1,279 token
chunk matched only itself, which the pass then skips. It contributed nothing and
raised `tsquery stack too small` on dense uploads, which is what killed the
Marketing run. It also capped candidate pairs at 20 before dropping same-source
ones, and a document's nearest neighbours are mostly its own source, so most of
the budget went on pairs headed for the bin. Company produced zero links from 20
candidates. Now it searches by embedding only, searches every document, filters,
ranks by similarity, then caps. Links went from 0 to 80 across four spaces, and
every source pairs with every other.

The connections page was rendering each connection twice, because
`ConnectionRow` draws the status, space, account and reason and then nests
`ScopeEditor`, which drew all four again. The channel and folder pickers were
also always open, 56 checkboxes on screen at once. The page went from 6893px to
3385px.

**Did not ship.** Nothing. The connections model change landed in phase 16.

**Needs a human.** `public.search` still raises `tsquery stack too small` for a
long enough `query_text`. The dream no longer sends one, but a user pasting a
wall of text into chat can. The fix is a guard inside the function, which means
a migration and a change to the live query path.

**Notes.** Two guards went into `scripts/check-corpus.mjs`, both because the
class of bug they catch had already happened. Manifest dates must fall inside
the corpus window, tested against the old code so it catches exactly the six
broken files. And no two documents may claim the same Linear issue id, which
happened three times in one afternoon and which nothing else would have caught.

The corpus was written by five agents in parallel off one file list. Two of them
stopped and asked rather than write the colliding issue numbers they had been
handed, which is the only reason the collisions were caught before the seed ran.

## Phase 16: A connection is an account, not a space

**Shipped.** `connections.space_id` is gone. A connection is one authorized
account, and `scope_selection.routes` maps each unit to a space, so one Slack
workspace sends `#hardware` to Engineering and `#finance` to Finance. The demo
org went from sixteen connections, four per provider with one per space, to
four.

The read rule moved with it. `routes_into_visible_space(jsonb)` is the new
predicate and `connections_select_visible` is now your own connection, or one
that routes into a space you are in. The view model then drops the routes to
spaces the reader is not in, so a whole row passing RLS does not leak the rest of
it. Checked against the seeded org under real RLS: Jane resolves all four
destinations on every connection, Sam resolves Company and Engineering and cannot
learn that a Finance teamspace or a `#finance` channel exists.

Nobody picks a space before the redirect any more, so `space_id` came off
`oauth_states` and `pending_connections` and out of both consume functions. The
connect button asks for nothing and the routing is set on the row afterwards.

`SourceDocumentRef` gained `unitId`, because only Slack could recover its unit
and only by accident, from `externalId` being `${channel}:${ts}`. All four
drivers now report it: Slack the channel, Linear the team off each issue, Notion
the workspace, Drive the folder the file was found under. Sync routes on it, and
a document from a unit with no route is dropped with a warning rather than filed
somewhere arbitrary. A rename keeps a document where it already sits, so
re-routing a unit does not silently move documents whose chunks would then
disagree.

The page went from 6893px to 1889px across the two passes. Each connection is
drawn once, the routing list is collapsed behind a chevron, and the destination
control is the app's own `Select` rather than the browser's.

A destination is checked when it is saved. `requireRoutableSpaces` refuses a
route whose target is not a space in the connection's own organization that the
caller is a member of. Without it a multi-org user could store a route that
`documents_space_in_org` then rejects inside a background sync, or file documents
into a space they cannot open. Out of org and not a member return the same
answer, so neither can be probed. Verified by breaking the guard and watching the
two tests that cover it fail.

**Did not ship.** Re-routing a unit does not move the documents already filed
under it. The routing decides where new documents land and nothing else.

**Needs a human.** `public.search` still raises `tsquery stack too small` for a
long enough `query_text`, unchanged from phase 15.

A user can belong to more than one organization, and nothing in the new connect
flow lets them say which one a connection is for. `requireOrgMembership` takes
the oldest membership so a reconnect is at least deterministic. That is a guess,
not an answer. Fixing it properly means an explicit org on the begin request,
carried through `oauth_states` and `pending_connections`.

A Drive file in two routed folders lands in whichever parent Drive lists first.
Arbitrary, and it wants a rule.

**Notes.** An empty routing now means a connection reads nothing. Drive used to
treat no folders picked as read the whole account, which under routes would be
documents with nowhere to land. Every new connection passes through that state
between authorizing and routing.

pg-delta generated the migration and got the column grants right,
which `docs/decisions.md` says `supabase db diff` would not. It did not emit the
`revoke ... from public, anon` that the declarative schema declares, so a new
`SECURITY DEFINER` function would have been executable by PUBLIC. Those three
revokes are hand-written into the migration. It also ordered the column drop
before a `REVOKE SELECT` naming that column, which fails; dropping a column drops
its grants anyway, so the revoke no longer names it.

`test/setup.ts` gained the pointer-capture and `scrollIntoView` stubs Radix needs
under jsdom. Without them any component using `Select` throws before it opens,
which is why the picker had been a bare `<select>`.

## Phase 17: One organization, folders for chats, and an audit that found real things

**Shipped.** An address has one account and that account has one organization.
`org_members_user_id_idx` is unique on the user alone. That broke the seed
immediately, which is the useful part: the signup trigger gives every account
its own organization, so joining another one was adding a second membership, and
the upsert doing it had no error check and failed silently. Joining now moves the
membership and deletes the organization nobody is left in. It also fixed
something that predates this, where everyone carried a stray Everyone space from
their old organization and three people had two Personal spaces each.

Chat folders. `conversation_folders` is a person's own filing for their own
chats, unique per person case-insensitively, with a colour from an enum and a
position. `conversations.folder_id` is null for the top level, which is a
destination and not a missing value. The sidebar groups conversations under their
folders with a colour dot, and keeps an empty folder visible because somebody
made it deliberately. Colours are stored as names and resolved through
`lib/chat/folder-colors.ts`, so the raw-colour check stays satisfied and a folder
keeps its meaning when the theme changes.

An unrouted Linear connection used to read the whole workspace, drop every issue
for having nowhere to land, and advance its cursor past them. It now answers with
its cursor untouched and asks Linear nothing, which is what Slack already did.

Two audits ran over the connection model. What they found and what happened to it
is in `docs/tech-debt-audit-2026-09-11.md`. The two that matter: a member of one
destination space could re-point a channel the owner had deliberately sent
somewhere else into a space only they could open, and `anon` and `authenticated`
held TRUNCATE on every table in `public`, which ignores row level security
entirely.

**Did not ship.** The nightly dream is still never enqueued. `dream-worker` runs
at 02:00 UTC and drains queued runs, and nothing queues any, so only the manual
button on a space page ever dreams.

**Needs a human.** `public.search` still raises `tsquery stack too small` for a
long enough question. The coverage gate is red at 94.31 percent against 95, and
two components with no tests at all are 59 of the 143 uncovered statements.

**Notes.** The folder key repeated `docs/lessons.md:146` exactly. A composite
`on delete set null` nulls every column in the key, `user_id` is not null, and
deleting a folder raised. The entry was written after the same mistake on
`dream_runs.space_id` and was available to read. It was not read.

The guards added the night before had tests that could not fail. `stubDb` ignores
the query and answers with whatever its closure returns, so every filter in both
guards could be deleted with all eleven tests green. The commit message said the
opposite had been verified, and what had actually been verified was the set
difference rather than the database filter. The stub now applies the request's
filters, and each filter has a test that dies without it. This is the second
entry in this log about an assertion that cannot fail, and the first one is the
most useful thing in the repository.

## Phase 18: The nightly dream actually runs

**Shipped.** `queue_nightly_dreams()` at 01:55 UTC, five minutes before the
worker that drains it. One run per space per kind, skipping a space whose run of
that kind is still queued or running, so a second call in one night does not
double the bill. Every pass returns early when nothing arrived in its window, so
a quiet space costs a row and no model call.

`dream-worker` had been scheduled at 02:00 since it was written and drains
`dream_runs` where `status = 'queued'`. Nothing ever created one except the
manual button on a space page, so the cron fired into an empty queue every night.
The worker, the schedule and three passes all existed; the queue filler did not.

Running it for the first time turned up two things nothing had exercised. Five of
seven entity passes failed on model output that would not parse, so the entity
and connections prompts now ask for a JSON object and set `response_format`,
which the provider guarantees. That left two, which turned out to be the answer
truncated at its 2000 token cap: valid text, invalid JSON, reported as an
unreadable model. `readCompletion` raises `model_answer_truncated` when
`finish_reason` is `length`, and the entity cap is 6000. Twenty-one of twenty-one
runs now succeed, writing 98 entities and 80 links.

`check-scheduled-workers.mjs` read a job's target from its name, so a job called
`dream-worker` that invoked a mistyped one would have passed. It now reads what
each job actually calls and checks an Edge Function or a SQL function
accordingly. Confirmed it fails on both.

**Did not ship.** The dream still covers 120 chunks per space per night, so a
large import is understood over months rather than nights. That is the right
shape for a daily trickle and the wrong one for a backfill.

**Needs a human.** `public.search` still raises `tsquery stack too small` for a
long enough question.

**Notes.** pg-delta omitted the revoke on the new function for the second time
tonight, leaving it executable by PUBLIC. `60_functions.test.sql` caught it,
which is the first time that tripwire has earned its keep in this log.

## Phase 19: The dream in 38 seconds, and mostly for free

**Shipped.** The nightly dream took 185 seconds of wall clock to get through 21
runs. It now takes 38, doing more work than it did then, and one night of the
demo corpus costs 60 cents of model time instead of a dollar and a half.

Three things were waiting, and none of them were computation.

The connections pass embedded twenty documents in one call and then searched for
their neighbours one at a time, twenty round trips in a row, each one waiting on
Postgres and on nothing the next one needed. They run together now. Average run
time fell from 8.8 seconds to 7.4 on its own.

`dream-worker` claimed one run, ran it to completion, and only then looked at the
next. Runs are independent: different spaces, or different kinds within one
space, writing different rows. `runDreamBatch` claims and runs a page of them
together, which is where most of the 185 seconds went. The batch is eight, and
the cron now fires every five minutes through the 02:00 hour rather than once, so
a fleet with more spaces than one batch drains inside the hour instead of waiting
nights. It had been draining five runs a night against a queue of twenty-one.

The entities pass no longer asks a model where a name appears. Every name the
space knows is matched against the night's text with an Aho-Corasick automaton:
one pass over the text however many thousand names are known, exact, and free. The
model is asked for one thing, a list of the names in the text, and a name it
answers with is filed only if the matcher can find it in what people actually
wrote. That call is on the smaller model now, because listing names is not work
for the larger one. Entity mentions went from 98 to 1,076 and the pass reads 400
chunks over a week instead of 120 over a night.

Summaries are tiered, which is GBrain's idea: a thing mentioned once is a name, a
thing mentioned three times is a subject worth a sentence. Twenty-five a night at
most, and never one that already has a sentence.

**Numbers.** 21 of 21 runs succeed. 108 entities, 1,076 mentions, 120 links,
$0.60 of models for seven spaces, 38 seconds.

**Did not ship.** The dream still reads by date, so a document older than the
lookback window is never considered at all. A week is better than a night and it
is not the same as knowing what it has already read.

**Notes.** Two output caps were set as round numbers and both were wrong: 800
tokens for thirty rationales, 2,000 for twenty-five summaries. An answer that
runs out of room arrives as broken JSON, and four runs failed that way. Both caps
are now derived from the count they have to hold. A model's list is also read one
entry at a time, so one row it shaped oddly costs that row rather than the answer
and the run.

## Phase 20: GitHub is a source

**Shipped.** A GitHub connector, which is the fifth driver and the first that
reads files rather than records. A repository is a unit, so one account can send
one repository to one space and another to another, the same as a Slack channel
or a Drive folder. `repository` is a fourth scope selection kind and the picker
names the units by it.

What it reads is prose: `.md`, `.markdown`, `.mdx`, `.txt` and `.rst`, skipping
vendored trees, dot directories, lockfiles and anything over a megabyte, because
the contents endpoint refuses those anyway. Code is not read. A repository of
4,795 files is 34 MB of text and 19 cents of embeddings.

A first read walks the tree at one commit, three hundred files at a time, and
carries that commit through the walk so a push part way does not shuffle the
pages. After that each pass asks for the newest commit, which is one request, and
stops there when nothing has moved. When something has, one compare says what
changed. A change larger than a compare reports, which is three hundred files,
drops back to a walk rather than losing the rest quietly.

The cursor holds a commit per repository rather than one stamp, because a
connection reads several and they move independently. A repository that stops
being routed is dropped from it. A repository with no commits is marked read so
it is not asked for again every hour.

Verified against the real API as well as the fixtures: a walk of
`octocat/Spoon-Knife`, a second pass that read nothing, a compare across thirty
commits of `supabase/supabase-js` that picked out the six markdown files and left
the code, and a file fetched and decoded.

**Did not ship.** A deleted file stays filed. Nothing in the driver contract
removes a document that has been written, so a file deleted upstream keeps
answering questions until somebody deletes it by hand. A renamed file arrives as
a new document and the old one stays too, for the same reason.

**Notes.** The limiter tests had been failing about twice in a hundred runs.
enforceRateLimits prunes on one call in two hundred and does not wait for it, so
a run where that fired ended with a request in flight and Deno's leak sanitizer
failed the test. It has nothing to do with rate limiting and took a forced prune
to see.

## Phase 21: The MCP server, on what Supabase shipped

**Shipped.** Digital Brain has an MCP server. Five tools: `search`, `get_document`,
`list_spaces`, `add_note` and `whoami`, hand-written, one file each. Claude can
be handed a URL and end up reading this knowledge base with its owner's own
permissions.

It is built on what the BYO MCP project actually shipped rather than around it.
`withOAuthProtectedResource` and `withSupabase` from `@supabase/server` 1.6.0,
and `@modelcontextprotocol/server` 2.0.0 for the protocol, which is the
2026-07-28 revision. The Library's `mcp-server` block is the skeleton and its
consent block is the shape of the consent screen, rewritten in Digital Brain's own
design rather than installed.

The public guide for this still says authenticated MCP is coming soon. It is
wrong, or at least behind: the middleware landed in `@supabase/server` in
August, marked alpha in September, and it works. What did slip is tool
generation from the PostgREST schema, which was pulled from the Select roadmap
on the tenth. Digital Brain does not want it anyway. Generated tools would offer
`delete_documents` to anything that connected; these five are curated, which is
what that project's own PRFAQ says a real deployment should do.

Every tool runs as the caller. `withSupabase({ auth: 'user' })` hands back a
client scoped to whoever sent the token, so row level security is the whole
permission model and the server has none of its own to keep in sync. Proven
against the running stack: a document in a space the caller is not in answers
`no document <id>`, the same words an id that never existed gets.

`add_note` is the exception and the reason it is the exception is worth keeping.
Documents and chunks carry select policies and no insert policy, so the write
runs as the service role. The membership check is therefore explicit, made
through the caller's own client, before the role changes. A note into a space
the caller is not in writes nothing: no storage object, no document, no job.

Three things had to become true of the project, all in `config.toml`: the OAuth
2.1 server on, dynamic client registration on, and JWTs signed with an
asymmetric key. The last one has a consequence nobody warns you about. Switching
off the legacy HS256 secret invalidates every JWT-format key the local stack had
issued, so `SB_SERVICE_ROLE_KEY` and the anon key in two `.env` files stopped
working at once. `local-function-secrets.mjs` now takes those from the running
stack rather than from Doppler, because they are local facts rather than shared
secrets.

**Verified against the running stack.** The discovery route answers RFC 9728
metadata naming Supabase Auth. An unauthenticated call comes back 401 with
`WWW-Authenticate: Bearer resource_metadata="…"`, which is what an MCP client
follows to find out where to sign in. `tools/list` returns all five with their
schemas and annotations. `whoami`, `list_spaces`, `get_document` and `add_note`
all answer correctly, and the note's 28 bytes landed in the bucket under the
space with the document row pointing at them.

`search` was the one tool left unproven, because the OpenAI account ran out of
credits and every embedding call answers 429. Proven since, by standing a fake
embeddings endpoint in front of the model client for as long as it took to
ingest the corpus and run one search: three passages came back with their titles
and urls, the query meter wrote one row, three documents were marked read. The
ranking is meaningless with stand-in vectors and the path is not. The same
question asked by somebody who is only in Engineering came back with five
passages, all of them from Engineering, and none of the Marketing ones the first
caller saw. Row level security narrowed it and said nothing.

**Did not ship.** Nothing. The account needs credits before a real answer is
worth anything, which is a billing state rather than a code path.

**Notes.** The MCP spec deprecated Dynamic Client Registration in July in favour
of Client ID Metadata Documents, and Anthropic and OpenAI are moving their
clients to it. Supabase supports DCR and not CIMD; there is an open discussion
asking for it, filed in January, still unanswered. DCR stays available for
backwards compatibility, so this works today. It is worth knowing which way that
goes before anyone depends on it.

## Phase 22: Digital Brain sends its own email

**Shipped.** Every account email is Digital Brain's: its words, its design, its
delivery. The auth server sends none. That is one setting, `[auth.hook.send_email]`
pointing at `supabase/functions/auth-email/`, and after it there is nothing
about a Digital Brain email in anybody's dashboard.

Six templates in React Email, rendered in the edge function: confirm your
address, reset your password, a sign-in link, the two halves of an email change,
a confirmation code, and an organization invitation. Dark, always, because an
email cannot read a colour scheme reliably and one that tries looks broken in
half the clients that matter. The palette is `web/styles/tokens.css` flattened
into literals, since an email has no stylesheet and no cascade. The mark is a
PNG, because Gmail strips inline SVG.

Local delivery is Mailpit and is the default rather than the exception: with no
Resend key there is nothing to leak and nothing to configure. Mailpit takes a
message with no auth and no TLS, so the SMTP client is a socket and eight lines
of conversation rather than a dependency. A deployed project has a key and goes
over Resend's HTTP API instead.

Verified end to end rather than by inspection: a password reset through the auth
API arrived in Mailpit two seconds later, from Digital Brain's address, with Digital Brain's
subject, carrying the ground colour, the sheen, the mark and a link into the
confirm route.

**Notes.** The hook is the whole security boundary and it is the reason to be
careful: it takes a token and an address and will happily mail one to the other.
An unsigned call is refused before anything renders, and a missing secret
refuses everything rather than trusting the caller. Three mutations prove it:
trusting a call with no secret, accepting any signature, and mailing the new
address the old address's token each turn a test red. That last one matters
because the two halves of an email change are supposed to need two clicks, and
one wrong token would collapse it to one.

**Did not ship.** The invitation email has its words and no sender: organization
invites are Digital Brain's own table rather than a GoTrue flow, so that one does not
come through the hook and still needs wiring to the members screen, which today
hands the raw token back to the browser and emails nobody.

## Phase 23: The ingest queue was waiting on itself

**Shipped.** The ingest worker ran its batch in a loop, each job awaiting the one
before it. A job is a fetch, an embed and a write, which is almost entirely
waiting, so a batch of twenty-five cost the sum of twenty-five waits. This is
the same shape as the dream worker in Phase 19, in a second place, found by
being asked whether the rate was real or self-imposed.

Measured on the demo corpus, 196 documents and 299 chunks, before and after:
**55 seconds to 8**. One invocation of a hundred jobs takes 2.8 seconds, so the
batch of twenty-five was never a considered limit either: it was what fitted in
the budget when the jobs ran in sequence. The schedule now claims a hundred.

It is a bounded pool of eight rather than everything at once, and the bound is
the point. A source that allows a few thousand requests an hour does not want
twenty-five at a time, and going faster is what makes that matter.

**The bug the speed uncovered.** GitHub answers a spent hourly allowance with
403, which is the same status it uses for a refused token, and `requestJson`
read every 403 as a credential to reconnect. A fast import would have marked a
perfectly good connection expired and asked the person to reauthorize, when all
they had to do was wait. A throttle is now told apart by the remaining count and
the retry headers, and it is not an attempt at the work: the claim that spent
one gives it back, because three retries inside six minutes would otherwise
throw a document away over an hourly limit. The first throttled job stops the
batch, since the next would be told the same thing.

**Notes.** 196 documents in 8 seconds is 24 a second, but the corpus is uploads
read from local storage. Against a real source the ceiling is the source: 4,795
files from GitHub is an hour at their five thousand an hour, whatever this
worker does.
