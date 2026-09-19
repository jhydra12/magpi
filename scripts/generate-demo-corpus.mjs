#!/usr/bin/env node
/** Generates the additional deterministic demo corpus for the keynote spaces. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_TEAM_SPACES } from './demo-spaces.mjs';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const CORPUS = join(ROOT, 'supabase/corpus');
const PEOPLE = [
  'Jane Okonkwo',
  'Sam Lindqvist',
  'Ben Achilov',
  'Maya Restrepo',
  'Priya Raghunathan',
];
const CUSTOMERS = [
  'Northstar Health',
  'Brightline Retail',
  'Acme Logistics',
  'Harbor Bank',
  'Juniper Labs',
];
const SOURCES = ['notion', 'slack', 'drive', 'linear'];

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function writeDocument(space, index, source, kind) {
  const next = DEMO_TEAM_SPACES[(index + 1) % DEMO_TEAM_SPACES.length];
  const previous =
    DEMO_TEAM_SPACES[(index + DEMO_TEAM_SPACES.length - 1) % DEMO_TEAM_SPACES.length];
  const person = PEOPLE[index % PEOPLE.length];
  const customer = CUSTOMERS[index % CUSTOMERS.length];
  const project = `Atlas ${String(index + 1).padStart(2, '0')}`;
  const title = `${space.name}: ${kind}`;
  const filename = `${source}-${slug(space.key)}-${slug(kind)}.md`;
  const body = `# ${title}

Updated: 2026-09-09

${person} is coordinating ${project} for ${customer} in ${space.name}. The plan is shared with ${next.name} and ${previous.name}, which own the adjacent launch, customer, and risk decisions. The team is tracking the same ${project} milestone, the ${customer} rollout, and the decision to ship the September release together. Follow-up owners, dates, and open questions are recorded here so the company can connect the work across spaces.
`;
  const directory = join(CORPUS, space.key);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, filename), body);
}

for (const [index, space] of DEMO_TEAM_SPACES.entries()) {
  for (const source of SOURCES) {
    for (const kind of ['weekly-review', 'decision-log', 'delivery-notes']) {
      writeDocument(space, index, source, kind);
    }
  }
}

console.log(
  `generated ${DEMO_TEAM_SPACES.length * SOURCES.length * 3} documents across ${DEMO_TEAM_SPACES.length} spaces`,
);
