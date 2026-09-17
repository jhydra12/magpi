# Select 2026 keynote demo, Theme 1

Five minutes. Terminal, Codex with three worktrees, and the app in a browser.
The hosted project is `vvfegdrzrzjyekvrfyoj`, enrolled in the Compute alpha.

On a laptop where the stable CLI is also installed, type `supabase-beta`
wherever a command below says `supabase`. On the stage machine install only
the beta, so the skill works as written.

## Setup, once

1. Clone and install.

   ```bash
   git clone git@github.com:supabase/select-2026-demo.git ~/Developer/supabase/select-2026-demo
   cd ~/Developer/supabase/select-2026-demo
   pnpm install
   npm install -g supabase@beta
   supabase login
   supabase link --project-ref vvfegdrzrzjyekvrfyoj
   ```

2. Get the two env files from whoever has them and put them at
   `web/.env.local` and `supabase/.env`. Neither is committed.

3. Create the worktrees. Each has its own project id and port range in
   config.toml, so the two decoy stacks run side by side. The compute worktree
   shares main's ports and does not run a stack of its own.

   ```bash
   git worktree add ../magpi-compute compute-dream
   git worktree add ../magpi-feature-a feature-a
   git worktree add ../magpi-feature-b feature-b
   cp supabase/.env ../magpi-compute/supabase/.env
   cp supabase/.env ../magpi-feature-a/supabase/.env
   cp supabase/.env ../magpi-feature-b/supabase/.env
   (cd ../magpi-feature-a && supabase start -x imgproxy,logflare,vector,supavisor)
   (cd ../magpi-feature-b && supabase start -x imgproxy,logflare,vector,supavisor)
   ```

4. Seed the hosted project if it is empty. It creates the seven accounts,
   the spaces and 196 documents, then ingests them. Running it twice writes
   nothing the second time.

   ```bash
   node --env-file=web/.env.local scripts/seed-demo.mjs
   ```

5. Pin the on-stage timeout. With this secret set, a dream run started from the
   app gives up after twenty seconds, which is the failure step 2 needs. Compute
   has its own ten minute budget and ignores it.

   ```bash
   supabase secrets set SB_DREAM_RUN_BUDGET_MS=20000 --project-ref vvfegdrzrzjyekvrfyoj
   ```

6. Confirm Compute answers. This should print an empty list.

   ```bash
   supabase compute list --project-ref vvfegdrzrzjyekvrfyoj
   ```

## Before every run

1. Delete the hosted instance, so the push on stage is a first deploy. The
   delete is async. `deleting` and then `not deployed` are both fine.

   ```bash
   supabase compute delete dream --project-ref vvfegdrzrzjyekvrfyoj --yes
   supabase compute list --project-ref vvfegdrzrzjyekvrfyoj
   ```

2. Throw away what Codex built last time, if anything.

   ```bash
   git worktree remove --force ../magpi-live
   git branch -D live-compute
   ```

3. Reset the finished worktree and put its shared copies back.

   ```bash
   cd ~/Developer/supabase/magpi-compute
   git checkout -- . && git clean -fd && pnpm compute:sync
   ```

4. Clear the runs in the SQL editor of the hosted project, so the Runs list
   starts empty.

   ```sql
   delete from public.dream_runs;
   ```

5. Remove the Magpi connector from ChatGPT. Adding it again registers a new
   client, which is what makes the consent screen appear.

6. Open the windows. Terminal in the repo. Codex with the three worktrees.
   Browser tabs: the app, signed in as `jane@example.com` with password
   `supabasedemo`; the MCP Server page on supabase.com/library; the Supabase
   dashboard on the project.

## The demo

1. **Ask Magpi a question.** In Chat: "When will the Fold product ship?"
   The answer comes back with citations.

2. **Start a dream.** Dreams, Engineering, Run now. The bar creeps while the
   run reads the space, and after twenty seconds the run times out and says
   which stage it died in. That is the budget pinned in setup step 5. The line
   to say is that a whole space does not fit inside one Edge Function.

3. **Open Codex.** Three worktrees, two stacks running. Say what they are.

4. **Scaffold the instance.** In a new worktree, ask Codex, or type it. Say
   "Deno, two gigabytes" to match. Nothing deploys yet.

   ```bash
   supabase compute new dream --runtime deno --size 2gb --exposure public
   ```

5. **Ask Codex to move the dream loop onto Compute.** Let it start, then
   switch to the finished worktree, `magpi-compute`, where the same prompt
   already ran.

6. **Show the result.** One config block, `[compute.dream]` at the end of
   `supabase/config.toml`, and one file, `supabase/compute/dream/main.ts`.
   It is a loop: pick up work, do it, go back for more.

7. **Push it live.** From `magpi-compute`. Serving takes about fifteen
   seconds. Logs lag a minute or two, so use status and the URL, not logs.

   ```bash
   pnpm compute:push
   supabase compute status dream
   curl https://vvfegdrzrzjyekvrfyoj.supabase.co/compute/v1/dream/
   ```

8. **Scale it.** Eight instances. Supabase spreads the queue across them.

   ```bash
   supabase compute push dream --instances 8
   supabase compute status dream
   ```

9. **Give Magpi to an agent.** Magpi's MCP server is the library's MCP
   Server block with five tools on it, and it is already deployed.

   1. Open the MCP Server page on supabase.com/library and press Copy
      Prompt. Say that this is what you handed Codex to build it.
   2. In Magpi, Settings, MCP and API. Copy the server address. It is
      `https://vvfegdrzrzjyekvrfyoj.supabase.co/functions/v1/mcp-server`.
   3. In ChatGPT: Settings, Connectors, Create, paste the address. ChatGPT
      registers itself with the project's OAuth server. The server has the
      `search` and `fetch` tools ChatGPT looks for, plus three more.
   4. The consent screen opens at `/oauth/consent` in the app. It names the
      client and says the agent will act as you. Press Allow.
   5. Ask ChatGPT the question from step 1. The answer has the same
      citations, plus last night's dreams, plus what the model knows on its
      own. Ask it as a different account and the answer is shorter, with no
      error, because row level security decides what each person sees.

10. **Close.** Compute runs the work that is too big for a function, next to
    the database. The MCP server lives on the same project. Private alpha,
    and we would like you to try it.

## After the run

Do "Before every run" again, so the next one starts clean.

## Known gaps

- There is no per-user list of authorized agents in Magpi yet. Removing the
  connector in the client is the reset.
- The Compute variant of the MCP Server block is not on the library site.
  Step 9 uses the Edge Function block, which is what is deployed.
