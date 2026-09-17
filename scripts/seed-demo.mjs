#!/usr/bin/env node
/** Creates the Supaphone demo people, puts them in one organization, and loads the sample corpus. */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SB_SERVICE_ROLE_KEY;

/** Published in the README. Demo accounts only. */
const PASSWORD = 'supabasedemo';

/** The cast from supabase/corpus/COMPANY.md. Jane is first, so the org is hers. */
const PEOPLE = [
  {
    email: 'jane@example.com',
    label: 'Jane',
    role: 'owner',
    spaces: ['Marketing', 'Engineering', 'Finance'],
  },
  { email: 'sam@example.com', label: 'Sam', role: 'member', spaces: ['Engineering'] },
  { email: 'ben@example.com', label: 'Ben', role: 'member', spaces: ['Marketing', 'Engineering'] },
  { email: 'maya@example.com', label: 'Maya', role: 'member', spaces: ['Marketing'] },
  { email: 'priya@example.com', label: 'Priya', role: 'member', spaces: ['Marketing'] },
  { email: 'john@example.com', label: 'John', role: 'member', spaces: ['Engineering', 'Finance'] },
  { email: 'dana@example.com', label: 'Dana', role: 'member', spaces: ['Finance'] },
];

/** Every shared space besides the org space, which the signup trigger already made. */
const TEAM_SPACES = ['Marketing', 'Engineering', 'Finance'];

