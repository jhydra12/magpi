# Mobile spec

This is a contract, not documentation. `/ios` and `/android` are buildable
overnight from this file, with no design decisions left open, and that works
only if the file is maintained as the web app is built.

**Every screen or feature added to web gets an entry here in the same commit.**
`node scripts/mobile-spec-check.mjs` fails the gate on three things: a route
under `web/app/(app)/` with no entry here, an entry missing one of the fourteen
fields, and a repository path cited anywhere in this file that does not exist on
disk. Everything else in an entry is checked by a person reading it.

## How to read an entry

Every entry has the same fourteen fields, in the same order. A field that
genuinely does not apply says `n/a` and why. A field that has not been decided is
a bug in this file.

Two of the fourteen describe things that do not exist yet on any platform, and
both are named so that a reader cannot mistake them for a description of shipped
code. Proposed string keys and proposed analytics events are the contract for
what gets built, and neither is wired up today. See "String catalog" and
"Analytics events" below.

- **Web route.** The path under `web/app/(app)/`.
- **Deep link.** `magpi://` scheme plus path. Universal links map the same
  paths off the web origin.
- **Data contract.** The exact RPC or table, and the generated type name from
  `web/lib/database.types.ts`.
- **Loading, empty, error, content.** What each state shows. All four are
  designed, none is defaulted.
- **Navigation.** Position and tab order, stated explicitly.
- **Components.** What web uses and the intended native equivalent.
- **Proposed string keys.** The names a shared catalog would use, once one
  exists. Nothing reads them today.
- **Permissions.** What is requested and the user-facing reason string.
- **Offline and refresh.** What survives a cold start with no network, and what
  a pull-to-refresh does.
- **Proposed analytics events.** The names an event pipeline would use, once one
  exists. Nothing emits them today.

## Tab order

Fixed across all three platforms. Changing it is a change to this section
first, then three clients in the same task.

1. Chat
2. Spaces
3. Documents
4. Connections
5. Dreams
6. Admin, only when `org_members.role` is `owner` or `admin`

Settings is not a tab. It is reachable from the header on web and from the
profile row on native.

## String catalog

**Not built.** There is no string catalog on web. Until this line changes, the
proposed string keys in every entry below are names for a file nobody has
written.

What web does today is write user-visible copy inline in the component that
shows it. `web/components/dreams/entity-groups.tsx:29` holds "No documents you
can see mention this" as a JSX literal, and that is the pattern everywhere in
`web/components/`.

Two pieces of copy are centralised, both because a switch over a database enum
needed one place to live:

- `describeIngest` in `web/lib/documents/documents.ts:45` returns the five
  ingest status strings a document row shows.
- `KIND_LABELS` in `web/lib/dreams/entities.ts:30` maps the four `entity_kind`
  values to their headings.

The shape the catalog should take when someone builds it: a new `strings` module
under `web/lib/` on web, `Localizable.xcstrings` on iOS, `strings.xml` on
Android. Keys dot-separated and namespaced by screen, as in `chat.empty.title`
and `documents.ingest.timeout`. A key added on any platform is added to all three
in the same commit. Most of the work is moving the inline copy out of
`web/components/`, which is why the module has never appeared on its own.

## Analytics events

**Not built.** No client in this repository emits a product analytics event.
There is no analytics SDK in `web/package.json` and no call site for any of the
event names in the entries below.

What exists is metering, which answers a different question. Model calls are
recorded to `model_calls` and billable quantities to `usage_events`
(`supabase/schemas/70_usage_events.sql`), written by
`web/lib/openai/usage-recorder.ts`. The admin screen reads those tables through
`web/lib/analytics/queries.ts`. None of it records that a person opened a screen
or tapped a citation.

## Entries

### Chat

- **Screen name.** Chat
- **Web route.** `/chat`
- **Deep link.** `magpi://chat`
- **Data contract.** `conversations` filtered to `user_id = auth.uid()`, type
  `Database['public']['Tables']['conversations']['Row']`. History paginates
  through the `infinite-query-hook` block on web; native pages with a cursor on
  `created_at`. Folders come from `conversation_folders`, type
  `Database['public']['Tables']['conversation_folders']['Row']`, ordered by
  `position` then `name`. A conversation's `folder_id` is null when it sits at
  the top level, which is a destination rather than a missing value. Colours are
  the `folder_color` enum and resolve through `lib/chat/folder-colors.ts`, so a
  client stores the name and never a value.
