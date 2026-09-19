# MCP server

Magpi's MCP server is one Edge Function at `supabase/functions/mcp-server/`,
built on what Supabase ships for this: `withOAuthProtectedResource` and
`withSupabase` from `@supabase/server`, and `@modelcontextprotocol/server` 2.x
for the protocol itself. The five tools are hand-written, one file each, under
`tools/`.

## How a caller gets in

Two ways, both of which end with the same thing: a verified Supabase user token,
and a database client scoped to whoever sent it.

**The product's own session.** A backend that already has a signed-in user
forwards their access token. Nothing to approve, because the person is already
signed in to Magpi.

**An external client, over OAuth.** Claude, or anything else with a Connect
button, gets a 401 carrying `WWW-Authenticate: Bearer resource_metadata="…"`.
That points at `/functions/v1/mcp-server/oauth-protected-resource`, which names
Supabase Auth as the authorization server. The client registers itself, the
person is sent to `/oauth/consent` in the web app to approve it, and the token
that comes back is theirs. `whoami` reports `client_id` for one of these and
null for a forwarded session, which is how you tell them apart.

The function carries `verify_jwt = false` in `config.toml`, because the gateway's
own check would answer a bare 401 to the discovery request and an MCP client
would have nowhere to go. `withSupabase({ auth: 'user' })` verifies everything
else.

Three things have to be true of the project, and all three are in
`supabase/config.toml`: the OAuth 2.1 server is on, dynamic client registration
is on, and JWTs are signed with an asymmetric key. The last one is not optional:
a project still on the legacy HS256 secret publishes no keys at JWKS, so no
token can be verified. `supabase gen signing-key --algorithm ES256` makes one.

## The tools

Every one of them reaches the database through the caller's own JWT with row
level security enabled, so the MCP server has no permission model of its own to
keep in sync.

The pattern that makes this work is worth stating once. A caller with no access
to a space sees a smaller result of the same shape. There is no permission
error, no partial-result warning, and no field saying something was withheld,
because a count of hidden rows is itself a disclosure about their existence.

### `fetch`

ChatGPT's connector contract names two tools, `search` and `fetch`. This is
`get_document` under that name, taking `{ id }` and answering `{ id, title,
text, url, metadata }`.

### `whoami`

Proves the transport and the auth path work end to end. Takes no arguments,
returns the identity of the caller as resolved from the verified JWT.

Output:

```json
{
  "user_id": "uuid",
  "email": "string",
  "client_id": "string | null",
  "org_id": "uuid",
  "space_count": 3
}
```

`space_count` is the number of rows returned by `public.visible_space_ids()`.
A caller with a valid token always sees at least two, because every user gets a
personal space and an org space on signup. A caller without a valid token gets a
transport-level authentication error and no tool list.

### `search`

The primary tool. Answers a question across everything the caller can see.

```json
{
  "name": "search",
  "description": "Search the caller's knowledge base and return matching passages with their source documents.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The question or phrase to search for.",
        "minLength": 1,
        "maxLength": 1000
      },
      "space_ids": {
        "type": "array",
        "description": "Narrow the search to these spaces. Omit to search every space the caller can see. Ids the caller cannot see are ignored.",
        "items": { "type": "string", "format": "uuid" },
        "maxItems": 50
      },
      "limit": {
        "type": "integer",
        "description": "Maximum passages to return.",
        "minimum": 1,
        "maximum": 50,
        "default": 20
      }
    },
    "required": ["query"],
    "additionalProperties": false
  }
}
```

Output:

```json
{
  "results": [
    {
      "chunk_id": "uuid",
      "document_id": "uuid",
      "space_id": "uuid",
      "document_title": "string",
      "document_url": "string | null",
      "content": "string",
      "score": 0.0325
    }
  ]
}
```

**RLS path.** The server embeds the query with the pinned embedding model, then
calls `public.search(query_embedding, query_text, space_filter, match_count)`.
That function is `security invoker`, so the `chunks_select_visible` policy
applies, restricting rows to `space_id in (select public.visible_space_ids())`.
Document titles and urls are resolved in a second select against `documents`,
which is filtered by the same predicate through `documents_select_visible`.

**Without access.** A caller who cannot see a space gets results drawn only from
the spaces they can see. Passing a `space_ids` entry for a space they cannot see
narrows the search to nothing for that id and returns no error, because
distinguishing "that space does not exist" from "you cannot see that space"
tells the caller a space exists.

### `get_document`

Fetches one document in full, for when a search result is not enough context.

```json
{
  "name": "get_document",
  "description": "Return the full text and metadata of one document.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "document_id": { "type": "string", "format": "uuid" }
    },
    "required": ["document_id"],
    "additionalProperties": false
  }
}
```

Output:

```json
{
  "document_id": "uuid",
  "space_id": "uuid",
  "title": "string",
  "url": "string | null",
  "origin": "upload | sync | dream",
  "mime_type": "string",
  "updated_at": "timestamptz",
  "content": "string",
  "chunk_count": 42
}
```

