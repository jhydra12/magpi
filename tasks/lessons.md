# Project lessons

- Use `supabase-beta` for Supabase CLI commands in this project, including Compute commands. Interpret skill examples using `supabase` accordingly.
- Prioritize speed: TDD is optional in this repository. Implement directly and choose verification based on the change; avoid requiring the full test, lint, and build suite for every task.
- "Digital Brain" is this app (Magpi) as seen from ChatGPT and Codex. "BYO MCP" is the Supabase alpha package (`@supabase/server` `withOAuthProtectedResource` + `withSupabase`) the MCP server is built on. Do not go looking for a separate project.
- The MCP server is OAuth only. Never configure it in a client with a static bearer token or a bearer env var; that turns off the client's OAuth discovery.