- **Loading.** Three skeleton rows in the history list, composer disabled.
- **Empty.** The primary screen for a new user. Title, one sentence on what
  Digital Brain does, and two actions: upload a document, connect a source. It does
  not apologize for being empty.
- **Error.** The error text from the failed query, plus a retry.
- **Content.** The composer, the space filter, and the conversation list grouped
  into folders. Each folder shows its colour as a dot and its name, then its
  conversations, and unfiled conversations sit above or below the folders as one
  ungrouped list. A folder with no conversations still shows, because somebody
  made it deliberately. Deleting a folder keeps its conversations and moves them
  to the top level.
- **Navigation.** Tab 1. A conversation can be dragged onto a folder to file it,
  or onto the list itself to take it out of one. The menu on each row does the
  same move, because a drag is reachable by mouse and nothing else: on iOS use
  `onDrag`/`dropDestination`, on Android `dragAndDropSource`, and keep the menu.
  The button that makes a folder is anchored below the list rather than at the
  top of it, so it does not scroll away. Root of its own stack.
- **Components.** Web uses `components/chat/*` over the Library
  `realtime-chat-nextjs` block, adapted for assistant turns. iOS is a
  `List` in a `NavigationStack`. Android is a `LazyColumn` in a `Scaffold`.
  A folder row carries a menu matching the conversation menu: rename, which also
  changes the colour, and delete. iOS uses a `Section` per folder with a `Menu`,
  Android a sticky header per folder with a `DropdownMenu`.
- **Proposed string keys.** `chat.empty.title`, `chat.empty.body`, `chat.empty.upload`,
  `chat.empty.connect`, `chat.composer.placeholder`, `chat.filter.allSpaces`,
  `chat.folder.new`, `chat.folder.rename`, `chat.folder.delete`,
  `chat.folder.deleteKeepsChats`, `chat.folder.none`, `chat.folder.move`,
  `chat.folder.nameTaken`.
- **Permissions.** None.
- **Offline and refresh.** Conversation list is cached and readable offline.
  The composer is disabled with an offline notice. Pull-to-refresh refetches
  the list.
- **Proposed analytics events.** `chat_opened`, `conversation_created`,
  `folder_created`, `folder_renamed`, `folder_deleted`, `conversation_moved`.

### Chat conversation

This is the one screen where the native implementation cannot mirror the web
one line for line, so the transport is spelled out.

- **Screen name.** Conversation
- **Web route.** `/chat/[id]`
- **Deep link.** `magpi://chat/{conversationId}`
- **Data contract.** `messages` for the conversation, type
  `Database['public']['Tables']['messages']['Row']`. Citations are chunk ids in
  `messages.citations` and are resolved on read through
  `chunks` under RLS, never stored as text.
- **Transport.** `POST /api/chat`, body `{ conversationId, message }` where the
  message is trimmed and between 1 and 4000 characters. There is no space filter
  in the request: scope comes from `conversations.space_filter` on the row, which
  is why no client lets a reader change scope mid-conversation.

  The response is `200` with `Content-Type: application/x-ndjson; charset=utf-8`,
  `Cache-Control: no-store` and `X-Accel-Buffering: no`. The body is one JSON
  object per line, each terminated by a newline. Five event types, discriminated
  on `type`, defined in `web/lib/chat/protocol.ts`:

  ```
  { "type": "citations", "citations": Citation[] }
  { "type": "delta",     "text": string }
  { "type": "done",      "messageId": uuid }
  { "type": "title",     "title": string }
  { "type": "error",     "message": string }

  Citation = { chunkId, documentId, documentTitle, excerpt, label }
  ```

  Ordering a client may rely on:

  1. `citations` exactly once, always before any answer text. The array may be
     empty, meaning retrieval found nothing and the answer will say so. Sources
     are on screen before the first token.
  2. `delta` zero or more times. Concatenate in arrival order.
  3. `done` exactly once, carrying the stored `messages.id`.
  4. `title` at most once, only for a conversation that had none, always after
     `done`. Naming a conversation never delays an answer.
  5. `error` is terminal and can replace any of the above from that point. What
     was already delivered stays valid and nothing follows it.

  **Two obligations on every client.** Buffer the trailing fragment: an event can
  be split across two network reads, so split on the newline, keep the remainder,
  and prepend it to the next read. And drop a line that does not parse rather
  than treating it as an error, so adding an event type later does not break an
  older build.

  Failures before the stream opens are a JSON body `{ code, message }` with a
  status, never an event: `unauthorized` 401, `invalid_request` 400, `not_found`
  404, `rate_limited` 429 with a `Retry-After` header in seconds, `server_error` 500. A client has exactly two failure shapes to handle: a JSON body with a
  status, or an `error` event inside a 200.

  iOS uses `URLSession.shared.bytes(for:)` and splits on newlines. Android uses
  OkHttp with a `ResponseBody.source()` read loop. Both must keep the persisted
  user message and reload after a mid-stream disconnect, because the question is
  written before the model call and the answer after it completes. A dropped
  connection leaves the question stored and no answer at all, never a partial
  one.

