#!/usr/bin/env node
/** Loads supabase/corpus into a seeded org: node scripts/seed-corpus.mjs [--org-slug x]. */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { seedSource } from './lib/seed-source.mjs';

import { DEMO_TEAM_SPACES } from './demo-spaces.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_DIR = join(ROOT, 'supabase/corpus');
const MANIFEST = join(CORPUS_DIR, 'manifest.json');
const BUCKET = 'documents';

/** Team spaces the corpus needs. Membership is seeded by scripts/seed-demo.mjs. */
const TEAM_SPACES = [
  { key: 'marketing', name: 'Marketing' },
  { key: 'engineering', name: 'Engineering' },
  { key: 'finance', name: 'Finance' },
  ...DEMO_TEAM_SPACES,
];

/** Personal folders in the corpus, and whose personal space each one loads into. */
const PERSONAL_FOLDERS = {
  'personal-jane': 'jane@example.com',
  'personal-sam': 'sam@example.com',
  'personal-john': 'john@example.com',
};

/** Manifest sources that arrive through a connection, and the provider each one connects to. */
const PROVIDER_BY_SOURCE = {
  notion: 'notion',
  linear: 'linear',
  slack: 'slack',
  drive: 'google_drive',
};

class SeedError extends Error {}

/** Reads `--org-slug` off the command line. Returns null when it is absent. */
function parseOrgSlug(argv) {
  const index = argv.indexOf('--org-slug');
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new SeedError('--org-slug needs a value');
  }
  return value;
}

/** Fails loudly rather than writing half a corpus into the wrong place. */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new SeedError(`${name} is not set`);
  return value;
}

/** Throws on a PostgREST error so no caller has to check two things. */
function unwrap(result, what) {
  if (result.error) {
    throw new SeedError(`${what}: ${result.error.message}`);
  }
  return result.data;
}

/** Resolves the target org from `--org-slug`, or the only one that exists. */
async function resolveOrg(db, slug) {
  if (slug) {
    const rows = unwrap(
      await db.from('organizations').select('id, name, slug').eq('slug', slug).limit(1),
      'reading organizations',
    );
    if (rows.length === 0) throw new SeedError(`no organization with slug ${slug}`);
    return rows[0];
  }

  const rows = unwrap(
    await db.from('organizations').select('id, name, slug').order('created_at').limit(2),
    'reading organizations',
  );
  if (rows.length === 0) throw new SeedError('no organizations exist, seed one first');
  if (rows.length > 1) {
    throw new SeedError('more than one organization exists, pass --org-slug');
  }
  return rows[0];
}

/** The org members keyed by email, so the manifest can name an author by address. */
async function resolveMembers(db, orgId) {
  const rows = unwrap(
    await db
      .from('org_members')
      .select('user_id, role, created_at')
      .eq('org_id', orgId)
      .order('created_at'),
    'reading org members',
  );
  if (rows.length < 2) {
    throw new SeedError(`org needs at least two members for the corpus, found ${rows.length}`);
  }

  const byEmail = new Map();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new SeedError(`reading the user directory: ${error.message}`);
    for (const user of data.users) {
      if (user.email) byEmail.set(user.email, user.id);
    }
    if (data.users.length < 1000) break;
  }

  return { rows, byEmail };
}

/** Finds a space by a filter, or creates it. Returns its id either way. */
async function findOrCreateSpace(db, { orgId, kind, name, ownerUserId }) {
  let query = db.from('spaces').select('id').eq('org_id', orgId).eq('kind', kind);
  query = ownerUserId ? query.eq('owner_user_id', ownerUserId) : query.eq('name', name);

  const existing = unwrap(await query.limit(1), `reading ${kind} space`);
  if (existing.length > 0) return existing[0].id;

  const created = unwrap(
    await db
      .from('spaces')
      .insert({ org_id: orgId, kind, name, owner_user_id: ownerUserId ?? null })
      .select('id')
      .single(),
    `creating ${kind} space ${name}`,
  );
  return created.id;
}

/** Space membership is additive here. Running twice adds nobody twice. */
async function addSpaceMembers(db, spaceId, userIds) {
  const rows = userIds.map((userId) => ({ space_id: spaceId, user_id: userId }));
  const result = await db.from('space_members').upsert(rows, { onConflict: 'space_id,user_id' });
  if (result.error) {
    throw new SeedError(`adding space members: ${result.error.message}`);
  }
}

