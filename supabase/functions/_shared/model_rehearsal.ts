// A stand-in for the model provider, so the demo can be run repeatedly without buying tokens.
//
// Everything downstream of this file is the real thing: the queue, the workers, the vector search,
// the writes and the realtime updates a person watches. Only the provider call is replaced, and
// its answers are derived from the prompt's own text rather than canned, because the entities pass
// files a name only when the notes really say it.
//
// Switched on with SB_MODEL_REHEARSAL=1. Unset, nothing here runs.

import { ApiError } from './errors.ts';
import {
  type CompleteInput,
  type EmbedInput,
  type ModelRunner,
  type ModelRunnerDeps,
  record,
  type Usage,
} from './model_client.ts';
import { EMBEDDING_DIMENSIONS, MODELS } from './models.ts';
import {
  digestFrom,
  kindOf,
  properNames,
  rationalesFrom,
  summariesFrom,
  withoutChunkIds,
} from './rehearsal_text.ts';

/** The chunker's own basis, so a rehearsed model_calls row reports the volume really processed. */
const CHARS_PER_TOKEN = 4;

/** Names one discovery answer may carry, matching MAX_DISCOVERED in the entities pass. */
const MAX_NAMES = 100;

const estimate = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

/**
 * A rehearsed call still has to take about as long as a real one. A pass that returns instantly
 * finishes before the progress UI has drawn, which is the one way this would look faked.
 */
function pause(inputChars: number): Promise<void> {
  const ms = Math.min(2500, 350 + Math.round(inputChars / 40));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** pgvector arrives as "[1,2,3]" over PostgREST and as an array through some clients. */
function toVector(value: unknown): number[] | null {
  const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw) || raw.length !== EMBEDDING_DIMENSIONS) return null;
  return raw.map((entry) => (typeof entry === 'number' ? entry : 0));
}

/**
 * The embedding this exact text was given when it was ingested. Reusing it keeps the connections
 * pass honest: its neighbours are found by the same vectors the real run would have searched with,
 * so the pairs on screen are the pairs the corpus actually supports.
 */
async function storedVectors(
  deps: ModelRunnerDeps,
  texts: string[],
): Promise<Map<string, number[]>> {
  const { data, error } = await deps.db
    .from('chunks')
    .select('content, embedding')
    .in('content', texts)
    .returns<{ content: string; embedding: unknown }[]>();
  if (error) {
    console.error('rehearsal could not read stored embeddings', error.message);
    return new Map();
  }
  const found = new Map<string, number[]>();
  for (const row of data ?? []) {
    const vector = toVector(row.embedding);
    if (vector) found.set(row.content, vector);
  }
  return found;
}

/**
 * A deterministic unit vector, for text that was never ingested. Only the digest the run has just
 * written takes this path, and nothing searches against it during a run.
 */
function derivedVector(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!word) continue;
    let hash = 2166136261;
    for (let i = 0; i < word.length; i++) {
      hash = Math.imul(hash ^ word.charCodeAt(i), 16777619);
    }
    const slot = Math.abs(hash) % EMBEDDING_DIMENSIONS;
    vector[slot] += (hash & 1) === 0 ? 1 : -1;
  }
  const length = Math.hypot(...vector);
  return length === 0
    ? vector.fill(1 / Math.sqrt(EMBEDDING_DIMENSIONS))
    : vector.map((v) => v / length);
}

/** Which answer a prompt is asking for. The system prompt names the shape it wants back. */
function answerFor({ system, user, purpose }: CompleteInput): string {
  if (system.includes('"entities"')) {
    const text = withoutChunkIds(user);
    const entities = properNames(text, MAX_NAMES)
      .map((name) => ({ kind: kindOf(name, text), name }));
    return JSON.stringify({ entities });
  }
  if (system.includes('"summaries"')) return JSON.stringify({ summaries: summariesFrom(user) });
  if (system.includes('"rationales"')) return JSON.stringify({ rationales: rationalesFrom(user) });
  if (purpose === 'dream') return digestFrom(user);
  if (purpose === 'title') return withoutChunkIds(user).slice(0, 60).replace(/\s+\S*$/, '');
  if (purpose === 'condense') {
    return withoutChunkIds(user).split(/\n/).at(-1)?.trim() ?? user.trim();
  }
  // chat and anything added later: answer out of the context the prompt already carries.
  return digestFrom(user, 3);
}

export function createRehearsalRunner(deps: ModelRunnerDeps): ModelRunner {
  async function run<T>(
    orgId: string,
    purpose: string,
    model: string,
    usage: Usage,
    produce: () => Promise<T> | T,
  ): Promise<T> {
    const startedAt = deps.now().getTime();
    try {
      await pause(usage.inputTokens * CHARS_PER_TOKEN);
      const result = await produce();
      await record(deps, { orgId, purpose, model, usage, startedAt, succeeded: true });
      return result;
    } catch (err) {
      await record(deps, { orgId, purpose, model, usage, startedAt, succeeded: false });
      throw err;
    }
  }

  return {
    embed({ orgId, texts }: EmbedInput) {
      if (texts.length === 0) return Promise.resolve([]);
      const usage = {
        inputTokens: texts.reduce((sum, t) => sum + estimate(t), 0),
        outputTokens: 0,
      };
      return run(orgId, 'embedding', MODELS.embedding, usage, async () => {
        const stored = await storedVectors(deps, texts);
        return texts.map((text) => stored.get(text) ?? derivedVector(text));
      });
    },

    complete(input: CompleteInput) {
      const model = MODELS[input.purpose];
      const answer = answerFor(input);
      if (!answer) {
        throw new ApiError(502, 'model_error', 'the rehearsal model produced no content');
      }
      const usage = {
        inputTokens: estimate(input.system) + estimate(input.user),
        outputTokens: estimate(answer),
      };
      return run(input.orgId, input.purpose, model, usage, () => answer);
    },
  };
}