- **Loading.** The user turn appears immediately. The assistant turn shows a
  caret until the first token arrives.
- **Empty.** Not reachable. A conversation always has at least one message.
- **Error.** A failed stream leaves the user message in place and shows a retry
  on the assistant turn. It never leaves a half-written assistant message.
- **Content.** The turn list, inline citation references that open
  `/documents/{id}` anchored at the chunk, and the composer.
- **Navigation.** Pushed from Chat. Back returns to the list.
- **Components.** Web: `components/chat/message-list.tsx`,
  `components/chat/assistant-turn.tsx`. iOS: `ScrollViewReader` over a
  `LazyVStack`. Android: `LazyColumn` with `rememberLazyListState`.
- **Proposed string keys.** `chat.turn.thinking`, `chat.turn.retry`,
  `chat.citation.unavailable`.
- **Permissions.** None.
- **Offline and refresh.** Past turns are cached. Sending requires a network.
- **Proposed analytics events.** `question_asked`, `citation_opened`, `stream_failed`.

### Spaces

- **Screen name.** Spaces
- **Web route.** `/spaces`
- **Deep link.** `magpi://spaces`
- **Data contract.** `spaces` with `space_members(count)` and
  `documents(count)`, type `Database['public']['Tables']['spaces']['Row']`.
  Ordering is personal, then org, then teams alphabetically, from
  `web/lib/spaces/spaces.ts`. Native reimplements the same ordering and has an
  ordered-tab contract test for it.
- **Loading.** Skeleton list of three rows.
- **Empty.** Not normally reachable: the signup trigger creates a personal and
  an org space. If it is, the copy says to sign out and back in.
- **Error.** Query error text plus retry.
- **Content.** The create-team-space form, then the space list.
- **Navigation.** Tab 2.
- **Components.** Web `components/spaces/space-list.tsx`. iOS `List` with
  `Section`. Android `LazyColumn`.
- **Proposed string keys.** `spaces.title`, `spaces.body`, `spaces.create.label`,
  `spaces.kind.personal`, `spaces.kind.team`, `spaces.kind.org`.
- **Permissions.** None.
- **Offline and refresh.** Cached and readable. Creating requires a network.
- **Proposed analytics events.** `space_created`.

### Space detail

- **Screen name.** Space
- **Web route.** `/spaces/[id]`
- **Deep link.** `magpi://spaces/{spaceId}`
- **Data contract.** `spaces` by id, `space_members` for the space, and a head
  count on `documents`. Types
  `Database['public']['Tables']['spaces']['Row']` and
  `Database['public']['Tables']['space_members']['Row']`.
- **Loading.** Header skeleton plus a member list skeleton.
- **Empty.** A team space with one member says so plainly and offers to add
  someone.
- **Error.** A space the caller cannot see returns not found, deliberately.
  "Not found" and "not allowed" are the same answer.
- **Content.** A form for the name and the description, the dreaming switch, and
  the member list. Any member may edit both fields: `spaces_update_member`
  admits a space the caller can see and the column grant stops `org_id` and
  `kind` moving with it. This is where a personal space is renamed too, which
  used to be the one space you could rename and only from Settings.
- **Navigation.** Pushed from Spaces.
- **Components.** Web `components/spaces/dreaming-toggle.tsx` and
  `space-members.tsx`. iOS `Form` with a `Toggle`. Android
  `Column` with a `Switch`.
- **Proposed string keys.** `space.dreaming.title`, `space.dreaming.body`,
  `space.members.count`, `space.personal.note`, `space.org.note`.