/** Maps manifest `space` values to space ids. Team membership belongs to seed-demo.mjs. */
async function resolveSpaces(db, orgId, byEmail) {
  const spaces = {};

  const orgSpace = unwrap(
    await db.from('spaces').select('id').eq('org_id', orgId).eq('kind', 'org').limit(1),
    'reading org space',
  );
  if (orgSpace.length === 0) throw new SeedError('org has no org space');
  spaces.company = orgSpace[0].id;

  for (const team of TEAM_SPACES) {
    spaces[team.key] = await findOrCreateSpace(db, { orgId, kind: 'team', name: team.name });
  }

  for (const [key, email] of Object.entries(PERSONAL_FOLDERS)) {
    const userId = byEmail.get(email);
    if (!userId) throw new SeedError(`${email} has no account, run scripts/seed-demo.mjs first`);

    spaces[key] = await findOrCreateSpace(db, {
      orgId,
      kind: 'personal',
      name: 'Personal',
      ownerUserId: userId,
    });
    await addSpaceMembers(db, spaces[key], [userId]);
  }

  return spaces;
}

/** Reads the documents bucket definition out of `supabase/config.toml`. */
function bucketConfig() {
  const toml = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8');
  const table = toml.split(`[storage.buckets.${BUCKET}]`)[1];
  if (!table) throw new SeedError(`supabase/config.toml has no [storage.buckets.${BUCKET}]`);

  const body = table.split(/\n\[/)[0];
  const limit = body.match(/file_size_limit\s*=\s*"([^"]+)"/)?.[1];
  const mimeBlock = body.match(/allowed_mime_types\s*=\s*\[([^\]]*)\]/)?.[1] ?? '';

  if (!limit) throw new SeedError('the documents bucket has no file_size_limit');

  return {
    // The storage API accepts MB, GB and KB, and rejects the MiB spelling config.toml uses.
    fileSizeLimit: limit.replace(/MiB$/, 'MB').replace(/GiB$/, 'GB').replace(/KiB$/, 'KB'),
    allowedMimeTypes: [...mimeBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
  };
}

