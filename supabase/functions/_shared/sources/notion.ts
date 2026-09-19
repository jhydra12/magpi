// Notion, read through search for what changed and block children for the text.

import type {
  ChangePage,
  FetchedDocument,
  RefreshOutcome,
  ScopeOption,
  SourceCredentials,
  SourceDeps,
  SourceDocumentRef,
  SourceDriver,
} from './contract.ts';
import { SourceError } from './contract.ts';
import { asArray, asRecord, asString, isoStamp, parseInstant, requestJson } from './common.ts';
import { encodeBacklog, newestStamp, parseCursor } from './cursor.ts';

const PROVIDER = 'notion';
const DISPLAY_NAME = 'Notion';
const API = 'https://api.notion.com/v1';
const MIME = 'text/markdown';
const PAGE_SIZE = 100;

// Pinned, because Notion serves a different response shape per version.
const NOTION_VERSION = '2022-06-28';

// A pass reads at most this many requests of PAGE_SIZE.
const MAX_REQUESTS = 5;

const RECONNECT_MESSAGE = `${DISPLAY_NAME} refused this connection, reconnect it.`;
const FAILURE_MESSAGE = `${DISPLAY_NAME} could not be read, the next sync will try again.`;

/** Notion error codes that mean the credential, not the moment, is the problem. */
const RECONNECT_CODES = /unauthorized|restricted|invalid_token/;

