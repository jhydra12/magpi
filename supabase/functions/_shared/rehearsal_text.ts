// Derives a model's answer from the text the prompt carries, for the rehearsal runner.
//
// Nothing here invents content. Names come out of the notes, digest lines are sentences the
// corpus really contains, and a rationale is built from the two titles it was handed. That is
// what keeps a rehearsed run looking like the real one: the entities pass only files a name the
// text actually says, so an invented answer would leave the graph empty.

/** Words that open a sentence often enough that a capital letter says nothing about them. */
const SENTENCE_OPENERS = new Set([
  'the',
  'this',
  'that',
  'these',
  'those',
  'a',
  'an',
  'we',
  'i',
  'it',
  'they',
  'he',
  'she',
  'you',
  'if',
  'when',
  'after',
  'before',
  'once',
  'our',
  'their',
  'his',
  'her',
  'its',
  'and',
  'but',
  'or',
  'so',
  'then',
  'there',
  'here',
  'what',
  'why',
  'how',
  'who',
  'all',
  'any',
  'each',
  'no',
  'not',
  'for',
  'from',
  'with',
  'without',
  'into',
  'over',
  'under',
  'next',
  'last',
  'first',
  'now',
  'today',
  'yesterday',
  'tomorrow',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'note',
  'notes',
  'update',
  'summary',
  're',
  // Words that only ever lead a name by accident: "In Progress", "Build B11", "Unit B7".
  'in',
  'on',
  'at',
  'to',
  'by',
  'as',
  'is',
  'be',
  'via',
  'per',
  'up',
  'off',
  'out',
  'was',
  'were',
  'are',
  'will',
  'can',
  'do',
  'did',
  'has',
  'have',
  'had',
  'see',
  'add',
  'added',
  'use',
  'used',
  'make',
  'made',
  'set',
  'get',
  'got',
  'run',
  'new',
  'old',
  'one',
  'two',
  'both',
  'more',
  'most',
  'some',
  'many',
  'much',
  'less',
  'only',
  'also',
  'just',
  'still',
  'open',
  'closed',
  'done',
  'todo',
  'ship',
  'shipped',
  'build',
  'unit',
  'units',
  'fold',
  'rename',
  'total',
  'status',
  'all',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
]);

// Single spaces between the words, never \s: a newline is a new line, not the rest of a name.
const NAME_PATTERN = /\b[A-Z][\w'’-]*(?:[ ](?:[A-Z][\w'’-]*|of|the|and|for|de|van)){0,3}/g;

/** Long enough to be a name, short enough not to be a sentence. */
const MAX_NAME_CHARS = 60;