/** Creates the bucket when the running stack predates its config.toml entry. */
async function ensureBucket(db) {
  const { data } = await db.storage.getBucket(BUCKET);
  if (data) return false;

  const { error } = await db.storage.createBucket(BUCKET, {
    public: false,
    ...bucketConfig(),
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new SeedError(`creating the ${BUCKET} bucket: ${error.message}`);
  }
  return true;
}

/** The account each provider connects to. One company, so one workspace per tool. */
const ACCOUNT_BY_PROVIDER = {
  notion: 'Supaphone',
  linear: 'linear.app/supaphone',
  slack: 'supaphone.slack.com',
  google_drive: 'Supaphone Shared Drive',
};

/** Which unit of the source a document sits in, read off the filename the corpus already uses. */
const SCOPE_ITEM_OF = {
  slack: (path) => {
    const channel = /\/slack-(.+?)-\d{4}-\d{2}-\d{2}-/.exec(path);
    return channel ? { id: channel[1], name: `#${channel[1]}` } : null;
  },
  linear: (path) => {
    const team = /\/linear-([A-Z]+)-\d+-/.exec(path);
    return team ? { id: team[1].toLowerCase(), name: `${team[1]} team` } : null;
  },
  notion: (path, spaceName) => ({ id: path.split('/')[0], name: `${spaceName} teamspace` }),
  drive: (path, spaceName) => ({ id: path.split('/')[0], name: `${spaceName}/` }),
};

/**
 * What each account can see, and where each unit lands. `available` is every unit the account
 * reaches. `routes` sends each one to a single space, because a unit belongs to one place.
 */
function buildScopes(manifest, spaceNames, spaces) {
  const available = {};
  const claims = {};

  for (const entry of manifest) {
    const read = SCOPE_ITEM_OF[entry.source];
    if (!read) continue;
    const item = read(entry.path, spaceNames[entry.space] ?? entry.space);
    if (!item) continue;

    (available[entry.source] ??= new Map()).set(item.id, item);
    const counts = (claims[entry.source] ??= new Map()).get(item.id) ?? new Map();
    counts.set(entry.space, (counts.get(entry.space) ?? 0) + 1);
    claims[entry.source].set(item.id, counts);
  }

  const routes = {};
  for (const [source, units] of Object.entries(claims)) {
    routes[source] = {};
    for (const [unitId, counts] of units) {
      const ranked = [...counts].sort((a, b) => b[1] - a[1]);
      // A unit routes to one space. The corpus can name two, and the busier one wins out loud.
      if (ranked.length > 1) {
        const others = ranked
          .slice(1)
          .map(([key, n]) => `${key} (${n})`)
          .join(', ');
        console.warn(
          `  ${source}/${unitId} appears in more than one space, routing to ${ranked[0][0]} ` +
            `(${ranked[0][1]}) over ${others}`,
        );
      }
      routes[source][unitId] = spaces[ranked[0][0]];
    }
  }

  return { available, routes };
}

/** One connection per account, so a provider is connected once and its units are routed. */
async function ensureConnections(db, { orgId, spaces, spaceNames, manifest, ownerUserId }) {
  const providers = new Set(
    manifest.map((entry) => PROVIDER_BY_SOURCE[entry.source]).filter(Boolean),
  );

  const { available, routes } = buildScopes(manifest, spaceNames, spaces);
  const scopeKind = Object.fromEntries(
    unwrap(
      await db.from('providers').select('slug, scope_selection_kind'),
      'reading provider scope kinds',
    ).map((row) => [row.slug, row.scope_selection_kind]),
  );

  const sourceOfProvider = Object.fromEntries(
    Object.entries(PROVIDER_BY_SOURCE).map(([source, provider]) => [provider, source]),
  );

  const connections = new Map();
  for (const provider of providers) {
    const source = sourceOfProvider[provider];
    const scopeSelection = {
      kind: scopeKind[provider],
      available: [...(available[source]?.values() ?? [])],
      routes: routes[source] ?? {},
    };

    const existing = unwrap(
      await db
        .from('connections')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', ownerUserId)
        .eq('provider', provider)
        .limit(1),
      `reading the ${provider} connection`,
    );

    if (existing.length > 0) {
      connections.set(source, existing[0].id);
      continue;
    }

    const created = unwrap(
      await db
        .from('connections')
        .insert({
          org_id: orgId,
          user_id: ownerUserId,
          provider,
          external_account_id: ACCOUNT_BY_PROVIDER[provider],
          scope_selection: scopeSelection,
          status: 'active',
          last_synced_at: new Date().toISOString(),
        })
        .select('id')
        .single(),
      `creating the ${provider} connection`,
    );
    connections.set(source, created.id);
  }

  return connections;
}

/** Reconcile each source document and repair missing or failed ingestion. */
async function loadEntry(db, { entry, orgId, spaceId, authorId, connectionId }) {
  return seedSource(db, {
    bucket: BUCKET,
    body: readFileSync(join(CORPUS_DIR, entry.path), 'utf8'),
    row: {
      org_id: orgId,
      space_id: spaceId,
      external_id: entry.externalId,
      title: entry.title,
      url: entry.url,
      mime_type: 'text/markdown',
      storage_path: `${orgId}/corpus/${entry.path}`,
      connection_id: connectionId,
      origin: connectionId ? 'sync' : 'upload',
      created_by: connectionId ? null : (authorId ?? null),
      updated_at: entry.updatedAt,
    },
  });
}

async function main() {
  const slug = parseOrgSlug(process.argv.slice(2));
  const db = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SB_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (await ensureBucket(db)) console.log(`created the ${BUCKET} storage bucket`);
  const org = await resolveOrg(db, slug);
  const { rows: members, byEmail } = await resolveMembers(db, org.id);
  const spaces = await resolveSpaces(db, org.id, byEmail);

  // The name each corpus folder reads as inside its source, used to label folders and teamspaces.
  const spaceNames = {
    company: 'Company',
    ...Object.fromEntries(TEAM_SPACES.map((team) => [team.key, team.name])),
    ...Object.fromEntries(Object.keys(PERSONAL_FOLDERS).map((key) => [key, 'Personal'])),
  };

  const ownerUserId = (members.find((member) => member.role === 'owner') ?? members[0]).user_id;
  const connections = await ensureConnections(db, {
    orgId: org.id,
    spaces,
    spaceNames,
    manifest,
    ownerUserId,
  });

  console.log(`org ${org.name} (${org.slug})`);
  console.log(
    `members ${members.length}, spaces ${Object.keys(spaces).length}, connections ${connections.size}`,
  );

  const counts = { reconciled: 0 };
  const perSpace = {};
  for (const entry of manifest) {
    const spaceId = spaces[entry.space];
    if (!spaceId)
      throw new SeedError(`manifest entry ${entry.path} names unknown space ${entry.space}`);
    const authorId = entry.author ? byEmail.get(entry.author) : null;
    if (entry.author && !authorId) {
      throw new SeedError(`manifest entry ${entry.path} names unknown author ${entry.author}`);
    }
    const connectionId = connections.get(entry.source) ?? null;
    const outcome = await loadEntry(db, {
      entry,
      orgId: org.id,
      spaceId,
      authorId,
      connectionId,
    });
    counts[outcome] += 1;
    perSpace[entry.space] = (perSpace[entry.space] ?? 0) + 1;
  }

  console.log(`documents reconciled ${counts.reconciled}`);
  for (const [space, total] of Object.entries(perSpace)) {
    console.log(`  ${space}: ${total}`);
  }
}

main().catch((error) => {
  if (error instanceof SeedError) {
    console.error(`seed-corpus: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