function headers(creds: SourceCredentials, extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${creds.accessToken}`,
    'notion-version': NOTION_VERSION,
    ...extra,
  };
}

/** Notion answers some refusals with HTTP 200 and an error object. */
function readBody(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  if (asString(record.object) !== 'error') return record;

  // The provider's wording never reaches the message, since an error body can quote the token.
  const needsReconnect = RECONNECT_CODES.test(asString(record.code));
  throw new SourceError(
    PROVIDER,
    needsReconnect ? RECONNECT_MESSAGE : FAILURE_MESSAGE,
    needsReconnect,
  );
}

async function getJson(
  creds: SourceCredentials,
  deps: SourceDeps,
  url: string,
): Promise<Record<string, unknown>> {
  return readBody(
    await requestJson(PROVIDER, deps, url, {
      headers: headers(creds),
      reconnectMessage: RECONNECT_MESSAGE,
      failureMessage: FAILURE_MESSAGE,
    }),
  );
}

async function postJson(
  creds: SourceCredentials,
  deps: SourceDeps,
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return readBody(
    await requestJson(PROVIDER, deps, url, {
      method: 'POST',
      headers: headers(creds, { 'content-type': 'application/json' }),
      body: JSON.stringify(body),
      reconnectMessage: RECONNECT_MESSAGE,
      failureMessage: FAILURE_MESSAGE,
    }),
  );
}

function searchBody(startCursor: string | null): Record<string, unknown> {
  const body: Record<string, unknown> = {
    page_size: PAGE_SIZE,
    filter: { value: 'page', property: 'object' },
    sort: { timestamp: 'last_edited_time', direction: 'descending' },
  };
  // Notion validates start_cursor when present, so a first pass omits it.
  if (startCursor !== null) body.start_cursor = startCursor;
  return body;
}

function plainText(value: unknown): string {
  return asArray(value)
    .map((span) => asString(asRecord(span).plain_text))
    .join('')
    .trim();
}

/** A title property can be named anything, so its type is what identifies it. */
function pageTitle(page: Record<string, unknown>): string {
  for (const value of Object.values(asRecord(page.properties))) {
    const property = asRecord(value);
    if (asString(property.type) !== 'title') continue;
    const text = plainText(property.title);
    if (text.length > 0) return text;
  }
  return 'Untitled';
}

/** The workspace this connection reads. A token reaches one, so the selection names it. */
function pickedWorkspace(creds: SourceCredentials): string | null {
  return creds.scopeSelection.ids[0] ?? null;
}

function toRef(
  page: Record<string, unknown>,
  unitId: string,
  deps: SourceDeps,
): SourceDocumentRef {
  return {
    externalId: asString(page.id),
    title: pageTitle(page),
    url: asString(page.url) || null,
    mimeType: MIME,
    updatedAt: isoStamp(page.last_edited_time, deps),
    unitId,
  };
}

interface Walked {
  pages: Record<string, unknown>[];
  reachedCursor: boolean;
}

/** Pages newer than the cursor, and whether the walk met one that is not. */
function takeNewerThan(results: unknown[], since: number | null): Walked {
  const pages: Record<string, unknown>[] = [];
  for (const raw of results) {
    const page = asRecord(raw);
    const edited = parseInstant(page.last_edited_time);
    // Results arrive newest first, so the first page at or below the cursor ends the pass.
    if (since !== null && edited !== null && edited <= since) {
      return { pages, reachedCursor: true };
    }
    pages.push(page);
  }
  return { pages, reachedCursor: false };
}

async function listChanges(
  creds: SourceCredentials,
  deps: SourceDeps,
  input: { cursor: string | null },
): Promise<ChangePage> {
  const unitId = pickedWorkspace(creds);
  // A connection with no workspace picked has nowhere to put a page.
  if (unitId === null) return { documents: [], cursor: input.cursor, hasMore: false };

  const position = parseCursor(input.cursor);
  const since = parseInstant(position.since);
  const documents: SourceDocumentRef[] = [];

  let startCursor = position.kind === 'backlog' ? position.page : null;
  let nextPage: string | null = null;

  for (let request = 0; request < MAX_REQUESTS; request++) {
    const body = await postJson(creds, deps, `${API}/search`, searchBody(startCursor));
    const walked = takeNewerThan(asArray(body.results), since);
    for (const page of walked.pages) documents.push(toRef(page, unitId, deps));

    const next = asString(body.next_cursor);
    nextPage = !walked.reachedCursor && body.has_more === true && next.length > 0 ? next : null;
    if (nextPage === null) break;
    startCursor = nextPage;
  }

  const watermark = newestStamp(
    documents,
    position.kind === 'backlog' ? position.watermark : position.since,
  );

  // A pass that ran out of requests hands the page token to the next one, not the stamp.
  if (nextPage !== null) {
    return {
      documents,
      cursor: encodeBacklog({ page: nextPage, watermark, since: position.since }),
      hasMore: true,
    };
  }

  return { documents, cursor: watermark, hasMore: false };
}

const BLOCK_PREFIXES = new Map<string, string>([
  ['paragraph', ''],
  ['heading_1', '# '],
  ['heading_2', '## '],
  ['heading_3', '### '],
  ['bulleted_list_item', '- '],
  ['numbered_list_item', '- '],
  ['to_do', '- '],
  ['quote', ''],
  ['callout', ''],
  ['code', ''],
]);

function blockLine(block: Record<string, unknown>): string | null {
  const type = asString(block.type);
  const prefix = BLOCK_PREFIXES.get(type);
  // An unrecognised block type is skipped rather than treated as a fault.
  if (prefix === undefined) return null;

  const text = plainText(asRecord(block[type]).rich_text);
  return text.length > 0 ? `${prefix}${text}` : null;
}

function blocksUrl(externalId: string, startCursor: string | null): string {
  const url = new URL(`${API}/blocks/${encodeURIComponent(externalId)}/children`);
  url.searchParams.set('page_size', String(PAGE_SIZE));
  if (startCursor !== null) url.searchParams.set('start_cursor', startCursor);
  return url.toString();
}

async function readBlockText(
  creds: SourceCredentials,
  deps: SourceDeps,
  externalId: string,
): Promise<string> {
  const lines: string[] = [];
  let startCursor: string | null = null;

  for (let request = 0; request < MAX_REQUESTS; request++) {
    const body = await getJson(creds, deps, blocksUrl(externalId, startCursor));
    if (!Array.isArray(body.results)) throw new SourceError(PROVIDER, FAILURE_MESSAGE);
    for (const raw of asArray(body.results)) {
      const line = blockLine(asRecord(raw));
      if (line !== null) lines.push(line);
    }

    const next = asString(body.next_cursor);
    if (body.has_more !== true || next.length === 0) break;
    startCursor = next;
  }

  return lines.join('\n');
}

async function fetchDocument(
  creds: SourceCredentials,
  deps: SourceDeps,
  externalId: string,
): Promise<FetchedDocument> {
  const unitId = pickedWorkspace(creds);
  if (unitId === null) {
    throw new SourceError(PROVIDER, 'No Notion workspace is picked for this connection.');
  }

  const page = await getJson(creds, deps, `${API}/pages/${encodeURIComponent(externalId)}`);
  if (typeof page.id !== 'string' || page.id.length === 0) {
    throw new SourceError(PROVIDER, FAILURE_MESSAGE);
  }
  const ref = toRef(page, unitId, deps);

  return {
    ...ref,
    externalId: ref.externalId || externalId,
    mimeType: MIME,
    text: await readBlockText(creds, deps, externalId),
  };
}

async function listScopeOptions(
  creds: SourceCredentials,
  deps: SourceDeps,
): Promise<ScopeOption[]> {
  const me = await getJson(creds, deps, `${API}/users/me`);
  const bot = asRecord(me.bot);

  // A token reaches one workspace, and older responses name it by bot id instead.
  const botId = asString(me.id);
  const id = asString(bot.workspace_id) || botId;
  const name = asString(bot.workspace_name) || botId;
  if (id.length === 0 || name.length === 0) return [];

  return [{ id, name }];
}

export const notionDriver: SourceDriver = {
  provider: PROVIDER,
  displayName: DISPLAY_NAME,
  scopeSelectionKind: 'workspace',
  listChanges,
  fetchDocument,
  listScopeOptions,
  refresh(): Promise<RefreshOutcome> {
    // Notion access tokens do not expire, so there is no grant to make.
    return Promise.resolve({ kind: 'not_supported' });
  },
};
