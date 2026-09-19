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
people, 34 shared spaces and three personal spaces. This loads it into the project `web/.env.local`
points at:

```bash
node --env-file=web/.env.local scripts/seed-demo.mjs
```

| Person            | Email             | Sees                            |
| ----------------- | ----------------- | ------------------------------- |
| Jane Okonkwo, CEO | jane@example.com  | All shared spaces               |
| Sam Lindqvist     | sam@example.com   | Company, Engineering            |
| Ben Achilov       | ben@example.com   | Company, Marketing, Engineering |
| Maya Restrepo     | maya@example.com  | Company, Marketing              |
| Priya Raghunathan | priya@example.com | Company, Marketing              |
| John Mbeki        | john@example.com  | Company, Engineering, Finance   |
| Dana Provenzano   | dana@example.com  | Company, Finance                |

Every account uses the password `supabasedemo`. Jane is in every shared space,
so she is the account the demo signs in as. `SB_DEMO_LOGIN=true` adds three
quick-login buttons under the sign-in form. Never set it on a deployment that
holds anything real.

## How it works

- Every document lives in exactly one space: personal, team or org. Row Level
  Security is on for every table, and search runs inside it, so two people can
  ask the same question and get different answers with no error.
- Search is hybrid: pgvector plus full text, merged with reciprocal rank fusion.
- Ingestion and queued Dream jobs run on the Node Compute service. The manual
  Dream Edge Function validates access and queues a run. See `docs/demo.md`.
- The MCP server is the Supabase Library's MCP Server block with five tools on
  it. Agents sign in through the library's OAuth Consent flow and act as the
  person who approved them.

More in `docs/`: `mcp.md`, `limits.md`, `retrieval.md`, `decisions.md`.

## Deploying

Ingestion and Dream processing run on the Node 2 GB `dream` instance. See
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

The web app builds from Vercel's Git integration. Production promotion waits for the `Production release ready` GitHub check. On main, deployment also reconciles the source corpus into the existing organization named by the `DEMO_ORG_SLUG` repository variable and waits for ingestion. This step preserves users and existing Dream outputs and creates no synthetic history. The configured Supabase project must expose its service-role key to the authenticated deployment CLI.

## Tests

`pnpm gate:light` is format, lint, typecheck, unit tests and build. It runs on
pre-push and in CI. `pnpm gate` adds pgTAP, integration, browser journeys and
coverage. The light gate also runs Compute, rehearsal, and source-seeding regression tests. Supabase deployment waits for that gate on the same commit. The Vercel production project requires the GitHub check `Production release ready` before assigning production domains. That job succeeds only after validation and Supabase migration, Edge Function, Compute deployment, and source-document ingestion succeed for the same commit. Compute deployment preserves the current declared instance count.

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

4. Seed source documents and ingest them. The source manifest defines the document count;
   `pnpm check:corpus` validates and reports it. The default seed creates no Dream
   results or model-usage fixtures. Reruns update source bytes, repair missing jobs,
   and let the worker skip embeddings when processed content is unchanged.
   Apply database migrations and deploy the ingest worker before seeding.

   ```bash
   node --env-file=web/.env.local scripts/seed-demo.mjs
   ```

   Completion requires every document's latest ingestion attempt in the target
   organization to succeed. Earlier failed attempts remain as history. Errors require investigation and a retry.

   For an explicitly synthetic history, use `--with-history-fixtures`. This
   adds fabricated historical runs, model-usage records, and prewritten digests.
   It uses fixed corpus dates and deterministic IDs so retries repair partial
   fixture writes. It does not demonstrate actual Dream execution. Existing
   history from earlier seeds is preserved by source-only seeding.

5. Rehearse the full Dream: **Start dreaming** queues a daily summary, entity
   extraction, and document links. Verify saved results for all three. Record
   the runtime, application budget, and concurrency used in each take. See
   [Dream rehearsal](docs/dream-rehearsal.md) for the full three-task, one-versus-eleven comparison and [demo positioning](docs/compute-demo-positioning.md) for the claims to verify.

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

