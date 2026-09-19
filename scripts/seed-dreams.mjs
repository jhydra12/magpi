#!/usr/bin/env node
/**
 * Seeds a history of nightly dreams, so the dream log has nights on it before the first real run.
 *
 * Each entry in supabase/corpus/dreams/manifest.json becomes one night for one space: the three
 * runs the schedule queues, the digest they wrote as a dream document cited to the chunks the
 * day's documents produced, the document links the connections pass proposed with a similarity
 * measured from the real embeddings, and the model calls the night would have spent. The digest
 * body goes through the ingest worker like every other document, so it is chunked and embedded
 * by the same code. Runs after the corpus is ingested, since the citations and similarities
 * come from its chunks.
 *
 * Idempotent: a night that already has runs for its space is skipped.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_DIR = resolve(ROOT, 'supabase/corpus');
const DREAMS_MANIFEST = resolve(CORPUS_DIR, 'dreams/manifest.json');
const BUCKET = 'documents';

/** Pinned with the dream pass in supabase/functions/_shared/models.ts. */
const DREAM_MODEL = 'gpt-4.1-2025-04-14';
const EXTRACT_MODEL = 'gpt-4.1-mini-2025-04-14';

/** The space each corpus folder lands in, by the name the seed gives it. */
const SPACE_NAMES = {
  company: 'Company',
  engineering: 'Engineering',
  finance: 'Finance',
  marketing: 'Marketing',
};

