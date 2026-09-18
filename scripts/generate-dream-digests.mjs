#!/usr/bin/env node
/**
 * Writes the digests the seeded dreams carry, once, from the corpus itself.
 *
 * For each night in NIGHTS and each team space, this reads the corpus documents updated the day
 * before, asks the same model the digest pass uses for the same three sections, and asks it to
 * propose the document pairs the connections pass would have linked. The prose goes to
 * supabase/corpus/dreams/<space>-<night>.md and the citations and pairs to the manifest beside
 * it. scripts/seed-dreams.mjs loads those files, so the seed spends no tokens.
 *
 * Run with: node --env-file=web/.env.local scripts/generate-dream-digests.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_DIR = resolve(ROOT, 'supabase/corpus');
const DREAMS_DIR = resolve(CORPUS_DIR, 'dreams');
const MANIFEST = resolve(CORPUS_DIR, 'manifest.json');

/** The nights a seeded dream ran, each reading the day before it. */
const NIGHTS = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'];
const SPACES = ['company', 'engineering', 'finance', 'marketing'];

/** Pinned with the digest pass in supabase/functions/_shared/models.ts. */
const MODEL = 'gpt-4.1-2025-04-14';

const DIGEST_SYSTEM =
  'You summarise what a team changed, decided and left unresolved. Answer in short markdown ' +
  'with three sections: What changed, What was decided, What is unresolved. Say only what the ' +
  'notes say. Answer in prose. Do not add a sources or citations section.';

const RATIONALE_SYSTEM =
  'You say in one line why two documents look like they are about the same thing.';

function dayBefore(night) {
  const date = new Date(`${night}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function complete(apiKey, { system, user, json }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1500,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!response.ok) throw new Error(`OpenAI answered ${response.status}: ${await response.text()}`);
  const body = await response.json();
  return body.choices[0].message.content;
}

function notesFor(entries) {
  return entries
    .map((entry) => `### ${entry.title}\n\n${readFileSync(join(CORPUS_DIR, entry.path), 'utf8')}`)
    .join('\n\n---\n\n');
}

async function proposeLinks(apiKey, entries) {
  if (entries.length < 2) return [];
  const titles = entries.map((entry, index) => `${index + 1}. ${entry.title}`).join('\n');
  const answer = await complete(apiKey, {
    system:
      `${RATIONALE_SYSTEM} Answer with a JSON object and nothing else, of the form ` +
      '{"pairs": [{"a": 1, "b": 2, "rationale": "..."}]}, listing at most three pairs of the ' +
      'numbered documents that are about the same thing. Leave the list empty if none are.',
    user: `Documents:\n${titles}`,
    json: true,
  });
  const { pairs = [] } = JSON.parse(answer);
  return pairs
    .filter((pair) => pair.a !== pair.b && entries[pair.a - 1] && entries[pair.b - 1])
    .slice(0, 3)
    .map((pair) => ({
      a: entries[pair.a - 1].externalId,
      b: entries[pair.b - 1].externalId,
      rationale: String(pair.rationale),
    }));
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set; run with --env-file=web/.env.local');

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  mkdirSync(DREAMS_DIR, { recursive: true });
  const dreams = [];

  for (const night of NIGHTS) {
    const day = dayBefore(night);
    for (const space of SPACES) {
      const entries = manifest.filter(
        (entry) => entry.space === space && entry.updatedAt.slice(0, 10) === day,
      );
      if (entries.length === 0) continue;

      process.stdout.write(`${night} ${space.padEnd(12)} ${entries.length} document(s) ... `);
      const digest = await complete(apiKey, {
        system: DIGEST_SYSTEM,
        user: `Notes from ${day}:\n\n${notesFor(entries)}`,
      });
      const links = await proposeLinks(apiKey, entries);

      const path = `dreams/${space}-${night}.md`;
      writeFileSync(join(CORPUS_DIR, path), `${digest.trim()}\n`);
      dreams.push({
        space,
        night,
        day,
        path,
        cited: entries.map((entry) => entry.externalId),
        links,
      });
      console.log(`${links.length} link(s)`);
    }
  }

  writeFileSync(join(DREAMS_DIR, 'manifest.json'), `${JSON.stringify(dreams, null, 2)}\n`);
  console.log(`\nwrote ${dreams.length} digest(s) to ${DREAMS_DIR}`);
}

await main();
