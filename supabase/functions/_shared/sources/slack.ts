// The Slack driver: a connection reads a set of channels, one message at a time.

import {
  type ChangePage,
  type FetchedDocument,
  type RefreshOutcome,
  type ScopeOption,
  type SourceCredentials,
  type SourceDeps,
  type SourceDocumentRef,
  type SourceDriver,
  SourceError,
} from './contract.ts';
import { asArray, asRecord, asString, firstLine, requestJson } from './common.ts';

const PROVIDER = 'slack';
const DISPLAY_NAME = 'Slack';
const API_BASE = 'https://slack.com/api';
const HISTORY_LIMIT = 200;
const SCOPE_PAGE_LIMIT = 200;
const TITLE_LIMIT = 120;

/** Pages of `conversations.list` one scope listing will walk before it stops. */
const MAX_SCOPE_PAGES = 5;

/** Channels one pass reads, so a large selection catches up over several passes. */
const MAX_CHANNELS_PER_PASS = 20;

const RECONNECT_MESSAGE = `${DISPLAY_NAME} refused this connection, reconnect it.`;
const FAILURE_MESSAGE = `${DISPLAY_NAME} could not be read, the next sync will try again.`;

/** Slack error codes where reconnecting is the only fix the user has. */
const RECONNECT_ERRORS = new Set([
  'invalid_auth',
  'not_authed',
  'token_revoked',
  'token_expired',
  'account_inactive',
  'missing_scope',
  'no_permission',
  'not_allowed_token_type',
]);

/** Subtypes that record something happening to the channel rather than something somebody said. */
const SYSTEM_SUBTYPES = new Set([
  'channel_join',
  'channel_leave',
  'channel_topic',
  'channel_purpose',
  'channel_name',
  'channel_archive',
  'pinned_item',
  'message_deleted',
]);

/** Newest message ts read in each channel, keyed by channel id. */
type ChannelMarks = Record<string, string>;

/** Slack's cursor is per channel, encoded as JSON of channel id to ts, private to this driver. */
function parseCursor(cursor: string | null): ChannelMarks {
  if (cursor === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(cursor);
  } catch {
    return {};
  }
  const marks: ChannelMarks = {};
  for (const [channel, ts] of Object.entries(asRecord(parsed))) {
    const stamp = asString(ts);
    if (stamp.length > 0) marks[channel] = stamp;
  }
  return marks;
}

/** Numeric order, because a ts is an epoch string and '9.0' sorts above '10.0'. */
function tsOrder(ts: string | undefined): number {
  const seconds = Number.parseFloat(ts ?? '');
  return Number.isFinite(seconds) ? seconds : 0;
}

/** A Slack ts is epoch seconds plus a uniqueness counter. Only the seconds reach the stamp. */
function instantFromTs(ts: string, deps: SourceDeps): string {
  const seconds = Number.parseInt(ts.split('.', 1)[0], 10);
  if (!Number.isFinite(seconds)) return deps.now().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function titleFor(text: unknown, channel: string): string {
  const line = firstLine(text);
  if (line === null) return `Message in ${channel}`;
  if (line.length <= TITLE_LIMIT) return line;
  return `${line.slice(0, TITLE_LIMIT).trimEnd()}...`;
}

/** The body of an answered call, or the reason the user cannot have one. */
function slackBody(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  if (record.ok === true) return record;
  if (RECONNECT_ERRORS.has(asString(record.error))) {
    throw new SourceError(PROVIDER, RECONNECT_MESSAGE, true);
  }
  throw new SourceError(PROVIDER, FAILURE_MESSAGE);
}

async function getSlack(
  creds: SourceCredentials,
  deps: SourceDeps,
  method: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE}/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const payload = await requestJson(PROVIDER, deps, url.toString(), {
    headers: { authorization: `Bearer ${creds.accessToken}`, accept: 'application/json' },
    reconnectMessage: RECONNECT_MESSAGE,
    failureMessage: FAILURE_MESSAGE,
  });
  return slackBody(payload);
}

