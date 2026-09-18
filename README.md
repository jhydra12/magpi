# Magpi

A team knowledge base with a chat interface, on stock Supabase. Connect Notion,
Linear, Slack and Google Drive, or upload files. Magpi chunks and embeds the
content into Postgres, and you ask questions and get cited answers. Overnight it
dreams: a job re-reads the day, extracts entities, links related documents and
writes a digest back into the space.

This is the demo application for the Supabase Select 2026 keynote. The run
sheet is at the bottom of this file.

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

Ingestion runs on the Node 2 GB `dream` instance. See
[deployment, checks, and rollback](docs/ingestion-compute.md).

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

## Demo run sheet, Theme 1

Five minutes. A terminal, Codex, ChatGPT, and the app in a browser. The hosted
project is `vvfegdrzrzjyekvrfyoj`, enrolled in the Compute alpha. Every command
below uses `supabase-beta`, the beta CLI, because Compute only exists there.

### Setup, once

1. Clone, install, link.

   ```bash
   git clone git@github.com:supabase/select-2026-demo.git ~/Developer/supabase/select-2026-demo
   cd ~/Developer/supabase/select-2026-demo
   pnpm install
   npm install -g supabase@beta
   supabase-beta login
   supabase-beta link --project-ref vvfegdrzrzjyekvrfyoj
   ```

2. Get the two env files from whoever has them: `web/.env.local` and
   `supabase/.env`. Neither is committed.

3. Create the worktrees. The two decoys carry their own project id and port
   range in config.toml, so their stacks run side by side. The compute worktree
   shares main's ports and runs no stack of its own.

   ```bash
   git worktree add ../magpi-compute compute-dream
   git worktree add ../magpi-feature-a feature-a
   git worktree add ../magpi-feature-b feature-b
   for w in magpi-compute magpi-feature-a magpi-feature-b; do cp supabase/.env ../$w/supabase/.env; done
   (cd ../magpi-feature-a && supabase-beta start -x imgproxy,logflare,vector,supavisor)
   (cd ../magpi-feature-b && supabase-beta start -x imgproxy,logflare,vector,supavisor)
   ```

4. Seed the hosted project if it is empty. Seven accounts, the spaces, 196
   documents, then ingest, then five nights of dreams for the dream log, cited
   to the chunks the ingest wrote. Running it twice writes nothing the second
   time. The digests come from `supabase/corpus/dreams`, written once by
   `scripts/generate-dream-digests.mjs`, so the seed spends no tokens on them.

   ```bash
   node --env-file=web/.env.local scripts/seed-demo.mjs
   ```

5. Pin the on-stage timeout. A dream run started from the app then gives up
   after twenty seconds. Compute has its own ten minute budget and ignores it.
   The beta CLI hangs on secrets commands, so this one uses the stable build.

   ```bash
   supabase secrets set SB_DREAM_RUN_BUDGET_MS=20000 --project-ref vvfegdrzrzjyekvrfyoj
   ```

6. Confirm Compute answers. This prints an empty list.

   ```bash
   supabase-beta compute list --project-ref vvfegdrzrzjyekvrfyoj
   ```

### Before every run

1. Delete the hosted instance, so the push on stage is a first deploy. The
   delete is async. `deleting` and then `not deployed` are both fine.

   ```bash
   supabase-beta compute delete dream --project-ref vvfegdrzrzjyekvrfyoj --yes
   supabase-beta compute list --project-ref vvfegdrzrzjyekvrfyoj
   ```

2. Throw away what Codex built last time.

   ```bash
   git worktree remove --force ../magpi-live
   git branch -D live-compute
   ```

3. Reset the finished worktree and put its shared copies back.

   ```bash
   cd ~/Developer/supabase/magpi-compute
   git checkout -- . && git clean -fd && pnpm compute:sync
   ```

4. Clear the runs from the last rehearsal in the SQL editor of the hosted
   project. The seeded nights have no `triggered_by`, so they stay; a run
   started from the button and the digest it wrote go.

   ```sql
   delete from public.documents
   where origin = 'dream'
     and dream_run_id in (select id from public.dream_runs where triggered_by is not null);
   delete from public.dream_runs where triggered_by is not null;
   ```

5. Remove the Magpi connector from ChatGPT. Adding it again registers a new
   client, which is what brings the consent screen back.

6. Open the windows. Terminal in the repo. Codex with the three worktrees.
   Browser tabs: the app signed in as `jane@example.com`, password
   `supabasedemo`; the MCP Server page on supabase.com/library; the Supabase
   dashboard on the project.

### The demo

**1. Ask the brain.**

Do: Chat. Type "When will the Fold product ship?"

Say: This is my company's digital brain. Notion, Linear, Slack and Drive all
feed it. I ask it a question and it answers with citations, in under a second,
without burning tokens on a search. Every night it dreams: it re-reads what came
in that day and links it to everything it already knows.

**2. Watch the dream die.**

