# Magpi

A team knowledge base with a chat interface, on stock Supabase. Connect Notion,
Linear, Slack and Google Drive, or upload files. Magpi chunks and embeds the
content into Postgres, and you ask questions and get cited answers. Overnight it
dreams: a job re-reads the day, extracts entities, links related documents and
writes a digest back into the space.

This is the demo application for the Supabase Select 2026 keynote. The run sheet
is in [`docs/demo.md`](docs/demo.md).

## Run it

You need Node 22, pnpm 11, Docker, the Supabase CLI and an OpenAI API key.

```bash
git clone git@github.com:supabase/select-2026-demo.git
cd select-2026-demo
pnpm install
supabase start
cp .env.example web/.env.local     # fill in the keys supabase start printed
pnpm dev
```

Two env files, neither committed:

- `web/.env.local` is what the app reads. For the demo it points at the hosted
  project and a person hands it over.
- `supabase/.env` holds the values `supabase/config.toml` reads through `env()`.

The local stack uses ports 55321 through 55329, so it does not collide with
another project you have running.

## The demo company

`supabase/corpus/` is Supaphone, a fictional maker of a folding phone. Seven
people, four shared spaces. This loads it into the project `web/.env.local`
points at:

```bash
node --env-file=web/.env.local scripts/seed-demo.mjs
```

| Person            | Email             | Sees                                     |
| ----------------- | ----------------- | ---------------------------------------- |
| Jane Okonkwo, CEO | jane@example.com  | Company, Marketing, Engineering, Finance |
| Sam Lindqvist     | sam@example.com   | Company, Engineering                     |
| Ben Achilov       | ben@example.com   | Company, Marketing, Engineering          |
| Maya Restrepo     | maya@example.com  | Company, Marketing                       |
| Priya Raghunathan | priya@example.com | Company, Marketing                       |
| John Mbeki        | john@example.com  | Company, Engineering, Finance            |
| Dana Provenzano   | dana@example.com  | Company, Finance                         |

Every account uses the password `supabasedemo`. Jane is in every shared space,
so she is the account the demo signs in as. `SB_DEMO_LOGIN=true` adds three
quick-login buttons under the sign-in form. Never set it on a deployment that
holds anything real.

## How it works

- Every document lives in exactly one space: personal, team or org. Row Level
  Security is on for every table, and search runs inside it, so two people can
  ask the same question and get different answers with no error.
- Search is hybrid: pgvector plus full text, merged with reciprocal rank fusion.
- Ingest and dreaming run as Edge Functions locally and on Supabase Compute
  when deployed. See `docs/demo.md` for the Compute half.
- The MCP server is the Supabase Library's MCP Server block with five tools on
  it. Agents sign in through the library's OAuth Consent flow and act as the
  person who approved them.

More in `docs/`: `mcp.md`, `limits.md`, `retrieval.md`, `decisions.md`.

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`: migrations, then
every Edge Function, to the hosted project. It reads three repository secrets,
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SB_AUTH_HOOK_SECRET`, and
one variable, `SUPABASE_PROJECT_ID`.

Function secrets live in `supabase/.env.hosted`, not committed, and a person
pushes them:

```bash
pnpm secrets:push
```

The web app deploys from Vercel's Git integration.

## Tests

`pnpm gate:light` is format, lint, typecheck, unit tests and build. It runs on
pre-push and in CI. `pnpm gate` adds pgTAP, integration, browser journeys and
coverage.

## Licence

MIT. The sample corpus is openly licensed or synthetic.
