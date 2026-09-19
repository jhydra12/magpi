# Project lessons

- Use `supabase-beta` for Supabase CLI commands in this project, including Compute commands. Interpret skill examples using `supabase` accordingly.
- Prioritize speed: TDD is optional in this repository. Implement directly and choose verification based on the change; avoid requiring the full test, lint, and build suite for every task.
- "Digital Brain" is this app (Magpi) as seen from ChatGPT and Codex. "BYO MCP" is the Supabase alpha package (`@supabase/server` `withOAuthProtectedResource` + `withSupabase`) the MCP server is built on. Do not go looking for a separate project.
- The MCP server is OAuth only. Never configure it in a client with a static bearer token or a bearer env var; that turns off the client's OAuth discovery.
- The keynote demo centers on moving the Dream process to Supabase Compute. Treat the current ingestion-only Compute worker as an implementation gap to fix; preserve the intended demo when recommending changes.
- Keep the default browser preview clean with the standard seed data. Do not create rehearsal spaces just to show the app; prepare those only for an explicit scaling rehearsal and remove them afterward.
- After resetting the local preview, start its Compute worker as well as the web app and Edge Functions. Verify that an existing manual Dream moves from queued to completed before handing back a working preview.
- Keep Dream progress beside the space that started it, with an elapsed timer. Put historical Dream details in the Log tab; keep the normal page free of explanatory paragraphs, selectors, switches, and aggregate counters.
- Show Dream progress from worker-confirmed completed steps. An elapsed timer or moving activity animation cannot stand in for measured completion.
- Center the next Dream time in the same space used for progress, and show only one of them at a time, including after completion.
- For the demo, hide finished inline Dream progress after five minutes or a page reload; keep active runs visible and retain history in Log.
- Start dreaming means the complete workflow: entities, a summary, and document links. Removing a task selector must preserve all three operations.
- Validate Compute speed claims with identical real work. App timeouts and scheduled queue delays are not platform limits, and more documents cannot increase work beyond fixed input caps.
- Add a regression test whenever a Dream control or graph ID changes: global starts must leave navigation interactive, and every graph link must point to an existing node ID.
- Verify graph fixes in the production browser: hover hit-testing does not prove that WebGL rendered. Inspect console errors and visually confirm nodes and links before reporting success. Canvas fillStyle preserves OKLCH; convert via getImageData when a renderer requires sRGB.
- When stopping live entity polling after jobs complete, read activity before entity evidence so the final committed output is included in the last response.
- Keep Compute positioning tied to current product sources and measured runs. Distinguish private-alpha capabilities from future networking and runtime plans.
