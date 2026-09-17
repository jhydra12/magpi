# Magpi

A team knowledge base with a chat interface, built on stock Supabase.

Connect Notion, Linear, Slack and Google Drive, or upload files directly. Magpi chunks the content, embeds it, and stores it in Postgres. You ask questions in a conversation and get answers with citations back to the source.

Overnight, it dreams. A scheduled job re-reads what came in that day, extracts entities, links documents that are about the same thing, and writes a digest back into the space.

Everything here runs on Supabase as it ships today: Postgres with pgvector, Row Level Security, Storage, Realtime, Auth, and Edge Functions. Nothing is mocked and nothing is unreleased.

Magpi is the demo application for the Supabase Select 2026 keynote. It is also MIT licensed and meant to be cloned and run.

## Quick start

You need Node 22, pnpm 11, Docker, the [Supabase CLI](https://supabase.com/docs/guides/cli), and an OpenAI API key.

```bash
git clone https://github.com/supabase/select-2026-demo
cd magpi
pnpm install
supabase start
cp .env.example web/.env.local   # fill in the keys supabase start printed
pnpm dev
```

`next dev` reads `web/.env.local`, so the file goes there rather than at the
repo root. For the Select demo the file points at the hosted demo project, and
a person hands it over. It is never committed.

Two env files, each read by a different thing:

- `web/.env.local` is what the app reads. Start from `.env.example`.
- `supabase/.env` holds the values `supabase/config.toml` reads through
  `env()`. The CLI loads it on its own for `supabase start` and `db push`.

`pnpm check:secrets` fails when `web/.env.local` and a local
`supabase/.env.local` disagree about a shared key, and it runs in the gate.

The handful of keys the local stack issues for itself are listed in
`scripts/lib/local-stack.mjs`. `supabase status` prints them.

Open http://127.0.0.1:3000, create an account, drop a file into Documents, and ask a question about it in Chat. That path takes about five minutes from a cold clone.

The local stack binds to 55321 through 55329 rather than the usual 543xx, so a Supabase project you already have running does not collide with this one.

It signs JWTs with the ES256 key in `supabase/signing_keys.json`, rather than
the legacy shared secret, because the MCP server verifies tokens against JWKS
and a project on the old secret publishes no keys there. That file is committed
on purpose: it signs nothing but this local stack, which already ships with
well-known credentials. A hosted project uses its own key from the dashboard.
`node scripts/local-function-secrets.mjs` takes the anon and service keys from
the running stack, since changing the signing key changes both.

## Connecting an agent

The MCP server is `supabase/functions/mcp-server/`, the Supabase Library's MCP
Server block with Magpi's five tools registered on it. Point an MCP client at
`http://127.0.0.1:55321/functions/v1/mcp-server` and it will find its own way to
the sign-in page, through the library's OAuth Consent flow at `/oauth/consent`.
`docs/mcp.md` covers the five tools and how a caller gets in. A hosted project
needs the OAuth server, dynamic client registration and the consent path turned
on in its Auth settings, as `supabase/config.toml` has them for the local stack.

## The demo company

`supabase/corpus/` is a fictional company called Supaphone, which makes a
four-panel folding phone. Seven people, four shared spaces and a set of private
ones. `supabase/corpus/COMPANY.md` is the reference every document in it agrees
with, and it names the four facts planted in the corpus on purpose.

```bash
supabase functions serve --env-file supabase/.env.local   # in another terminal
node --env-file=web/.env.local scripts/seed-demo.mjs      # accounts, spaces, corpus, ingest
```

That goes from an empty database to answerable questions. It creates the seven
accounts, renames the org space, builds the team spaces, loads the corpus and
then drains the ingest queue through the same worker the cron calls. Pass
`--skip-ingest` to stop after loading, which leaves documents nobody can ask
about. Running it twice writes nothing the second time.

| Person            | Email             | Sees                                     |
| ----------------- | ----------------- | ---------------------------------------- |
| Jane Okonkwo, CEO | jane@example.com  | Company, Marketing, Engineering, Finance |
| Sam Lindqvist     | sam@example.com   | Company, Engineering                     |
| Ben Achilov       | ben@example.com   | Company, Marketing, Engineering          |
| Maya Restrepo     | maya@example.com  | Company, Marketing                       |
| Priya Raghunathan | priya@example.com | Company, Marketing                       |
| John Mbeki        | john@example.com  | Company, Engineering, Finance            |
| Dana Provenzano   | dana@example.com  | Company, Finance                         |

Every account uses the password `supabasedemo`.

Jane is in every shared space, which is why she is the account the demo signs in
as. She holds no special role: nothing in this product reads across a space
boundary. Ask Jane what the Fold S1 costs to build and she answers with a
citation. Ask Sam the same question and the answer is shorter, with no error and
no dialog about it, because the number lives in Finance and he is not in it.

Set `SB_DEMO_LOGIN=true` to put three quick-login buttons under the sign-in
form: CEO, Finance and Marketing. One question separates them, which is the only
reason there are three.

| Ask                                  | Jane, CEO | John, Finance            | Maya, Marketing          |
| ------------------------------------ | --------- | ------------------------ | ------------------------ |
| What does the Fold S1 cost to build? | answers   | answers                  | shorter answer, no error |
| When do we launch?                   | answers   | shorter answer, no error | answers                  |

The buttons are off unless that variable is exactly `true`, and they are
deliberately the only thing in the app painted a colour the product palette does
not contain. Do not set it on a deployment holding anything real.

## The permission model

Every document lives in exactly one **space**. There are three kinds.

| Kind     | Members                      | Created by                 |
| -------- | ---------------------------- | -------------------------- |
| Personal | One, always                  | A trigger, on signup       |
| Team     | An explicit member list      | Anyone in the organization |
| Org      | Everyone in the organization | A trigger, on signup       |

You pick the space when you connect a source or upload a file. Spaces are flat: no nesting, no inheritance, no per-document sharing.

Magpi owns this boundary rather than mirroring the boundaries of the tools it reads from. Glean and Dropbox Dash take the other route, and permission changes always propagate late when you do.

Enforcement is RLS, forced on every table, deny by default. `chunks` carries a denormalized `space_id` so a permission check evaluates against a single indexed column with no join, which means the filter runs inside the vector search rather than after it.

```sql
create policy chunks_select_visible on public.chunks
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));
```

Two people can ask the same question and get different answers, with no error and no permission dialog. `supabase/tests/20_search.test.sql` pins that behavior.

## Retrieval

Hybrid: pgvector cosine similarity plus Postgres full text search, merged with reciprocal rank fusion at k = 60. Pure vector search fails on exact-match questions like "what is the SSO ticket number", so the lexical arm is there to catch them.

It is one `security invoker` SQL function, `public.search()`, so RLS applies to every caller. Web, mobile and the MCP server all call it. Measured recall numbers go in [`docs/retrieval.md`](docs/retrieval.md).

Embeddings are `text-embedding-3-small` at 1536 dimensions. Every model id in the codebase is pinned by exact id in [`web/lib/models.ts`](web/lib/models.ts) and appears nowhere else.

## Dreaming

Dreaming is overnight consolidation. Once a night, per space, a job re-reads the day and writes what it worked out back into the space.

Three kinds, and no more:

1. **Entities.** People, projects, customers and decisions, written to `entities` and `entity_mentions`. This is what lets a question about a project pull the Linear issue, the Notion doc and the Slack thread together.
2. **Digest.** A per-space summary of what changed, what was decided, and what is unresolved.
3. **Connections.** Pairs of documents in the same space, from different sources, with high similarity and no explicit link. Surfaced for a human to confirm.

A dream run reads only one space and writes only into that space. A job that read across spaces under the service role and then surfaced the result would be a permission bypass, so the rule is structural rather than a convention.

Dream output is an ordinary `documents` row with `origin = 'dream'`. It gets chunked, embedded, searched and cited like anything else, and it is governed by the same RLS. There is no second permission model.

Every dream document cites the chunks it came from. You can turn dreaming off per space, and deleting a dream output does not touch its sources.

## Background processing runs on Edge Functions, and will hit a ceiling

Ingest, embedding and dreaming all run on Edge Functions. A single document import is one job, with no artificial batching and no chunked resume protocol to work around the limit.

Large enough documents and deep enough batches exceed the CPU and wall-clock budget and the job fails. When that happens the job sets `ingest_jobs.status = 'timeout'` with the stage it died in, and the UI shows a real error rather than a spinner that never resolves.

The measured numbers live in [`docs/limits.md`](docs/limits.md).

Job bodies are plain async functions taking a job record and injected clients. No `Deno.serve`, no global fetch config, no function-scoped env reads. The runtime entry point is a thin wrapper, and the bodies are tested directly without a server.

## Layout

```
/web           Next.js app
/ios           SwiftUI app
/android       Compose app
/supabase      schemas, migrations, functions, tests, seed
/docs          specs, limits, retrieval, mobile spec, decisions
/scripts       gate runners and generators
/tests         Playwright journeys and integration suites
```

`supabase/schemas/` is the source of truth for the database. Migrations are generated from it with `supabase db diff`. Two things the diff does not track live as hand-written migrations: storage policies, and realtime publication membership.

Design tokens are vendored from `supabase/supabase` by `scripts/sync-tokens.mjs`, with the upstream commit SHA recorded in `web/styles/supabase/UPSTREAM`. Run it against a newer checkout to take upstream changes as a reviewable diff. Never hand-edit a vendored file.

## Tests

Five tiers, one runner each.

| Tier             | Command                 |
| ---------------- | ----------------------- |
| Unit, web        | `pnpm --dir web test`   |
| Unit, functions  | `pnpm test:functions`   |
| Database, pgTAP  | `pnpm test:db`          |
| Integration      | `pnpm test:integration` |
| Browser journeys | `pnpm test:e2e`         |

Two gates. `pnpm gate:light` is format, lint, typecheck, unit tests and build, and it runs on pre-push and in CI under five minutes. `pnpm gate` adds pgTAP, integration, the browser journeys, coverage thresholds, and the mobile-spec contract check. Every step a gate could not run is reported by name, and `pnpm gate --strict` refuses to skip one.

pgTAP carries the security tests. Every table has an assertion proving a member of one space cannot read another space's rows.

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`, which pushes the
migrations and deploys every edge function to the hosted project. It reads three
repository secrets, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and
`SB_AUTH_HOOK_SECRET`, and one repository variable, `SUPABASE_PROJECT_ID`.

Function secrets do not go through CI. They live in `supabase/.env.hosted`,
which is not committed, and a person pushes them:

```bash
supabase link --project-ref <ref>
pnpm secrets:push    # supabase secrets set --env-file supabase/.env.hosted
```

The web app deploys from Vercel's Git integration on the same push. Its
environment is set in the Vercel project from the same values as `web/.env.local`.

## Configuration

Secrets use an `SB_` prefix. Supabase reserves `SUPABASE_`, and a secrets manager syncing into a project cannot write one.

| Variable                                | Required        | What it is                                 |
| --------------------------------------- | --------------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`              | yes             | From `supabase start`                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | yes             | From `supabase start`                      |
| `SB_SERVICE_ROLE_KEY`                   | yes             | From `supabase start`                      |
| `OPENAI_API_KEY`                        | yes             | Embeddings and chat                        |
| `SB_TOKEN_ENC_KEY`                      | for connections | 32 bytes base64, `openssl rand -base64 32` |
| `SB_NOTION_CLIENT_ID` / `_SECRET`       | for Notion      | An OAuth app you register                  |
| `SB_LINEAR_CLIENT_ID` / `_SECRET`       | for Linear      | An OAuth app you register                  |
| `SB_SLACK_CLIENT_ID` / `_SECRET`        | for Slack       | An OAuth app you register                  |
| `SB_GOOGLE_DRIVE_CLIENT_ID` / `_SECRET` | for Drive       | An OAuth app you register                  |
| `SB_STRIPE_SECRET_KEY`                  | for billing     | Test mode is enough                        |
| `SB_STRIPE_WEBHOOK_SECRET`              | for billing     | From the Stripe CLI or dashboard           |

Upload, search and chat work with only the first four. Every provider driver has passing unit tests against recorded fixtures, so you can read and change the connection code without registering anything.

## Current limitations

- (September 2026) Google Drive read scopes are sensitive and OAuth verification takes weeks. Running Drive means an unverified app with a fixed list of test users.
- (September 2026) The Edge Function ceiling is deliberate and unmeasured. Large imports and large dream runs fail, visibly, and the numbers are not in `docs/limits.md` yet.
- (September 2026) Analytics queries run against the primary.
- (September 2026) The `/ios` and `/android` clients are specified in [`docs/mobile-spec.md`](docs/mobile-spec.md) and not built.

## Contributing

Read [`docs/todo.md`](docs/todo.md) for where things stand and [`docs/decisions.md`](docs/decisions.md) for why things are the way they are.

Tests come first, commits stay small, and `pnpm gate:light` passes before you push. If a Supabase Library block exists for something you are about to write by hand, use the block.

## Licence

MIT. Everything in this repository is public, including the sample corpus, which is openly licensed or synthetic. [`docs/corpus.md`](docs/corpus.md) names the source and licence of every document in it.