- **Permissions.** None.
- **Offline and refresh.** Cached. The dreaming switch is disabled offline.
- **Proposed analytics events.** `dreaming_toggled`.

### Documents

- **Screen name.** Documents
- **Web route.** `/documents`
- **Deep link.** `magpi://documents`
- **Data contract.** `documents` joined to `spaces(name)` and
  `ingest_jobs(status, stage, error)`, type
  `Database['public']['Tables']['documents']['Row']`. Ingest status text comes
  from `describeIngest` in `web/lib/documents/documents.ts` and native
  reimplements the same five cases. `documents.created_by` is the person who
  uploaded it, and is null for a sync or a dream, which no person uploaded.
- **Loading.** Upload panel skeleton plus a list skeleton.
- **Empty.** The other screen most new users see first. It names the two ways
  content arrives: upload a file, or connect a source.
- **Error.** Query error text plus retry.
- **Content.** The space selector and the file picker together, then the list.
  The two are on one screen because choosing the space is the permission
  decision.
- **Navigation.** Tab 3.
- **Components.** Web uses the Library `dropzone-nextjs` block. iOS uses
  `.fileImporter` plus `PHPickerViewController` where images apply. Android
  uses the Storage Access Framework `ACTION_OPEN_DOCUMENT`.
- **Proposed string keys.** `documents.title`, `documents.body`, `documents.empty.title`,
  `documents.empty.body`, `documents.space.label`, `documents.ingest.queued`,
  `documents.ingest.running`, `documents.ingest.failed`,
  `documents.ingest.timeout`.
- **Permissions.** iOS: none for `.fileImporter`. Photo library access, only if
  image upload ships, reason string "Digital Brain needs access to add a photo to your
  knowledge base." Android: none on API 33 and above for SAF.
- **Offline and refresh.** The list is cached. An upload started offline is
  refused with a clear message rather than queued, because the storage upload
  and the job row have to land together.
- **Proposed analytics events.** `document_uploaded`, `ingest_failed`, `ingest_timeout`.

### Document detail

- **Screen name.** Document
- **Web route.** `/documents/[id]`
- **Deep link.** `magpi://documents/{documentId}`, with an optional
  `?chunk={chunkId}` fragment that a citation opens directly.
- **Data contract.** `documents` by id, `chunks` for the document ordered by
  `ordinal`, and the latest `ingest_jobs` row. Types
  `Database['public']['Tables']['documents']['Row']` and
  `Database['public']['Tables']['chunks']['Row']`.
- **Loading.** Header skeleton plus three paragraph skeletons.
- **Empty.** A document whose ingest has not finished shows the stage rather
  than an empty body.
- **Error.** Not found for a document in a space the caller cannot see.
- **Content.** Title, origin, the link to the original, and the chunk text with
  the cited chunk highlighted.
- **Navigation.** Pushed from Documents or from a citation in Chat.
- **Components.** Web is plain prose. iOS `ScrollViewReader` scrolls to the
  cited chunk. Android `LazyColumn` with `scrollToItem`.
- **Proposed string keys.** `document.origin.upload`, `document.origin.sync`,
  `document.origin.dream`, `document.original.open`.
- **Permissions.** None.
- **Offline and refresh.** Chunk text is cached once read.
- **Proposed analytics events.** `document_opened`.

### Connections

- **Screen name.** Connections
- **Web route.** `/connections`
- **Deep link.** `magpi://connections`
- **Data contract.** `providers` for the registry and `connections` for what is
  already linked, types
  `Database['public']['Tables']['providers']['Row']` and
  `Database['public']['Tables']['connections']['Row']`. The page renders from
  the `providers` table, so a new provider is a seed row and never a client
  change on any platform. A connection is one authorized account and does not
  belong to a space. `scope_selection` holds `{kind, available, routes}`, where
  `routes` maps a unit id to a space id, so one account can send one channel to
  Engineering and another to Finance. `kind` is one of channel, folder,
  workspace or repository, and is what the picker names the units by.
- **Loading.** Provider list skeleton.
- **Empty.** No connections yet, with the five wired providers listed and one
  action each: Notion, Linear, Slack, Google Drive and GitHub. The rest of the
  registry renders as coming soon.
- **Error.** A `revoked` or `expired` connection shows `status_detail` and a
  reconnect action. It never shows a spinner that does not resolve.