/** One night that did not finish, so the log shows what that looks like. */
const TIMED_OUT = { space: 'marketing', night: '2026-09-10' };

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function unwrap(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** A deterministic spread of seconds, so every seed writes the same clock. */
function jitter(seed, from, to) {
  const hash = createHash('sha256').update(seed).digest();
  return from + (hash[0] / 255) * (to - from);
}

function at(base, offsetSeconds) {
  return new Date(base.getTime() + offsetSeconds * 1000).toISOString();
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Postgres hands a vector back as text. */
function parseVector(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function resolveOrg(db, slug) {
  const rows = unwrap(
    await db.from('organizations').select('id, slug').eq('slug', slug).limit(1),
    'reading the organization',
  );
  if (rows.length === 0) throw new Error(`no organization with slug ${slug}`);
  return rows[0];
}

async function resolveSpaces(db, orgId) {
  const rows = unwrap(
    await db.from('spaces').select('id, name, kind').eq('org_id', orgId),
    'reading spaces',
  );
  const byName = new Map(rows.map((row) => [row.name, row.id]));
  const spaces = {};
  for (const [folder, name] of Object.entries(SPACE_NAMES)) {
    const id = byName.get(name);
    if (!id) throw new Error(`the ${name} space is missing; seed the corpus first`);
    spaces[folder] = id;
  }
  return spaces;
}

/** Every corpus document's id and opening chunk, keyed by external id. */
async function resolveCorpus(db, orgId) {
  const documents = unwrap(
    await db
      .from('documents')
      .select('id, external_id, space_id')
      .eq('org_id', orgId)
      .neq('origin', 'dream')
      .not('external_id', 'is', null)
      .limit(2000),
    'reading documents',
  );
  const documentIds = documents.map((document) => document.id);
  const chunks = [];
  for (let start = 0; start < documentIds.length; start += 100) {
    const batch = unwrap(
      await db
        .from('chunks')
        .select('id, document_id, token_count, embedding')
        .eq('org_id', orgId)
        .eq('ordinal', 0)
        .in('document_id', documentIds.slice(start, start + 100)),
      'reading opening chunks',
    );
    chunks.push(...batch);
  }
  const openers = new Map(chunks.map((chunk) => [chunk.document_id, chunk]));
  return new Map(
    documents.map((document) => [
      document.external_id,
      { ...document, opener: openers.get(document.id) ?? null },
    ]),
  );
}

async function nightExists(db, spaceId, night) {
  const rows = unwrap(
    await db
      .from('dream_runs')
      .select('id')
      .eq('space_id', spaceId)
      .gte('created_at', `${night}T00:00:00.000Z`)
      .lt('created_at', `${night}T23:59:59.999Z`)
      .limit(1),
    'reading dream runs',
  );
  return rows.length > 0;
}

async function insertRun(db, row) {
  const inserted = unwrap(
    await db.from('dream_runs').insert(row).select('id').single(),
    `inserting the ${row.kind} run`,
  );
  return inserted.id;
}

/**
 * The manifest names the corpus days its digests read. The log shows nights counted back from
 * today, so the seeded nights land on the nights before the seed runs: the last manifest night
 * becomes last night, the one before it two nights ago, and so on.
 */
function shiftNights(dreams, today) {
  const nights = [...new Set(dreams.map((dream) => dream.night))].sort();
  const shifted = new Map(
    nights.map((night, index) => {
      const date = new Date(`${today}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() - (nights.length - index));
      return [night, date.toISOString().slice(0, 10)];
    }),
  );
  return dreams.map((dream) => ({
    ...dream,
    corpusNight: dream.night,
    night: shifted.get(dream.night),
  }));
}

async function seedNight(db, { org, spaces, corpus, dream }) {
  const spaceId = spaces[dream.space];
  const cited = dream.cited.map((externalId) => corpus.get(externalId)).filter(Boolean);
  const citedChunks = cited.map((document) => document.opener).filter(Boolean);
  const inputTokens = citedChunks.reduce((total, chunk) => total + (chunk.token_count ?? 0), 0);
  const timedOut = dream.space === TIMED_OUT.space && dream.corpusNight === TIMED_OUT.night;

  // Queued at 01:55 UTC by the schedule, drained through the 02:00 hour.
  const queuedAt = new Date(`${dream.night}T01:55:00.000Z`);
  const base = { org_id: org.id, space_id: spaceId, created_at: queuedAt.toISOString() };
  const calls = [];

  // The worker drains one space's runs before the next, so the spaces follow each other a few
  // minutes apart. Overlapping nights would share model calls in the log's spend column.
  const spaceOffset = Object.keys(SPACE_NAMES).indexOf(dream.space) * 240;

  // Entities, first, and quick: the matcher runs without a model, the discovery with one.
  const entitiesStart = 300 + spaceOffset + jitter(`${dream.path}:e`, 0, 60);
  const entitiesEnd = entitiesStart + 25 + jitter(`${dream.path}:e2`, 0, 40);
  await insertRun(db, {
    ...base,
    kind: 'entities',
    status: 'succeeded',
    started_at: at(queuedAt, entitiesStart),
    finished_at: at(queuedAt, entitiesEnd),
    input_document_count: dream.cited.length,
  });
  calls.push({
    purpose: 'extract',
    model: EXTRACT_MODEL,
    input_tokens: inputTokens + 700,
    output_tokens: 300 + Math.round(jitter(`${dream.path}:eo`, 0, 400)),
    latency_ms: Math.round((entitiesEnd - entitiesStart) * 400),
    occurred_at: at(queuedAt, entitiesStart + 10),
  });

  // The digest, the long one: one model call over everything the day produced.
  const digestStart = entitiesEnd + 5;
  const digestEnd = digestStart + (timedOut ? 600 : 45 + jitter(`${dream.path}:d`, 0, 90));
  const digestRunId = await insertRun(db, {
    ...base,
    kind: 'digest',
    status: timedOut ? 'timeout' : 'succeeded',
    started_at: at(queuedAt, digestStart),
    finished_at: at(queuedAt, digestEnd),
    input_document_count: dream.cited.length,
    error: timedOut ? 'synthesize: the model did not answer inside the budget' : null,
  });

  if (!timedOut) {
    const body = readFileSync(join(CORPUS_DIR, dream.path), 'utf8');
    const storagePath = `${org.id}/${dream.path}`;
    const upload = await db.storage
      .from(BUCKET)
      .upload(storagePath, body, { contentType: 'text/markdown', upsert: true });
    if (upload.error) throw new Error(`uploading ${dream.path}: ${upload.error.message}`);

    const document = unwrap(
      await db
        .from('documents')
        .insert({
          org_id: org.id,
          space_id: spaceId,
          title: `Digest for ${dream.night}`,
          origin: 'dream',
          dream_run_id: digestRunId,
          mime_type: 'text/markdown',
          storage_path: storagePath,
          content_hash: createHash('sha256').update(body).digest('hex'),
          source_chunk_ids: citedChunks.map((chunk) => chunk.id),
          created_at: at(queuedAt, digestEnd),
          updated_at: at(queuedAt, digestEnd),
        })
        .select('id')
        .single(),
      `inserting the digest for ${dream.path}`,
    );
    unwrap(
      await db.from('dream_runs').update({ output_document_id: document.id }).eq('id', digestRunId),
      'pointing the run at its digest',
    );
    unwrap(
      await db
        .from('ingest_jobs')
        .insert({
          org_id: org.id,
          space_id: spaceId,
          document_id: document.id,
          stage: 'fetch',
          status: 'queued',
        })
        .select('id')
        .single(),
      `queueing ingest for ${dream.path}`,
    );
    calls.push({
      purpose: 'dream',
      model: DREAM_MODEL,
      input_tokens: inputTokens + 900,
      output_tokens: Math.round(body.length / 4),
      latency_ms: Math.round((digestEnd - digestStart) * 900),
      occurred_at: at(queuedAt, digestStart + 5),
    });
  }

  // Connections last: a search per document, then one short call per pair for the rationale.
  const linksStart = digestEnd + 5;
  const linksEnd = linksStart + 15 + jitter(`${dream.path}:l`, 0, 45);
  const linksRunId = await insertRun(db, {
    ...base,
    kind: 'connections',
    status: 'succeeded',
    started_at: at(queuedAt, linksStart),
    finished_at: at(queuedAt, linksEnd),
    input_document_count: dream.cited.length,
  });

  const links = dream.links.flatMap((link, index) => {
    const a = corpus.get(link.a);
    const b = corpus.get(link.b);
    if (!a?.opener?.embedding || !b?.opener?.embedding || a.id === b.id) return [];
    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    const similarity = cosine(parseVector(a.opener.embedding), parseVector(b.opener.embedding));
    // Older nights have been looked at: the first pair confirmed, the last dismissed.
    const reviewed = dream.corpusNight < '2026-09-09';
    return [
      {
        dream_run_id: linksRunId,
        space_id: spaceId,
        document_a: first.id,
        document_b: second.id,
        similarity: Number(similarity.toFixed(4)),
        rationale: link.rationale,
        confirmed_at: reviewed && index === 0 ? at(queuedAt, 8 * 3600) : null,
        dismissed_at:
          reviewed && index === dream.links.length - 1 && index > 0 ? at(queuedAt, 8 * 3600) : null,
        created_at: at(queuedAt, linksEnd - 2),
      },
    ];
  });
  if (links.length > 0) {
    unwrap(
      await db.from('dream_links').upsert(links, { onConflict: 'space_id,document_a,document_b' }),
      'inserting document links',
    );
  }
  for (const [index] of links.entries()) {
    calls.push({
      purpose: 'dream',
      model: DREAM_MODEL,
      input_tokens: 1100 + Math.round(jitter(`${dream.path}:${index}`, 0, 400)),
      output_tokens: 40 + Math.round(jitter(`${dream.path}:${index}o`, 0, 40)),
      latency_ms: 1500,
      occurred_at: at(queuedAt, linksStart + 4 + index * 3),
    });
  }

  unwrap(
    await db
      .from('model_calls')
      .insert(calls.map((call) => ({ ...call, org_id: org.id, succeeded: true }))),
    'recording model calls',
  );

  return { runs: 3, links: links.length, digest: !timedOut };
}

async function main() {
  const slugFlag = process.argv.indexOf('--org-slug');
  const slug = slugFlag === -1 ? null : process.argv[slugFlag + 1];
  if (!slug) throw new Error('pass --org-slug <slug>');

  const db = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SB_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const today = new Date().toISOString().slice(0, 10);
  const dreams = shiftNights(JSON.parse(readFileSync(DREAMS_MANIFEST, 'utf8')), today);
  const org = await resolveOrg(db, slug);
  const spaces = await resolveSpaces(db, org.id);
  const corpus = await resolveCorpus(db, org.id);

  let seeded = 0;
  let skipped = 0;
  for (const dream of dreams) {
    if (await nightExists(db, spaces[dream.space], dream.night)) {
      skipped += 1;
      continue;
    }
    const outcome = await seedNight(db, { org, spaces, corpus, dream });
    seeded += 1;
    console.log(
      `${dream.night} ${dream.space.padEnd(12)} ${outcome.runs} runs, ${outcome.links} link(s)` +
        (outcome.digest ? '' : ', digest timed out'),
    );
  }

  console.log(`\nseeded ${seeded} night(s), skipped ${skipped} already there`);
  if (seeded > 0) console.log('the digests are queued to ingest');
}

await main();