`content` is the document's chunks concatenated in ordinal order, which is the
text Magpi actually indexed rather than the original file bytes.

**RLS path.** A select on `documents` under `documents_select_visible`, then a
select on `chunks` ordered by `ordinal` under `chunks_select_visible`. Both
policies test the same `visible_space_ids()` predicate, so a document and its
chunks can never disagree about visibility.

**Without access.** The select returns zero rows and the tool returns a
not-found error naming the id the caller passed. It is the same error a caller
gets for an id that was never issued. A dream document behaves identically to an
uploaded one here, because `documents.origin` changes nothing about the policy.

### `list_spaces`

Tells the caller what boundaries exist, so a client can offer a filter without
guessing.

```json
{
  "name": "list_spaces",
  "description": "List the spaces the caller can see.",
  "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
}
```

Output:

```json
{
  "spaces": [
    {
      "space_id": "uuid",
      "name": "string",
      "kind": "personal | team | org",
      "document_count": 128,
      "dreaming_enabled": true
    }
  ]
}
```

**RLS path.** A select on `spaces` under the spaces select policy, which admits
rows through `space_members` for the calling user. `document_count` is a count
over `documents` under `documents_select_visible`, so it counts the same rows
`search` and `get_document` would return.

**Without access.** A space the caller is not a member of is absent from the
array. There is no entry with a null name, no count of omitted spaces, and no
flag. An MCP client cannot tell the difference between an organization with
three spaces and an organization with thirty of which the caller sees three.

### `add_note`

The one write. Puts text into a space as a document, so an agent can file
something it worked out.

```json
{
  "name": "add_note",
  "description": "Write a note into one space as a document. The note is chunked, embedded and searchable like any other document.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "space_id": { "type": "string", "format": "uuid" },
      "title": { "type": "string", "minLength": 1, "maxLength": 200 },
      "content": { "type": "string", "minLength": 1, "maxLength": 100000 }
    },
    "required": ["space_id", "title", "content"],
    "additionalProperties": false
  }
}
```

Output:

```json
{
  "document_id": "uuid",
  "space_id": "uuid",
  "ingest_job_id": "uuid",
  "status": "queued"
}
```

The note's text goes to the uploads bucket under the space, the document row
points at it, and an ingest job reads it back the way it reads any other upload.
So the tool returns before the note is searchable. The caller polls
`get_document` or watches `chunk_count` if it needs to know when indexing
finished.

**RLS path.** This one is different from the other three and the difference is
the point. Writes to `documents` and `chunks` happen only under the service role
inside an edge function, because those tables carry select policies and no
insert policies at all. So `add_note` calls
`public.is_space_member(p_space_id)` with the caller's JWT first, gets a boolean
back through the caller's own RLS context, and only then switches to the service
role to insert the `documents` row and enqueue the `ingest_jobs` row. The
membership check is explicit and separate precisely because the service role
would otherwise write anywhere.

It also calls `public.check_ingest_allowed(org_id)` before writing, so a note
cannot take an organization past its plan's document limit through a path the
web app does not use.

**Without access.** A caller who is not a member of the target space gets an
explicit permission error naming the space id, and nothing is written. This is
the one place where the silent-narrowing rule does not apply: the caller passed
a specific id and expects a specific effect, and returning success for a write
that did not happen is worse than confirming that a space id exists.

## What a search costs

A search embeds the question and reads the index. It does not call a chat model,
because the caller is one. It is still metered: `check_query_allowed` runs first
and a `usage_events` row with `kind = 'query'` is written after, the same as an
answered question in the web app. An MCP path that skipped the meter would be a
hole in every plan limit.

## Where this came from

The Supabase Library block `mcp-server` is the skeleton, and `oauth-consent`
is the shape of the consent screen, rewritten in Magpi's own design rather than
installed. Tool generation from the PostgREST schema, which is the other half of
that launch, is deliberately not used: Magpi's five tools are curated, and a
generated set would offer `create_chunks` and `delete_documents` to anything
that connected.

## Verify external OAuth locally

Start local Supabase and serve the current Edge Functions with the local service
credential and a working `OPENAI_API_KEY`. Then run:

```sh
pnpm test:mcp-oauth
```

The command uses `supabase-beta` by default; set `SB_CLI` to use another local
Supabase CLI. It creates an isolated public OAuth client and two temporary users.
It checks the unauthenticated challenge and discovery documents, exchanges a
real authorization code with S256 PKCE, and verifies the issued token includes
the external client ID. All MCP calls use that OAuth token: initialization,
tool listing, caller identity, and searches that must exclude the other user's
document. The fixture user's session approves consent through Supabase Auth.

The check makes two real embedding requests. Run it as an explicit integration
check when the local functions and model credentials are available. It shares
the browser/integration fixture lock, deletes its users, organizations, and
OAuth client afterward, and prints no tokens or credentials. It refuses a
non-local Supabase URL. The light gate does not run this check.

A passing local check verifies the server's external OAuth flow. A named client
such as Claude or ChatGPT still needs its own connection rehearsal against the
deployed endpoint.