- **Content.** Provider rows. Under each, one row per connected account showing
  status, the account, the spaces it feeds, last sync, and the reconnect or
  disconnect action. Under that, a collapsed routing list with one destination
  control per unit.
- **Navigation.** Tab 4.
- **Components.** Web `components/connections/*`. `connect-button.tsx` starts
  the OAuth leg and asks for nothing first, because a space is no longer chosen
  before the redirect. `scope-picker.tsx` renders a destination control per unit,
  collapsed by default. iOS `List` with `ASWebAuthenticationSession` for the
  OAuth leg and a `Picker` per unit. Android `LazyColumn` with Chrome Custom Tabs
  and an `ExposedDropdownMenuBox` per unit.
- **Proposed string keys.** `connections.title`, `connections.status.active`,
  `connections.status.syncing`, `connections.status.error`,
  `connections.status.revoked`, `connections.status.expired`,
  `connections.reconnect`, `connections.disconnect`, `connections.resync`,
  `connections.routing.save`, `connections.routing.unrouted`,
  `connections.routing.destinations`.
- **Permissions.** None. The OAuth leg opens a system browser, never an
  embedded webview, because an embedded webview cannot be trusted with a
  provider password.
- **Offline and refresh.** Status is cached. Connecting requires a network.
  Pull-to-refresh refetches status without triggering a sync.
- **Proposed analytics events.** `connection_started`, `connection_claimed`,
  `connection_failed`, `resync_requested`, `unit_routed`, `unit_unrouted`.

### Dreams

- **Screen name.** Dreams
- **Web route.** `/dreams`
- **Deep link.** `magpi://dreams`
- **Data contract.** `dream_runs` for the visible spaces, type
  `Database['public']['Tables']['dream_runs']['Row']`.
- **Loading.** Run list skeleton.
- **Empty.** Defines dreaming in one sentence, then offers to run one now. This
  is the first place many users meet the word, so the definition is required
  copy and not optional.
- **Error.** A `failed` or `timeout` run shows `dream_runs.error` and the stage.
- **Content.** Runs with kind, status, document count, and output.
- **Navigation.** Tab 5.
- **Components.** Web `components/dreams/*`. iOS `List`. Android `LazyColumn`.
- **Proposed string keys.** `dreams.definition`, `dreams.empty.title`,
  `dreams.run.entities`, `dreams.run.digest`, `dreams.run.connections`,
  `dreams.status.timeout`.
- **Permissions.** None.
- **Offline and refresh.** Cached. Triggering a run requires a network.
- **Proposed analytics events.** `dream_triggered`, `dream_opened`.

### Entities

- **Screen name.** Entities
- **Web route.** `/dreams/entities`
- **Deep link.** `magpi://dreams/entities`, with an optional `?space={spaceId}`
  filter that mirrors the web query parameter.
- **Data contract.** `entities` joined to `entity_mentions` and `documents`,
  grouped by `entity_kind`. Types
  `Database['public']['Tables']['entities']['Row']` and
  `Database['public']['Tables']['entity_mentions']['Row']`. Loaded through
  `loadEntities` in `web/lib/dreams/queries.ts`.
- **Loading.** Four group skeletons, one per entity kind, holding their heights
  so the page does not jump when they resolve.
- **Empty.** The common case before the first entities run. It says what an
  entities run does and offers the two ways to get one: trigger it from Runs, or
  wait for tonight.
- **Error.** Query error text plus retry.
- **Content.** People, projects, customers and decisions, each with the
  documents it was mentioned in. Tapping a mention opens the document at the
  cited chunk. `entities.summary` is null for most rows and the row renders
  without it: a sentence is only written once something has been mentioned three
  times, so a name seen once shows its mentions and no description.
- **Navigation.** Subtab under Dreams, second after Runs. Subtabs sit outside
  cards and the strip stays put through every content state.
- **Components.** Web `components/dreams/entity-groups.tsx`. iOS `List` with a
  `Section` per kind. Android `LazyColumn` with sticky headers.
- **Proposed string keys.** `entities.empty.title`, `entities.empty.body`,
  `entities.kind.person`, `entities.kind.project`, `entities.kind.customer`,
  `entities.kind.decision`, `entities.mentions.count`.
- **Permissions.** None.
- **Offline and refresh.** Cached and readable offline. Pull-to-refresh refetches.
- **Proposed analytics events.** `entities_opened`, `entity_mention_opened`.

### Dream log