Do: Dreams. Engineering. Run now. Let the bar creep. At twenty seconds the run
stops and names the stage it died in.

Say: Dreaming is the expensive part. It runs for minutes, holds a whole space in
memory, and hits the database the entire time. Watch. That is one space, and it
just ran out of time inside an Edge Function. This work belongs next to
Postgres, on something that can run as long as it needs to.

**3. Open Codex.**

Do: Codex, with the three worktrees visible.

Say: I am going to build the dream loop on Supabase Compute. I have three
worktrees going, each with its own local Supabase stack, so I can work on three
things at once without them stepping on each other.

**4. Scaffold the instance.**

Do: Paste this into Codex from the main repo directory.

```
Create a git worktree at ../magpi-live on a new branch live-compute from main, and
work there. Scaffold a Supabase Compute instance called dream for the dream loop:
Deno runtime, 2gb, public. Use the supabase-beta binary for every supabase command.
Read .claude/skills/supabase-compute/SKILL.md first. Do not deploy anything yet.
Show me the config block it added and the folder it created.
```

What it runs underneath, which you can say while it works:

```bash
git worktree add ../magpi-live -b live-compute main
cd ../magpi-live
supabase-beta compute new dream --runtime deno --size 2gb --exposure public
```

Say: Compute runs Deno, Node or Docker today. I want Deno, two gigabytes. That
gave me a config block and an empty folder. Nothing is deployed yet.

**5. Hand Codex the real job.**

Do: Paste this into the same Codex session. Let it start, then switch to the
magpi-compute worktree, where this prompt has already finished.

```
Move the dream and ingest loop onto the dream Compute instance. Reuse the job
bodies in supabase/functions/_shared/jobs. The loop picks up queued ingest jobs
and dream runs, runs them with a ten minute budget, and goes back for more; sleep
five seconds when the queue is empty. Requeue any dream run that timed out inside
an Edge Function in the last hour. Do not deploy.
```

Say: Codex has the Supabase skill, so it already knows the commands. I kicked
this same prompt off earlier in another worktree, so let's jump there and see
what it built.

**6. Show the code.**

Do: Open `supabase/config.toml` and scroll to the `[compute.dream]` block at the
end. Open `supabase/compute/dream/main.ts`.

Say: One block of config. One file. It is a loop: pick up work, do it, go back
for more, for as long as there is work. Each run gets ten minutes instead of
forty five seconds. If you have written a Node server or a Dockerfile, you have
already written a Compute instance.

**7. Push it live.**

```bash
cd ~/Developer/supabase/magpi-compute
SUPABASE_CLI=supabase-beta pnpm compute:push
supabase-beta compute status dream
curl https://vvfegdrzrzjyekvrfyoj.supabase.co/compute/v1/dream/
```

Say: Deploying works like an Edge Function. One command. It is serving in about
fifteen seconds. And look at the counters: it has already picked up the run that
died a minute ago and finished it.

**8. Scale it.**

```bash
supabase-beta compute push dream --instances 8
supabase-beta compute status dream
```

Say: There are four hundred thousand documents behind a real company. I can run
as many instances as I want and Supabase spreads the queue across them. That is
eight.

**9. Give the brain to ChatGPT.**

Do, in order:

1. Library tab. MCP Server page. Press Copy Prompt.
2. In Magpi: Settings, MCP and API. Copy the address.
3. ChatGPT: Settings, Connectors, Create. Paste
   `https://vvfegdrzrzjyekvrfyoj.supabase.co/functions/v1/mcp-server`.
4. The consent screen opens in the app. Press Allow.
5. In ChatGPT, ask "When will the Fold product ship?"

Say: The brain is useful once it lives inside the tools people already use. So
let's give Magpi an MCP server. It is a library block: one command to add, or
copy this prompt and let your agent do it. I did that. Five tools, deployed like
any other function.

ChatGPT asks me to sign in. This server runs as me. Row Level Security decides
what it can see, and I did not write a line of that.

Same question I asked five minutes ago. This time the answer has last night's
dreams in it, plus what ChatGPT knows on its own. Sign in as someone in Finance
and the answer changes, with no error and no dialog. The boundary is the
database's, not the agent's.

**10. Close.**

Say: Supabase Compute runs the work that is too big for a function, next to
your database. Your MCP server lives there too. It is in private alpha today,
and we would like you to try it.

### After the run

Do "Before every run" again, so the next one starts clean.

### Known gaps

- There is no per-user list of authorized agents in Magpi yet. Removing the
  connector in ChatGPT is the reset.
- The Compute variant of the MCP Server block is not on the library site. Step
  9 uses the Edge Function block, which is what is deployed.
- The compute loop requeues a run that timed out in the last hour, so the
  counters in step 7 should show the rescued run within its first pass. If
  status is slow, the curl to the instance URL is the faster read.

## Licence

MIT. The sample corpus is openly licensed or synthetic.
