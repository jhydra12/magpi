import { assert, assertEquals } from '@std/assert';

import {
  digestFrom,
  kindOf,
  properNames,
  rationalesFrom,
  sentencesOf,
  summariesFrom,
} from './rehearsal_text.ts';

const NOTES = [
  'Sam Lindqvist changed status from Todo to In Progress on the fold rig.',
  'Ben Achilov shipped the release checklist and Sam Lindqvist approved it.',
  'The compositor grows by 340MB and the leak is still unresolved.',
  'Build B11 went to Suwon. Build B11 came back with a fracture.',
].join('\n\n');

Deno.test('a name is only read where the capital was a choice', () => {
  const names = properNames(NOTES, 50);
  assert(names.includes('Sam Lindqvist'), 'a repeated person should be found');
  // "The" and "Build" open their sentences, so their capitals say nothing.
  assert(!names.some((name) => name.startsWith('The ')), `sentence opener kept: ${names}`);
  assert(!names.includes('Todo'), 'a one-off capital mid-list is not a name');
});

Deno.test('a name never runs across a line break', () => {
  const names = properNames('ASTM D1003\n  Haze rating\n\nASTM D1003 again mid sentence.', 50);
  assert(names.every((name) => !name.includes('\n')), `name spans lines: ${names}`);
});

Deno.test('two ordinary capitalised words are a person, a part number is not', () => {
  assertEquals(kindOf('Jane Okonkwo', 'Jane Okonkwo reviewed it.'), 'person');
  assertEquals(kindOf('Fold S1', 'The Fold S1 launch slipped a week.'), 'project');
  assertEquals(kindOf('Meniscus Labs', 'Meniscus Labs is the account we renewed.'), 'customer');
});

Deno.test('a lifted sentence keeps its shape and loses its markup', () => {
  const lines = sentencesOf('- **Sam Lindqvist** changed the status of the rig today.');
  assertEquals(lines, ['Sam Lindqvist changed the status of the rig today.']);
  // A fragment that starts mid-clause is what gives a derived digest away.
  assertEquals(sentencesOf('and higher gloss makes a fold line much easier to find'), []);
});

Deno.test('a digest keeps the three sections the prompt asks for', () => {
  const digest = digestFrom(NOTES);
  for (const heading of ['## What changed', '## What was decided', '## What is unresolved']) {
    assert(digest.includes(heading), `missing ${heading}`);
  }
  assert(!digest.includes('**'), 'markup should not survive into the digest');
});

Deno.test('a summary is paired with its own entity across a blank line', () => {
  const prompt = [
    'Sam Lindqvist (person)\nSam Lindqvist owns the fold rig calibration this cycle.',
    'Ben Achilov (person)\n\nBen Achilov wrote the release checklist for the B11 build.',
  ].join('\n\n');
  const summaries = summariesFrom(prompt);
  assertEquals(summaries.length, 2);
  assertEquals(summaries[0].name, 'Sam Lindqvist');
  assert(summaries[1].summary.includes('release checklist'), summaries[1].summary);
});

Deno.test('a rationale answers the pair number it was given', () => {
  const answer = rationalesFrom(
    'CANDIDATE PAIRS\n0: Fold rig notes and Fold rig teardown\n1: A and B',
  );
  assertEquals(answer.map((row) => row.pair), [0, 1]);
  assert(answer[0].rationale.includes('fold'), answer[0].rationale);
  assert(answer.every((row) => row.rationale.length <= 400));
});