/** Leading list, quote and heading marks, so a bullet reads as the sentence it holds. */
const LINE_MARK = /^[-*>#|\s·]+/;

/**
 * Whole sentences only. A fragment that starts mid-clause ("and higher gloss makes...") is what
 * gives a derived digest away, so a line has to begin the way a sentence begins to be kept.
 */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) =>
      line
        .replace(LINE_MARK, '')
        // Emphasis marks read as typos once a line is lifted out of its document.
        .replace(/[*_`]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => line.length >= 25 && line.length <= 400 && /^[A-Z0-9"'[(]/.test(line));
}

/** Strips the "[chunk-id]" line chunkPrompt puts in front of each chunk. */
export function withoutChunkIds(user: string): string {
  return user.replace(/^\[[0-9a-fA-F-]{8,}\]\s*$/gm, '').trim();
}

function isNoise(name: string): boolean {
  const words = name.split(/\s+/);
  const first = words[0].toLowerCase();
  // A name led by a common word is a sentence that happened to begin with one.
  if (words[0].length < 2 || SENTENCE_OPENERS.has(first)) return true;
  if (words.length === 1) return name.length < 3 || /^\d/.test(name);
  return words.every((word) => SENTENCE_OPENERS.has(word.toLowerCase()));
}

/**
 * Whether a capital letter at this offset means anything. At the start of a sentence, a heading,
 * a bullet or a table cell it does not, which is where "Flat", "Case" and "One" come from.
 */
function isSentenceStart(text: string, at: number): boolean {
  const before = text.slice(0, at).replace(/[\s"'([]+$/, '');
  return before.length === 0 || /[.!?:;·|>\-*#\n]$/.test(before);
}

/**
 * Proper names the text repeats, commonest first. A single capitalised word counts only when it
 * appears mid-sentence twice, because that is the only position where the capital is a choice.
 */
export function properNames(text: string, most: number): string[] {
  const counts = new Map<string, { name: string; hits: number; mid: number }>();
  for (const match of text.matchAll(NAME_PATTERN)) {
    const name = match[0].replace(/ (of|the|and|for|de|van)$/i, '').trim();
    if (name.length > MAX_NAME_CHARS || isNoise(name)) continue;
    const key = name.toLowerCase();
    const entry = counts.get(key) ?? { name, hits: 0, mid: 0 };
    entry.hits += 1;
    if (!isSentenceStart(text, match.index ?? 0)) entry.mid += 1;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .filter((entry) => (entry.name.includes(' ') ? entry.mid >= 1 : entry.mid >= 2))
    .sort((a, b) => b.mid - a.mid || b.hits - a.hits || a.name.localeCompare(b.name))
    .slice(0, most)
    .map((entry) => entry.name);
}

const KIND_HINTS: { kind: string; words: RegExp }[] = [
  { kind: 'customer', words: /\b(customer|account|client|renewal|contract|churn|onboard)\w*/i },
  { kind: 'decision', words: /\b(decided|decision|agreed|approved|chose|signed off|settled)\w*/i },
  {
    kind: 'project',
    words: /\b(project|launch|migration|rollout|release|epic|initiative|v\d)\w*/i,
  },
];

const COMPANY_WORDS = /\b(inc|ltd|llc|corp|gmbh|labs|systems|group|holdings|technologies)\b/i;

/**
 * The kind the sentences around a name suggest. A two-word human name is tested first: it would
 * otherwise be filed as a customer purely for sitting next to the word "account".
 */
export function kindOf(name: string, text: string): string {
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name) && !COMPANY_WORDS.test(name)) return 'person';
  const near = sentencesOf(text).filter((line) => line.includes(name)).join(' ');
  for (const hint of KIND_HINTS) if (hint.words.test(near)) return hint.kind;
  return 'project';
}

const SECTIONS: { heading: string; words: RegExp }[] = [
  {
    heading: 'What changed',
    words: /\b(shipped|added|changed|updated|moved|migrated|released|fixed|removed|rewrote)\w*/i,
  },
  {
    heading: 'What was decided',
    words: /\b(decided|agreed|approved|chose|settled|will|going to|plan to|signed off)\w*/i,
  },
  {
    heading: 'What is unresolved',
    words: /\b(open|unresolved|blocked|pending|waiting|risk|question|unclear|still|tbd)\w*/i,
  },
];

/** The three-section markdown the digest prompt asks for, written from the chunks it was given. */
export function digestFrom(user: string, perSection = 4): string {
  const lines = sentencesOf(withoutChunkIds(user));
  const used = new Set<string>();
  const parts = SECTIONS.map(({ heading, words }) => {
    const picked = lines.filter((line) => !used.has(line) && words.test(line)).slice(0, perSection);
    for (const line of picked) used.add(line);
    return { heading, picked };
  });

  // A section with nothing of its own still gets a line, so the document keeps its shape.
  const spare = lines.filter((line) => !used.has(line));
  for (const part of parts) {
    while (part.picked.length === 0 && spare.length > 0) part.picked.push(spare.shift() as string);
  }
  return parts
    .map(({ heading, picked }) =>
      `## ${heading}\n\n${
        picked.length > 0 ? picked.map((line) => `- ${line}`).join('\n') : '- Nothing this cycle.'
      }`
    )
    .join('\n\n');
}

const ENRICH_HEAD = /^(.+?) \((person|project|customer|decision)\)$/gm;

/**
 * Reads the "Name (kind)" headers the enrich prompt is built from, taking each one's context as
 * everything up to the next header. Splitting on blank lines instead would lose any entity whose
 * quoted chunk contains one, which most of them do.
 */
export function summariesFrom(user: string): { name: string; summary: string }[] {
  const heads = [...user.matchAll(ENRICH_HEAD)];
  return heads.map((head, index) => {
    const name = head[1].trim();
    const from = (head.index ?? 0) + head[0].length;
    const context = user.slice(from, heads[index + 1]?.index ?? user.length);
    // A table row reads as noise once it is out of its table, so prose is preferred.
    const lines = sentencesOf(context);
    const prose = lines.filter((line) => !line.includes('|') && line.length >= 40);
    const line = prose.find((sentence) => sentence.includes(name)) ?? prose[0] ??
      lines.find((sentence) => sentence.includes(name)) ?? lines[0];
    const summary = !line
      ? `${name} recurs across this space's recent notes.`
      : line.startsWith(name)
      ? line
      : `${name}: ${line}`;
    return { name, summary: summary.slice(0, 600) };
  });
}

const TITLE_NOISE = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
]);

/** Reads "0: A and B" lines and says what the two titles have in common. */
export function rationalesFrom(user: string): { pair: number; rationale: string }[] {
  return [...user.matchAll(/^(\d+):\s*(.+?)\s+and\s+(.+)$/gm)].map((match) => {
    const [left, right] = [match[2], match[3]];
    const words = (title: string): Set<string> =>
      new Set(
        title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !TITLE_NOISE.has(w)),
      );
    const shared = [...words(left)].filter((word) => words(right).has(word));
    const rationale = shared.length > 0
      ? `Both documents cover ${
        shared.slice(0, 3).join(', ')
      }, so one picks up where the other leaves off.`
      : `"${left}" and "${right}" were written about the same stretch of work and refer to each other's details.`;
    return { pair: Number(match[1]), rationale: rationale.slice(0, 400) };
  });
}
