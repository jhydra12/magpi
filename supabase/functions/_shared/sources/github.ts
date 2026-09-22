// GitHub, read as prose: the markdown and text files in the repositories you route.

import {
  type ChangePage,
  type FetchedDocument,
  type RefreshInput,
  type RefreshOutcome,
  type ScopeOption,
  type SourceCredentials,
  type SourceDeps,
  type SourceDocumentRef,
  type SourceDriver,
  SourceError,
} from './contract.ts';
import { asArray, asNumber, asRecord, asString, isoStamp, requestJson } from './common.ts';
import { encodePosition, parsePosition, type Position, type Walk } from './github_cursor.ts';

const PROVIDER = 'github';
const DISPLAY_NAME = 'GitHub';
const API = 'https://api.github.com';

const REPO_PAGE_SIZE = 100;
const MAX_REPO_PAGES = 3;

/** Files filed in one pass. Each one becomes an ingest job, so a big repository is spread out. */
const MAX_FILES_PER_PASS = 300;

/** Repositories whose head is checked in one pass, so a long list cannot run past the budget. */
const MAX_REPOS_PER_PASS = 20;

/** What one compare answers with. A change larger than this is read as a fresh walk instead. */
const MAX_COMPARED_FILES = 300;

/** The contents endpoint refuses anything larger, and prose is nowhere near it. */
const MAX_FILE_BYTES = 1_000_000;

/** The extensions worth reading, and what each one is once it is read. */
const READABLE: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  mdx: 'text/markdown',
  txt: 'text/plain',
  text: 'text/plain',
  rst: 'text/plain',
};

/** Vendored trees and dot directories are somebody else's prose, or nobody's. */
const IGNORED = /(^|\/)(node_modules|vendor|dist|build|\.[^/]+)\//;

const RECONNECT_MESSAGE = `${DISPLAY_NAME} refused this connection, reconnect it.`;
const FAILURE_MESSAGE = `${DISPLAY_NAME} could not be read, the next sync will try again.`;

/** Every request carries these. GitHub refuses one with no user agent at all. */
function headersFor(accessToken: string): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${accessToken}`,
    'user-agent': 'magpi',
    'x-github-api-version': '2022-11-28',
  };
}

function get(creds: SourceCredentials, deps: SourceDeps, path: string): Promise<unknown> {
  return requestJson(PROVIDER, deps, `${API}${path}`, {
    headers: headersFor(creds.accessToken),
    reconnectMessage: RECONNECT_MESSAGE,
    failureMessage: FAILURE_MESSAGE,
  });
}

/** The mime type for a path, or null when nothing downstream could read it. */
function mimeFor(path: string): string | null {
  if (IGNORED.test(path)) return null;
  const dot = path.lastIndexOf('.');
  if (dot < 0) return null;
  return READABLE[path.slice(dot + 1).toLowerCase()] ?? null;
}

/** `owner/repo:path`. The repository holds no colon, so the first one splits it. */
function externalIdFor(repo: string, path: string): string {
  return `${repo}:${path}`;
}

function splitExternalId(externalId: string): { repo: string; path: string } {
  const colon = externalId.indexOf(':');
  if (colon < 1 || colon === externalId.length - 1) {
    throw new SourceError(PROVIDER, 'That GitHub path is not one Digital Brain filed.', false);
  }
  return { repo: externalId.slice(0, colon), path: externalId.slice(colon + 1) };
}

/** A path in a URL, with the separators left alone. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function refFor(repo: string, path: string, stamp: string): SourceDocumentRef {
  return {
    externalId: externalIdFor(repo, path),
    // The path, because a repository holds a dozen files called README.
    title: path,
    // HEAD rather than the commit, so the link stays right after the next push.
    url: `https://github.com/${repo}/blob/HEAD/${encodePath(path)}`,
    mimeType: mimeFor(path),
    updatedAt: stamp,
    unitId: repo,
  };
}

/** The newest commit on the default branch, or null for a repository with no commits. */
async function headOf(
  creds: SourceCredentials,
  deps: SourceDeps,
  repo: string,
): Promise<{ sha: string; stamp: string } | null> {
  const commits = asArray(await get(creds, deps, `/repos/${repo}/commits?per_page=1`));
  const newest = asRecord(commits[0]);
  const sha = asString(newest.sha);
  if (sha.length === 0) return null;

  const committer = asRecord(asRecord(newest.commit).committer);
  return { sha, stamp: isoStamp(committer.date, deps) };
}

