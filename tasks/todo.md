# Session queue, 2026-09-17: demo ready on the work repo

- [x] Header: drop Spaces and Documents from the section nav
- [x] Connections: one section per provider with its mark, an inert "Add another",
      one row per connection with an inert Reconnect and Disconnect
- [x] Doppler out of scripts, .gitignore, deploy.yml and the two docs that give commands
- [x] Function secrets come from a local file: `supabase/.env.hosted` + `pnpm secrets:push`
- [x] deploy.yml runs on every push to main, not only when supabase/ changes
- [x] Push a PR and confirm the light gate and deploy actually trigger on the new repo
      (nothing but a manual dispatch has run so far)
- [ ] Vercel: left for Supabase IT. The Vercel GitHub app cannot see the repo yet.

## Review

PR #3. Light gate ran on the pull_request event and passed, the first push- or
PR-triggered run on this repo (the two earlier merges produced no run at all, and
the one green deploy was a manual dispatch). Merging it pushes to main, which runs
deploy.yml: db push plus functions deploy. Web deploy waits on Supabase IT linking
a Vercel project to the repo. Two repository secrets are unused by any workflow,
SUPABASE_PROJECT_ID (the variable of the same name is what deploy.yml reads) and
SUPABASE_AUTH_HOOK_SECRET (deploy.yml reads SB_AUTH_HOOK_SECRET).

---

# Session queue

Four things asked for in this session, in the order they will be done. The first
two are already underway.

## 1. Comment pass, one line each (in flight)

Every multi-line comment in the repo cut to a single line saying what the code
does. 304 files, 975 blocks, 5207 comment lines. Eight agents working disjoint
file lists.

Excluded: `web/styles/supabase/**` (vendored from upstream, re-synced by
`scripts/sync-tokens.mjs`) and `web/lib/database.types.ts` (generated).

- [x] Rule written, agents dispatched
- [x] Verifier built: parses each changed file, prints it without comments,
      compares before against after. Self-tested against a flipped operator, a
      changed string and a deleted line, all three caught.
- [x] Agents finish
- [x] Verify, run the gate, commit (916d71a, c2862be, e8e47da)
- [ ] `web/app/(marketing)/page.tsx` done by hand, last, because the copy in it
      is being edited live

## 2. Team spaces cannot be created

`createTeamSpace` sends `insert ... select('id').single()`. Postgres applies the
SELECT policy to the RETURNING clause, `spaces_select_member` is membership only,
and the creator is not a member of the space yet, so the row it just wrote is
invisible and the statement is refused. Reproduced against the local database:
the same insert without RETURNING succeeds.

Fix: one `security definer` function that checks org membership, inserts the
space and enrols the creator, and returns the id. This also closes the window
where the second insert fails and leaves a team space with no members, which the
current code has an error message for and no way to recover from.

- [x] `public.create_team_space(p_org_id uuid, p_name text)` in `80_functions.sql`
- [x] Migration, regenerated types
- [x] Action calls the rpc, second insert and its error branch removed
- [x] Five pgTAP assertions, proven to fail when the enrolment is removed
- [x] Unit tests rewritten for the single-statement path

Done in 9527128.

## 3. App chrome

- [ ] Constrained, centred viewport on every main page, header included
- [ ] Section links (Chat, Spaces, Documents, Connections, Dreams) move into the
      header, replacing the tab strip row below it
- [ ] Breadcrumb bar pinned to the bottom edge of the header, inside the same
      constrained width as the rest of the site
- [ ] Footer added to the app shell, theme selector at its bottom right
- [ ] Avatar becomes a dropdown holding Settings and Sign out, plus Admin when
      the signed-in person is an owner or admin
- [ ] Admin gets its own left nav instead of a tab bar
- [ ] New Admin nav item, Searches, holding Search activity, Top questions and
      Questions per day

## 4. Chat screen

- [ ] Conversation rail organised into folders
- [ ] A folder carries a colour
- [ ] New conversation: composer centred, with the greeting above it
- [ ] Existing conversation: composer pinned to the bottom
- [ ] The first question animates the composer from centre to bottom

Schema, decided:

- `conversation_folders`: id, user_id, org_id, name, color, position. Private to
  one person, RLS is `user_id = auth.uid()`.
- `conversations.folder_id`, nullable. Null means unfiled.
- `folder_color` is an enum of names mapping to Supabase semantic tokens. No hex
  column, because `scripts/check-raw-color.mjs` fails the gate on a raw colour
  and an exemption for one column would be the first hole in that rule.

## 5. First deploy to the hosted project (vvfegdrzrzjyekvrfyoj)

- [x] Link the repo to the project
- [x] Copy non-Supabase secrets from Doppler dev to stg and prd, delete unused dev keys
- [x] Fix the gate: pnpm version pinned twice, every run failed in 12s
- [x] Add deploy.yml: db push and functions deploy on push to main (needs SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD repo secrets)
- [x] db push --include-seed, seed buckets. db diff found pg_net missing on hosted; migration added and pushed
- [x] Function secrets from Doppler prd, 14 functions deployed, cron Vault secrets set
- [x] Email hook in the dashboard, secret from Doppler prd pushed to functions
- [x] CI: Doppler service tokens as DOPPLER_TOKEN_DEV / DOPPLER_TOKEN_PRD, deploy runs under Doppler prd
- [x] Vercel: root directory web, build overrides cleared, root vercel.json removed, production Ready
- [x] CI gate: five vendored CSS files under web/styles/supabase/packages/ui/build were hidden by the build/ ignore rule; un-ignored and added. .agents excluded from prettier
- [ ] Deploy: functions deploy gets 403, the SUPABASE_ACCESS_TOKEN in GitHub cannot write functions. Needs a new token
- [ ] Commit and push the working tree
- [ ] Web on Vercel and the domain-dependent auth URLs (deferred)