async function readChannel(
  creds: SourceCredentials,
  deps: SourceDeps,
  channel: string,
  since: string | undefined,
): Promise<{ documents: SourceDocumentRef[]; newest: string | undefined }> {
  const params: Record<string, string> = {
    channel,
    limit: String(HISTORY_LIMIT),
    inclusive: 'false',
  };
  if (since !== undefined) params.oldest = since;

  const body = await getSlack(creds, deps, 'conversations.history', params);
  const documents: SourceDocumentRef[] = [];
  let newest = since;

  for (const raw of asArray(body.messages)) {
    const message = asRecord(raw);
    const ts = asString(message.ts);
    if (ts.length === 0) continue;
    // The mark advances past a join event too, so a quiet channel is not re-read every pass.
    if (tsOrder(ts) > tsOrder(newest)) newest = ts;
    if (SYSTEM_SUBTYPES.has(asString(message.subtype))) continue;
    documents.push({
      externalId: `${channel}:${ts}`,
      title: titleFor(message.text, channel),
      url: null,
      mimeType: 'text/plain',
      updatedAt: instantFromTs(ts, deps),
      unitId: channel,
    });
  }

  return { documents, newest };
}

function splitExternalId(externalId: string): { channel: string; ts: string } {
  const divider = externalId.indexOf(':');
  if (divider <= 0 || divider === externalId.length - 1) {
    throw new SourceError(PROVIDER, 'That Slack message reference is not one this driver wrote.');
  }
  return { channel: externalId.slice(0, divider), ts: externalId.slice(divider + 1) };
}

export const slackDriver: SourceDriver = {
  provider: PROVIDER,
  displayName: DISPLAY_NAME,
  scopeSelectionKind: 'channel',

  async listChanges(
    creds: SourceCredentials,
    deps: SourceDeps,
    input: { cursor: string | null },
  ): Promise<ChangePage> {
    const marks = parseCursor(input.cursor);
    const selected = creds.scopeSelection.ids;
    // A connection with no channels picked has nothing to read.
    if (selected.length === 0) return { documents: [], cursor: input.cursor, hasMore: false };

    // Stalest first, so a selection longer than the cap catches up over successive passes.
    const ordered = [...selected].sort((a, b) => tsOrder(marks[a]) - tsOrder(marks[b]));
    const pass = ordered.slice(0, MAX_CHANNELS_PER_PASS);

    // Only selected channels carry forward, so unpicking a channel drops its mark.
    const next: ChannelMarks = {};
    for (const channel of selected) {
      const mark = marks[channel];
      if (mark !== undefined) next[channel] = mark;
    }

    const documents: SourceDocumentRef[] = [];
    for (const channel of pass) {
      const read = await readChannel(creds, deps, channel, marks[channel]);
      documents.push(...read.documents);
      if (read.newest !== undefined) next[channel] = read.newest;
    }

    return {
      documents,
      cursor: JSON.stringify(next),
      hasMore: ordered.length > pass.length,
    };
  },

  async fetchDocument(
    creds: SourceCredentials,
    deps: SourceDeps,
    externalId: string,
  ): Promise<FetchedDocument> {
    const { channel, ts } = splitExternalId(externalId);
    const body = await getSlack(creds, deps, 'conversations.replies', {
      channel,
      ts,
      limit: String(HISTORY_LIMIT),
    });

    const messages = asArray(body.messages);
    const blocks: string[] = [];
    for (const raw of messages) {
      const text = asString(asRecord(raw).text).trim();
      if (text.length > 0) blocks.push(text);
    }

    const parent = asRecord(messages[0]);
    return {
      externalId,
      title: titleFor(parent.text, channel),
      url: null,
      mimeType: 'text/plain',
      updatedAt: instantFromTs(asString(parent.ts, ts), deps),
      unitId: channel,
      text: blocks.join('\n\n'),
    };
  },

  async listScopeOptions(creds: SourceCredentials, deps: SourceDeps): Promise<ScopeOption[]> {
    const options: ScopeOption[] = [];
    let pageCursor = '';

    for (let page = 0; page < MAX_SCOPE_PAGES; page += 1) {
      const params: Record<string, string> = {
        types: 'public_channel,private_channel',
        exclude_archived: 'true',
        limit: String(SCOPE_PAGE_LIMIT),
      };
      if (pageCursor.length > 0) params.cursor = pageCursor;

      const body = await getSlack(creds, deps, 'conversations.list', params);
      for (const raw of asArray(body.channels)) {
        const channel = asRecord(raw);
        const id = asString(channel.id);
        if (id.length === 0) continue;
        options.push({ id, name: `#${asString(channel.name, id)}` });
      }

      pageCursor = asString(asRecord(body.response_metadata).next_cursor);
      if (pageCursor.length === 0) break;
    }

    return options;
  },

  // Slack user tokens do not expire unless token rotation is on, and Digital Brain's app does not use it.
  refresh(_deps: SourceDeps): Promise<RefreshOutcome> {
    return Promise.resolve({ kind: 'not_supported' });
  },
};