/** Every readable file in the tree at one commit, in path order so a walk can resume. */
async function treeFiles(
  creds: SourceCredentials,
  deps: SourceDeps,
  repo: string,
  sha: string,
): Promise<string[]> {
  const tree = asRecord(await get(creds, deps, `/repos/${repo}/git/trees/${sha}?recursive=1`));
  // A tree past a hundred thousand entries comes back truncated. What arrived is still read.
  return asArray(tree.tree)
    .map((entry) => asRecord(entry))
    .filter((entry) =>
      asString(entry.type) === 'blob' &&
      asNumber(entry.size) <= MAX_FILE_BYTES &&
      mimeFor(asString(entry.path)) !== null
    )
    .map((entry) => asString(entry.path))
    .sort();
}

/**
 * The paths one commit range touched, or null when the range is larger than a compare reports.
 * A deleted file is left out: nothing in the contract removes a document that has been filed.
 */
async function comparedFiles(
  creds: SourceCredentials,
  deps: SourceDeps,
  repo: string,
  base: string,
  head: string,
): Promise<string[] | null> {
  const body = asRecord(await get(creds, deps, `/repos/${repo}/compare/${base}...${head}`));
  const files = asArray(body.files).map((entry) => asRecord(entry));
  if (files.length >= MAX_COMPARED_FILES) return null;

  return files
    .filter((file) => asString(file.status) !== 'removed')
    .map((file) => asString(file.filename))
    .filter((path) => mimeFor(path) !== null);
}

/** One page of a first read of one repository, which is the whole tree a few hundred at a time. */
async function walkTree(
  creds: SourceCredentials,
  deps: SourceDeps,
  walk: Walk,
  heads: Record<string, string>,
  repos: string[],
): Promise<ChangePage> {
  const paths = await treeFiles(creds, deps, walk.repo, walk.head);
  const rest = walk.after.length > 0 ? paths.filter((path) => path > walk.after) : paths;
  const page = rest.slice(0, MAX_FILES_PER_PASS);
  const unread = rest.length > page.length;

  const next: Position = unread
    ? { heads, walk: { ...walk, after: page[page.length - 1] }, resume: '' }
    : { heads: { ...heads, [walk.repo]: walk.head }, walk: null, resume: '' };

  return {
    documents: page.map((path) => refFor(walk.repo, path, walk.stamp)),
    cursor: encodePosition(next),
    hasMore: unread || repos.some((repo) => next.heads[repo] === undefined),
  };
}

/** Opens a first read of a repository, recording an empty one so it is not asked for again. */
async function beginWalk(
  creds: SourceCredentials,
  deps: SourceDeps,
  repo: string,
  heads: Record<string, string>,
  repos: string[],
): Promise<ChangePage> {
  const head = await headOf(creds, deps, repo);
  if (!head) {
    // A repository with no commits. The empty head marks it read, and a first push begins a walk.
    const next: Position = { heads: { ...heads, [repo]: '' }, walk: null, resume: '' };
    return {
      documents: [],
      cursor: encodePosition(next),
      hasMore: repos.some((other) => next.heads[other] === undefined),
    };
  }

  return await walkTree(
    creds,
    deps,
    { repo, head: head.sha, stamp: head.stamp, after: '' },
    heads,
    repos,
  );
}

/** The repositories to check this pass, starting where the last one stopped. */
function round(repos: string[], resume: string): string[] {
  const start = repos.indexOf(resume);
  const ordered = start > 0 ? [...repos.slice(start), ...repos.slice(0, start)] : repos;
  return ordered.slice(0, MAX_REPOS_PER_PASS);
}