- **Screen name.** Dream log
- **Web route.** `/dreams/log`
- **Deep link.** `magpi://dreams/log`
- **Data contract.** Nights from `loadDreamsPage`, grouped by date.
- **Loading.** List skeleton.
- **Empty.** Shows "No dreams yet" when there are no nights.
- **Error.** Query error text plus retry.
- **Content.** The dated history of Dream runs.
- **Navigation.** Opened from Dreams.
- **Components.** Web `components/dreams/dream-log.tsx`. Native list.
- **Proposed string keys.** `dreams.log.empty`, `dreams.log.title`.
- **Permissions.** Signed-in organization member.
- **Offline and refresh.** Cached history; refresh requires a network.
- **Proposed analytics events.** `dream_log_opened`.

### Dream run

- **Screen name.** Dream run
- **Web route.** `/dreams/[id]`
- **Deep link.** `magpi://dreams/{runId}`
- **Data contract.** `dream_runs` by id, `dream_links` for the run, and
  `documents` for the output. Types
  `Database['public']['Tables']['dream_runs']['Row']` and
  `Database['public']['Tables']['dream_links']['Row']`.
- **Loading.** Header skeleton plus a candidate list skeleton.
- **Empty.** A run that produced nothing says so, rather than showing an empty
  output document.
- **Error.** The run error and the stage it reached.
- **Content.** What ran, over how many documents, what came out, and for the
  `connections` kind, the candidate document pairs with their rationale, each
  confirmable or dismissable.
- **Navigation.** Pushed from Dreams.
- **Components.** Web composes three, from
  `web/app/(app)/dreams/[id]/page.tsx:5-7`:
  `components/dreams/dream-output.tsx`, `components/dreams/link-candidates.tsx`
  and `components/dreams/run-failure.tsx`. iOS `Form`. Android `Column`.
- **Proposed string keys.** `dream.output.none`, `dream.link.confirm`,
  `dream.link.dismiss`, `dream.delete.warning`.
- **Permissions.** None.
- **Offline and refresh.** Cached. Confirming a link requires a network.
- **Proposed analytics events.** `dream_link_confirmed`, `dream_link_dismissed`,
  `dream_output_deleted`.

### Admin

- **Screen name.** Admin
- **Web route.** `/admin`
- **Deep link.** `magpi://admin`
- **Data contract.** `usage_events`, `model_calls`, `messages`, `connections`,
  `ingest_jobs` and `documents.last_retrieved_at`. Access is
  `org_members.role in ('owner','admin')` and it is enforced in RLS, so a
  non-admin gets zero rows rather than a hidden tab. Native still hides the tab,
  as a courtesy and not as the control.
- **Loading.** Chart skeletons that hold their final height, so the page does
  not jump.
- **Empty.** An organization with no traffic yet says which number will appear
  first.
- **Error.** Query error text plus retry.
- **Content.** Ingest health and dead content.
- **Navigation.** Tab 6, present only for owners and admins. Web shows the admin
  sections in a side nav rather than a tab strip.
- **Components.** Web `components/admin/*` and `components/charts/*` following
  the `dataviz` rules. iOS Swift Charts. Android Vico.
- **Proposed string keys.** `admin.ingest.title`, `admin.latency.title`,
  `admin.questions.title`, `admin.dead.title`, `admin.usage.title`.
- **Permissions.** None.
- **Offline and refresh.** Last fetched values are cached with their timestamp
  shown, so a stale number is never presented as live.
- **Proposed analytics events.** `admin_opened`.

### Admin demo

- **Screen name.** Admin demo
- **Web route.** `/admin/demo`
- **Deep link.** `magpi://admin/demo`
- **Data contract.** Rehearsal mode and the current demo reset state.
- **Loading.** Show controls after admin access and rehearsal mode resolve.
- **Empty.** Reset controls remain available before the first run.
- **Error.** Show reset or rehearsal errors beside the affected control.
- **Content.** Rehearsal mode, full demo reset, and Dream reset controls.
- **Navigation.** Admin side navigation.
- **Components.** Web `components/admin/demo-reset.tsx` and
  `components/admin/rehearsal-mode.tsx`. Native form controls.
- **Proposed string keys.** `admin.demo.title`, `admin.demo.reset`,
  `admin.demo.rehearsal`.