function db() {
  if (!SERVICE_KEY) {
    console.error('SB_SERVICE_ROLE_KEY is missing. Run with node --env-file=web/.env.local.');
    process.exit(1);
  }
  return createClient(API_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensurePerson(client, person) {
  const { data, error } = await client.auth.admin.createUser({
    email: person.email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (!error) return { ...person, id: data.user.id, created: true };

  // Only "already registered" falls through to the lookup. Other errors are raised as themselves.
  if (!isAlreadyRegistered(error)) {
    throw new Error(`could not create ${person.email}: ${error.message}`);
  }

  const existing = await findByEmail(client, person.email);
  if (!existing) {
    throw new Error(
      `${person.email} is registered but is not in the first pages of the directory. ` +
        'Reset the local database, or delete the account by hand.',
    );
  }
  return { ...person, id: existing.id, created: false };
}

/** GoTrue reports an existing address by code on newer versions and by message on older ones. */
function isAlreadyRegistered(error) {
  return (
    error.code === 'email_exists' ||
    error.status === 422 ||
    /already (been )?registered|already exists/i.test(error.message ?? '')
  );
}

/** The admin API has no get-by-email, so this pages through the listing to find the id. */
async function findByEmail(client, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`could not read the user directory: ${error.message}`);

    const found = data.users.find((user) => user.email === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/**
 * Everyone joins the first person's organization, which means leaving their own. A person belongs
 * to exactly one organization, so the membership the signup trigger made is moved rather than
 * added to. The organization it leaves behind has nobody in it and is deleted with its spaces.
 */
async function joinOrganization(client, orgId, person) {
  const { data: current, error: readError } = await client
    .from('org_members')
    .select('org_id')
    .eq('user_id', person.id)
    .maybeSingle();
  if (readError) throw new Error(`reading ${person.email} membership: ${readError.message}`);
  if (current?.org_id === orgId) return;

  const { error } = current
    ? await client
        .from('org_members')
        .update({ org_id: orgId, role: person.role })
        .eq('user_id', person.id)
    : await client
        .from('org_members')
        .insert({ org_id: orgId, user_id: person.id, role: person.role });
  if (error) throw new Error(`moving ${person.email} into the org: ${error.message}`);

  // Nobody is left in it, so it is unreachable. Its personal space goes with it, and the corpus
  // makes a fresh one in the organization the person actually belongs to.
  if (current?.org_id) {
    const { error: cleanup } = await client.from('organizations').delete().eq('id', current.org_id);
    if (cleanup) throw new Error(`removing ${person.email} old org: ${cleanup.message}`);
  }
}

/**
 * The trigger enrolled each person in the org space of their own organization, and that went with
 * it. Everyone belongs to the org space of the organization they are now in.
 */
async function joinOrgSpace(client, orgId, people) {
  const { data: orgSpace, error: readError } = await client
    .from('spaces')
    .select('id')
    .eq('org_id', orgId)
    .eq('kind', 'org')
    .maybeSingle();
  if (readError) throw new Error(`reading the org space: ${readError.message}`);
  if (!orgSpace) throw new Error('the organization has no org space');

  const { error } = await client.from('space_members').upsert(
    people.map((person) => ({ space_id: orgSpace.id, user_id: person.id })),
    { onConflict: 'space_id,user_id' },
  );
  if (error) throw new Error(`enrolling everyone in the org space: ${error.message}`);
}

/** The org space is created by the trigger as Everyone. The corpus calls it Company. */
async function renameOrgSpace(client, orgId) {
  await client.from('spaces').update({ name: 'Company' }).eq('org_id', orgId).eq('kind', 'org');
}

/** One team space by name, created once and reused on a second run. */
async function ensureTeamSpace(client, orgId, name) {
  const { data: existing } = await client
    .from('spaces')
    .select('id')
    .eq('org_id', orgId)
    .eq('kind', 'team')
    .eq('name', name)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await client
    .from('spaces')
    .insert({ org_id: orgId, kind: 'team', name })
    .select('id')
    .single();

  if (error) throw new Error(`could not create the ${name} space: ${error.message}`);
  return data.id;
}

/** Membership is what decides who can read what. Nothing else in this product does. */
async function ensureTeamSpaces(client, orgId, people) {
  const byName = {};
  for (const name of TEAM_SPACES) byName[name] = await ensureTeamSpace(client, orgId, name);

  for (const person of people) {
    for (const name of person.spaces) {
      await client
        .from('space_members')
        .upsert({ space_id: byName[name], user_id: person.id }, { onConflict: 'space_id,user_id' });
    }
  }

  return byName;
}

const FUNCTIONS_URL = process.env.SB_FUNCTIONS_BASE_URL ?? `${API_URL}/functions/v1`;

/** The one failure worth spelling out, because the fix is a command rather than a code change. */
function notServing(detail) {
  console.error(`\nthe ingest worker is not serving at ${FUNCTIONS_URL} (${detail})`);
  console.error('start it with:  supabase functions serve --env-file supabase/.env.local');
  console.error('the documents are seeded, so running this again picks up where it stopped');
  process.exit(1);
}
const BATCH = 25;

/** How many jobs are still waiting, so the loop stops when there is nothing left. */
async function queuedCount(client) {
  const { count, error } = await client
    .from('ingest_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued');
  if (error) throw new Error(`counting ingest jobs: ${error.message}`);
  return count ?? 0;
}

/**
 * Chunks and embeds everything the corpus just wrote. Without this a seeded database holds
 * documents nobody can ask about, which looks like a broken product rather than an unfinished
 * seed. It calls the same worker the cron calls, so nothing here is demo-only machinery.
 */
async function ingestEverything(client) {
  const waiting = await queuedCount(client);
  if (waiting === 0) {
    console.log('\nNothing queued to ingest.');
    return;
  }

  console.log(`\ningesting ${waiting} document(s), in batches of ${BATCH}`);

  let done = 0;
  const failures = [];
  for (let pass = 1; pass <= 200; pass += 1) {
    let response;
    try {
      response = await fetch(`${FUNCTIONS_URL}/ingest-worker`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batch: BATCH }),
      });
    } catch {
      notServing('nothing answered at all');
    }

    // A gateway 5xx means the runtime is not up. Kong stays running and answers for it, so this
    // arrives as a status rather than as a refused connection.
    if (response.status >= 500) notServing(`the gateway answered ${response.status}`);

    if (!response.ok) {
      const body = await response.text();
      console.error(`\ningest worker answered ${response.status}: ${body.slice(0, 200)}`);
      if (response.status === 401) console.error('SB_SERVICE_ROLE_KEY does not match this stack');
      process.exit(1);
    }

    const { claimed = 0, results = [] } = await response.json();

    // 'unchanged' is a success: the content hash matched, so there was nothing to redo.
    // 'retrying' goes back on the queue by itself. Only a timeout or a failure is a problem.
    const finished = results.filter((r) => r.kind === 'succeeded' || r.kind === 'unchanged');
    const broken = results.filter((r) => r.kind === 'timeout' || r.kind === 'failed');
    done += finished.length;
    failures.push(...broken);

    for (const failure of broken) {
      console.error(`  ${failure.kind} at ${failure.stage}: ${failure.detail ?? ''}`);
    }

    const left = await queuedCount(client);
    console.log(`  pass ${pass}: ${claimed} claimed, ${left} left`);
    if (left === 0) break;
    if (claimed === 0) {
      console.error('  the worker claimed nothing while jobs are still queued, stopping');
      break;
    }
  }

  const { count: chunks } = await client
    .from('chunks')
    .select('id', { count: 'exact', head: true });

  console.log(`\ningested ${done} document(s) into ${chunks ?? 0} chunk(s)`);

  if (failures.length > 0) {
    console.error(`${failures.length} document(s) did not ingest, so answers will have holes`);
    process.exit(1);
  }
}

async function main() {
  const client = db();

  const people = [];
  for (const person of PEOPLE) people.push(await ensurePerson(client, person));

  // Jane's own organization, made by the signup trigger. Taking the oldest one instead would
  // load Supaphone into whatever organization already happened to be in the database.
  const [jane] = people;
  const { data: membership } = await client
    .from('org_members')
    .select('org_id')
    .eq('user_id', jane.id)
    .eq('role', 'owner')
    .limit(1);

  const orgId = membership?.[0]?.org_id;
  if (!orgId) {
    throw new Error(`${jane.email} owns no organization, so the signup trigger did not fire`);
  }

  const { data: orgs } = await client
    .from('organizations')
    .select('id, slug')
    .eq('id', orgId)
    .limit(1);

  const org = orgs?.[0];
  if (!org) throw new Error('the organization the trigger made has gone missing');

  for (const person of people) await joinOrganization(client, org.id, person);
  await joinOrgSpace(client, org.id, people);
  await renameOrgSpace(client, org.id);
  await ensureTeamSpaces(client, org.id, people);

  console.log(`org      ${org.slug}`);
  for (const person of people) {
    console.log(
      `${person.label.padEnd(6)} ${person.email.padEnd(20)} Company, ${person.spaces.join(', ')}`,
    );
  }
  console.log(`password ${PASSWORD}\n`);

  const corpus = spawnSync(
    'node',
    [resolve(ROOT, 'scripts/seed-corpus.mjs'), '--org-slug', org.slug],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (corpus.status !== 0) process.exit(corpus.status ?? 1);

  if (process.argv.includes('--skip-ingest')) {
    console.log('\nSkipped the ingest. The documents are stored but nothing can answer from them.');
    return;
  }

  await ingestEverything(client);
}

await main();