/** What changed in each routed repository since the commit this connection last read. */
async function readChanges(
  creds: SourceCredentials,
  deps: SourceDeps,
  repos: string[],
  heads: Record<string, string>,
  resume: string,
): Promise<ChangePage> {
  const documents: SourceDocumentRef[] = [];
  const next = { ...heads };
  const checked = round(repos, resume);
  let walk: Walk | null = null;

  for (const repo of checked) {
    const head = await headOf(creds, deps, repo);
    // An empty repository, or one nothing has been pushed to since the last pass.
    if (!head || head.sha === heads[repo]) continue;

    const changed = await comparedFiles(creds, deps, repo, heads[repo], head.sha);
    if (changed === null) {
      // More changed than one compare reports, so this repository is read from the tree again.
      walk = { repo, head: head.sha, stamp: head.stamp, after: '' };
      break;
    }
    for (const path of changed) documents.push(refFor(repo, path, head.stamp));
    next[repo] = head.sha;
  }

  const done = checked[checked.length - 1];
  const after = repos[(repos.indexOf(done) + 1) % repos.length] ?? '';
  const roundIsOver = checked.length === repos.length;

  return {
    documents,
    cursor: encodePosition({ heads: next, walk, resume: roundIsOver ? '' : after }),
    hasMore: walk !== null || !roundIsOver,
  };
}

export const githubDriver: SourceDriver = {
  provider: PROVIDER,
  displayName: DISPLAY_NAME,
  scopeSelectionKind: 'repository',

  async listChanges(
    creds: SourceCredentials,
    deps: SourceDeps,
    input: { cursor: string | null },
  ): Promise<ChangePage> {
    // No repository routed means nothing has anywhere to land, and reading anyway would drop
    // every file and advance the cursor past it. The cursor comes back untouched.
    const repos = creds.scopeSelection.ids;
    if (repos.length === 0) return { documents: [], cursor: input.cursor, hasMore: false };

    const position = parsePosition(input.cursor);
    const routed = new Set(repos);

    // A head for a repository nobody routes any more would grow the cursor without end.
    const heads: Record<string, string> = {};
    for (const [repo, sha] of Object.entries(position.heads)) {
      if (routed.has(repo)) heads[repo] = sha;
    }

    if (position.walk && routed.has(position.walk.repo)) {
      return await walkTree(creds, deps, position.walk, heads, repos);
    }

    const unread = repos.find((repo) => heads[repo] === undefined);
    if (unread !== undefined) return await beginWalk(creds, deps, unread, heads, repos);

    return await readChanges(creds, deps, repos, heads, position.resume);
  },

  async fetchDocument(
    creds: SourceCredentials,
    deps: SourceDeps,
    externalId: string,
  ): Promise<FetchedDocument> {
    const { repo, path } = splitExternalId(externalId);
    const mimeType = mimeFor(path);
    if (mimeType === null) {
      throw new SourceError(PROVIDER, 'That GitHub file is not one Digital Brain can read.', false);
    }

    const body = asRecord(
      await get(creds, deps, `/repos/${repo}/contents/${encodePath(path)}`),
    );
    if (asString(body.type) !== 'file' || asString(body.encoding) !== 'base64') {
      // A directory, a submodule, or a file too large for the contents endpoint to inline.
      throw new SourceError(PROVIDER, 'That GitHub path no longer holds a readable file.', false);
    }

    return {
      ...refFor(repo, path, isoStamp(null, deps)),
      mimeType,
      text: decodeBase64(asString(body.content)),
    };
  },

  async listScopeOptions(creds: SourceCredentials, deps: SourceDeps): Promise<ScopeOption[]> {
    const options: ScopeOption[] = [];

    for (let page = 1; page <= MAX_REPO_PAGES; page++) {
      const body = asArray(
        await get(
          creds,
          deps,
          `/user/repos?per_page=${REPO_PAGE_SIZE}&page=${page}&sort=full_name&affiliation=owner,collaborator,organization_member`,
        ),
      );

      for (const entry of body) {
        const name = asString(asRecord(entry).full_name);
        if (name.length > 0) options.push({ id: name, name });
      }
      if (body.length < REPO_PAGE_SIZE) break;
    }
    return options;
  },

  refresh(_deps: SourceDeps, _input: RefreshInput): Promise<RefreshOutcome> {
    // An OAuth app token does not expire and comes with nothing to exchange for a new one.
    return Promise.resolve({ kind: 'not_supported' });
  },
};

/** Base64 as GitHub sends it, wrapped at 60 characters, decoded as the UTF-8 it holds. */
function decodeBase64(content: string): string {
  const packed = content.replace(/\s+/g, '');
  if (packed.length === 0) return '';

  try {
    const binary = atob(packed);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new SourceError(PROVIDER, 'That GitHub file could not be decoded.', false);
  }
}