- **Permissions.** Owner or admin.
- **Offline and refresh.** Requires a network; never cache reset actions.
- **Proposed analytics events.** `demo_reset_requested`,
  `rehearsal_mode_changed`.

### Admin searches

- **Screen name.** Searches
- **Web route.** `/admin/searches`
- **Deep link.** `magpi://admin/searches`
- **Data contract.** `messages` and `model_calls`, read through the elevated
  client for the whole organization. Access is
  `org_members.role in ('owner','admin')`, enforced in RLS.
- **Loading.** Chart skeletons that hold their final height, so the page does
  not jump.
- **Empty.** An organization with no questions yet says so in place of the list.
- **Error.** Query error text plus retry.
- **Content.** Search activity, questions per day, answer latency, top
  questions, over a range the reader picks.
- **Navigation.** Under Admin, present only for owners and admins.
- **Components.** Web `components/admin/*` and `components/charts/*` following
  the `dataviz` rules. iOS Swift Charts. Android Vico.
- **Proposed string keys.** `admin.searches.title`, `admin.latency.title`,
  `admin.questions.title`.
- **Permissions.** None.
- **Offline and refresh.** Last fetched values are cached with their timestamp
  shown, so a stale number is never presented as live.
- **Proposed analytics events.** `admin_searches_opened`.

### Admin members

- **Screen name.** Members
- **Web route.** `/admin/members`
- **Deep link.** `magpi://admin/members`
- **Data contract.** `org_members` and `org_invites`, types
  `Database['public']['Tables']['org_members']['Row']` and
  `Database['public']['Tables']['org_invites']['Row']`.
- **Loading.** List skeleton.
- **Empty.** A one-person organization offers to invite someone.
- **Error.** Query error text plus retry.
- **Content.** Members with roles, pending invites, invite and remove.
- **Navigation.** Subtab under Admin. Subtabs sit outside cards.
- **Components.** Web table. iOS `List`. Android `LazyColumn`.
- **Proposed string keys.** `members.invite.label`, `members.role.owner`,
  `members.role.admin`, `members.role.member`, `members.remove.confirm`.
- **Permissions.** None.
- **Offline and refresh.** Cached. Inviting requires a network.
- **Proposed analytics events.** `member_invited`, `member_removed`.

### Admin consumption

- **Screen name.** Consumption
- **Web route.** `/admin/consumption`
- **Deep link.** `magpi://admin/consumption`
- **Data contract.** `usage_events` summed through `org_usage_totals`, plus
  `organizations.plan`, read through the caller's own client rather than the
  elevated one, because a plan meter is the caller's own organization by
  definition.
- **Loading.** Meter skeletons that hold their final height.
- **Empty.** An organization that has used nothing shows zeroes against its
  limits rather than an empty state, because zero of a limit is the answer.
- **Error.** Query error text plus retry.
- **Content.** Documents ingested, questions this month, seats used and storage,
  each against the plan limit, with a link to billing.
- **Navigation.** Under Admin, directly above Billing, present only for owners
  and admins.
- **Components.** Web `components/admin/plan-usage.tsx` and
  `components/charts/meter.tsx`. iOS `Gauge`. Android `LinearProgressIndicator`.
- **Proposed string keys.** `admin.usage.title`, `admin.usage.documents`,
  `admin.usage.queries`, `admin.usage.seats`, `admin.usage.storage`.
- **Permissions.** None.
- **Offline and refresh.** Last fetched values are cached with their timestamp
  shown, so a stale number is never presented as live.
- **Proposed analytics events.** `admin_consumption_opened`.

### Admin billing

- **Screen name.** Billing
- **Web route.** `/admin/billing`
- **Deep link.** `magpi://admin/billing`
- **Data contract.** `organizations.plan`, `stripe_customer_id`,
  `stripe_subscription_id`, `seats`, type
  `Database['public']['Tables']['organizations']['Row']`.
- **Loading.** Plan card skeleton.
- **Empty.** Not reachable. Every organization has a plan.
- **Error.** A Stripe failure shows the message from the checkout session
  creation, not a generic one.
- **Content.** A plan card and a button. Nothing else. Stripe Checkout for
  signup, the Customer Portal for everything after.
- **Navigation.** Subtab under Admin.
- **Components.** Web plan card. iOS and Android open the Checkout or Portal
  URL in a system browser. **Neither native client implements in-app purchase.**
  The Team plan is a business-to-business subscription sold on the web.