3. Build the finished worktree containing this branch's Dream worker.

   ```bash
   cd ~/Developer/supabase/magpi-compute
   pnpm compute:build
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

Recording: retain elapsed-time labels when cutting waits. Use actual logs and
saved output. The progress bar measures completed tasks out of three; elapsed
time continues during each task. Keep `SB_DREAM_CONCURRENCY=1` fixed when
comparing one and eleven Compute instances. Hosted Edge-to-Compute speedup
remains unverified. See [Dream rehearsal](docs/dream-rehearsal.md).

**1. Ask the brain.**

Do: Chat. Type "When will the Fold product ship?"

Say: This is my company's digital brain. Notion, Linear, Slack and Drive all
feed it. I ask it a question and it answers with citations. Every night it dreams: it re-reads what came
in that day and links it to everything it already knows.

**2. Start dreaming.**

Do: Dreams. Engineering. Start dreaming. Show the three tasks and their elapsed
time. Use a separately rehearsed Edge take only after verifying the same
inputs and outputs. Describe any failure using the recorded error and budget.

Say: Dreaming reads the documents, writes a daily summary, finds people and
projects, and links related documents. I want this queue to keep processing as
the company adds more work. Let's move it to Compute and measure it.

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
Node runtime, 2gb, public. Use the supabase-beta binary for every supabase command.
Read .claude/skills/supabase-compute/SKILL.md first. Do not deploy anything yet.
Show me the config block it added and the folder it created.
```

What it runs underneath, which you can say while it works:

```bash
git worktree add ../magpi-live -b live-compute main
cd ../magpi-live
supabase-beta compute new dream --runtime node --size 2gb --exposure public
```

Say: Compute runs Deno, Node or Docker today. I want Node, two gigabytes. That
gave me a config block and an empty folder. Nothing is deployed yet.

**5. Hand Codex the real job.**

Do: Paste this into the same Codex session. Let it start, then switch to the
magpi-compute worktree, where this prompt has already finished.

```
Move my existing Dream processing onto the dream Compute instance. Reuse the job
bodies in supabase/functions/_shared/jobs. Queue manual Dream requests and process
them on Compute with a five-minute budget and one Dream job at a time per instance.
Keep ingestion running. Record processing stages in logs. Do not deploy.
```

Say: Codex has the Supabase skill, so it already knows the commands. I kicked
this same prompt off earlier in another worktree, so let's jump there and see
what it built.

**6. Show the code.**

Do: Open `supabase/config.toml` and scroll to the `[compute.dream]` block at the
end. Open `supabase/compute/dream/src/index.ts` and the Dream worker it starts.

Say: The worker picks up a queued Dream, processes it, and goes back for more.
Each run gets five minutes with this configuration. If you have written a Node
server or a Dockerfile, you have already written a Compute instance.

**7. Push it live.**

```bash
cd ~/Developer/supabase/magpi-compute
pnpm compute:push --project-ref vvfegdrzrzjyekvrfyoj
supabase-beta compute status dream --project-ref vvfegdrzrzjyekvrfyoj
curl https://vvfegdrzrzjyekvrfyoj.supabase.co/compute/v1/dream/
```

Say: Deploying works like an Edge Function. One command. Let's check its status.

Do: With the queue-only endpoint deployed, return to Dreams, Engineering,
Start dreaming. Follow all three run IDs in the logs:

```bash
supabase-beta compute logs dream --kind app -f --project-ref vvfegdrzrzjyekvrfyoj
```

Do: Show processing stages and completed-task counts. Open the daily summary
and its sources, the saved entities, and the document links in the Log tab.

Say: It is processing the documents now. Here is the summary it produced, with
the documents it used.

**8. Scale it.**

Do: Prepare the full batch with `--count 37 --kind all` as described in
`docs/dream-rehearsal.md`. It queues 111 summary, entity, and document-link jobs
in temporary spaces. Open its printed Dreams URL. With one instance, show jobs waiting, one job running,
the remaining count, and completions in the last 30 seconds. Scale while there
is still work waiting:

```bash
supabase-beta compute push dream --instances 11 --project-ref vvfegdrzrzjyekvrfyoj
supabase-beta compute status dream --project-ref vvfegdrzrzjyekvrfyoj
```

Do: Return to the same batch. Show multiple jobs running, the remaining count,
and completions in the last 30 seconds. Keep batch elapsed
time visible. Quote a speed comparison only from separate rehearsals with the
same source documents, job count, and per-instance concurrency.

Do: Open Entities while jobs run. Show the graph updating from saved entity mentions.

Say: There are more Dreams waiting. I will add ten instances. Each
instance picks up separate jobs. Watch the completion count and elapsed time.

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

Say: Supabase Compute runs these background workers next to your database.
We can add instances as the queue grows. It is in private alpha today,
and we would like you to try it.

### After the run

Do "Before every run" again, so the next one starts clean.

### Known gaps

- There is no per-user list of authorized agents in Magpi yet. Removing the
  connector in ChatGPT is the reset.
- The Compute variant of the MCP Server block is not on the library site. Step
  9 uses the Edge Function block, which is what is deployed.
- Start a fresh Dream after switching to Compute. Interrupted runs are marked
  as timed out; partial output is not automatically retried. Use the rehearsal
  manifest to clean up only its temporary spaces after the batch finishes.

## Licence

MIT. The sample corpus is openly licensed or synthetic.
