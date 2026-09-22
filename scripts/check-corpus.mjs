#!/usr/bin/env node
/** Checks supabase/corpus against the rules in its own COMPANY.md. */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(ROOT, 'supabase/corpus');

const EVERYONE = [
  'Jane Okonkwo',
  'Sam Lindqvist',
  'Ben Achilov',
  'Maya Restrepo',
  'Priya Raghunathan',
  'John Mbeki',
  'Dana Provenzano',
];

/** Who may write, own, assign or comment in each space. Mentions are not restricted. */
const MEMBERS = {
  company: EVERYONE,
  marketing: ['Jane Okonkwo', 'Maya Restrepo', 'Priya Raghunathan', 'Ben Achilov'],
  engineering: ['Jane Okonkwo', 'Sam Lindqvist', 'Ben Achilov', 'John Mbeki'],
  finance: ['Jane Okonkwo', 'John Mbeki', 'Dana Provenzano'],
};

const FIRST_DAY = '2026-09-14';
const LAST_DAY = '2026-09-22';
const SOURCES = new Set(['slack', 'linear', 'notion', 'drive', 'upload']);

/** A line where someone takes part, as opposed to being talked about. */
const SPEAKER =
  /^\*\*([A-Z][a-z]+ [A-Z][a-z]+)\*\*|^\|\s*(?:Owner|Assignee|Author)\s*\|\s*([A-Z][a-z]+ [A-Z][a-z]+)/;

export function checkCorpus(corpus = CORPUS) {
  const failures = [];
  let files = 0;

  for (const [space, allowed] of Object.entries(MEMBERS)) {
    let names;
    try {
      names = readdirSync(join(corpus, space)).filter((n) => n.endsWith('.md'));
    } catch {
      failures.push(`${space}/ is missing`);
      continue;
    }

    for (const name of names) {
      const path = `${space}/${name}`;
      const body = readFileSync(join(corpus, path), 'utf8');
      files += 1;
      if (!SOURCES.has(name.split('-')[0])) failures.push(`${path}: unknown source prefix`);

      // An upload is a scan or an export and a personal note is scratch, so neither leads with
      // a heading. Everything that came out of a tool does.
      const needsHeading = !name.startsWith('upload-') && !name.startsWith('personal-');
      if (needsHeading && !/^#\s+\S/m.test(body)) failures.push(`${path}: no title`);
      if (!needsHeading && body.trim().length === 0) failures.push(`${path}: empty`);

      for (const line of body.split('\n')) {
        const match = SPEAKER.exec(line);
        if (!match) continue;
        const who = match[1] ?? match[2];
        if (!EVERYONE.includes(who)) {
          failures.push(`${path}: ${who} is not in the company`);
        } else if (!allowed.includes(who)) {
          failures.push(`${path}: ${who} takes part but is not in ${space}`);
        }
      }

      // Only the document's own date has to fall in range. A September memo naming a
      // November launch is the corpus working, not a bug.
      const stamps = [
        ...body.matchAll(/^\|\s*(?:Created|Updated|Last edited)\s*\|\s*(2026-\d{2}-\d{2})/gm),
        ...name.matchAll(/(2026-\d{2}-\d{2})/g),
      ].map((m) => m[1]);

      for (const stamp of stamps) {
        if (stamp > LAST_DAY) failures.push(`${path}: dated ${stamp}, after the corpus ends`);
        if (stamp < FIRST_DAY) failures.push(`${path}: dated ${stamp}, before the corpus starts`);
      }
    }
  }

  if (files < 24 || files > 32) failures.push(`expected 24 to 32 source documents, found ${files}`);

  // Two documents under one issue number are two different tickets with the same name.
  const issues = new Map();
  for (const space of Object.keys(MEMBERS)) {
    for (const name of readdirSync(join(corpus, space))) {
      const issue = /^linear-([A-Z]+-\d+)-/.exec(name);
      if (!issue) continue;
      const seen = issues.get(issue[1]);
      if (seen) failures.push(`${space}/${name}: reuses ${issue[1]}, already ${seen}`);
      else issues.set(issue[1], `${space}/${name}`);
    }
  }

  // A document that names a future launch or booking must not inherit that date as its own.
  try {
    const manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8'));
    const paths = new Set(manifest.map((entry) => entry.path));
    if (paths.size !== manifest.length) failures.push('manifest contains duplicate paths');
    if (files !== manifest.length)
      failures.push(`validated ${files} files but manifest has ${manifest.length}`);
    for (const entry of manifest) {
      if (!MEMBERS[entry.space]) failures.push(`${entry.path}: unknown space ${entry.space}`);
      try {
        readFileSync(join(corpus, entry.path), 'utf8');
      } catch {
        failures.push(`${entry.path}: source file missing`);
      }
      const day = entry.updatedAt.slice(0, 10);
      if (day > LAST_DAY || day < FIRST_DAY) {
        failures.push(`${entry.path}: manifest date ${day} falls outside the corpus`);
      }
    }
  } catch {
    failures.push('manifest.json is missing or unreadable, run pnpm corpus:manifest');
  }

  return { failures, files };
}

function main() {
  const { failures, files } = checkCorpus();
  if (failures.length > 0) {
    console.error(`corpus FAILED: ${failures.length} problem(s)\n`);
    for (const failure of failures.slice(0, 40)) console.error(`  ${failure}`);
    if (failures.length > 40) console.error(`  ...and ${failures.length - 40} more`);
    console.error('\nThe rules are in supabase/corpus/COMPANY.md.');
    process.exit(1);
  }

  console.log(`corpus: ${files} Launch Week documents validated`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