- **Proposed string keys.** `billing.plan.free`, `billing.plan.team`,
  `billing.plan.enterprise`, `billing.portal.open`, `billing.upgrade`.
- **Permissions.** None.
- **Offline and refresh.** The plan is cached. Both buttons need a network.
- **Proposed analytics events.** `checkout_started`, `portal_opened`.

### Settings

- **Screen name.** Settings
- **Web route.** `/settings`
- **Deep link.** `magpi://settings`
- **Data contract.** `auth.users` through `supabase.auth.getUser()`, plus the
  personal space from `spaces` where `kind = 'personal'`.
- **Loading.** Form skeleton.
- **Empty.** Not reachable.
- **Error.** The auth error text.
- **Content.** Profile: the display name, the address signed in with, and sign
  out everywhere. Renaming a space left this screen; every space is edited on
  its own detail screen now, including the personal one.
- **Navigation.** Not a tab. Header on web, profile row on native. A side nav
  lists the sections, the same shape as Admin: Profile, Embeddings, MCP and API.
  On native it is a grouped list that pushes, not a rail.
- **Components.** Web form. iOS `Form`. Android `PreferenceScreen`.
- **Proposed string keys.** `settings.theme.system`, `settings.theme.light`,
  `settings.theme.dark`, `settings.signOut`, `settings.signOutAll`.
- **Permissions.** None.
- **Offline and refresh.** Readable offline. Changes need a network.
- **Proposed analytics events.** `theme_changed`, `signed_out`.

### Settings, embeddings

- **Screen name.** Embeddings
- **Web route.** `/settings/embeddings`
- **Deep link.** `magpi://settings/embeddings`
- **Data contract.** None yet. The model id is a constant in `web/lib/models.ts`,
  not a row, because nothing about it is per account.
- **Loading.** None. Nothing is fetched.
- **Empty.** The whole screen is the empty state until bringing your own key
  exists.
- **Error.** None reachable.
- **Content.** Which model reads your documents, and whose account pays for it.
  A sentence saying a key of your own is not built yet, and that the model a
  document was read with will be recorded against it when it is, because
  changing the model means reading everything again.
- **Navigation.** Second in the Settings nav.
- **Components.** Web `components/admin/panel.tsx`. iOS `Form`. Android
  `PreferenceScreen`.
- **Proposed string keys.** `embeddings.model.title`, `embeddings.byok.pending`.
- **Permissions.** None.
- **Offline and refresh.** Static, so it reads offline.
- **Proposed analytics events.** None.

### Settings, MCP and API

- **Screen name.** MCP and API
- **Web route.** `/settings/mcp`
- **Deep link.** `magpi://settings/mcp`
- **Data contract.** The server address is built from
  `NEXT_PUBLIC_SUPABASE_URL`, so it is configuration rather than a query.
- **Loading.** None for the address.
- **Empty.** Not reachable: the address always exists.
- **Error.** None for the address.
- **Content.** The MCP server address with a copy button, what happens the first
  time an agent connects, and the five tools it exposes with one line each.
- **Navigation.** Third in the Settings nav.
- **Components.** Web `components/app/copy-button.tsx` and
  `components/admin/panel.tsx`. iOS `Form` with a copy row. Android
  `PreferenceScreen` with a copy affordance.
- **Proposed string keys.** `mcp.connect.title`, `mcp.connect.body`,
  `mcp.tools.title`, `mcp.copy`, `mcp.copied`.
- **Permissions.** Clipboard write on native.
- **Offline and refresh.** The address reads offline.
- **Proposed analytics events.** `mcp_address_copied`.

## Parity rules

Three rules, taken from mistakes that have already cost time.

**Functional parity does not prove visual parity.** Before shipping a native
surface, compare it with two adjacent screens in the simulator. A screen that
passes its own test and looks nothing like the one before it is still wrong.

**When web adds or reorders a subtab, audit iOS and Android in the same task.**
Keep an ordered-tab contract test per platform, asserting the order in the
"Tab order" section above.

**A web bug is a cross-platform defect class.** Map the root cause, the date and
timezone semantics, and the validation boundary onto both native clients before
closing it.

## Native builds stay out of hosted triggers

macOS runners, emulators and release packaging go behind `workflow_dispatch`
only. `.github/workflows/native.yml` is dispatch-only and
`scripts/workflow-contract-check.mjs` fails the gate if that changes.
