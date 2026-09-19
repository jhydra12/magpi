// Shared context and helpers for the dream passes, kept out of dream.ts to avoid an import cycle.

import { z } from 'zod';

import { ApiError } from '../errors.ts';
import type { CompletionPurpose } from '../models.ts';
import type { Budget } from './budget.ts';
import type { SpaceChunkRow, SpaceScopedDb } from './space_writer.ts';
import type { JobDeps } from './types.ts';

export const dreamRunsSchema = z.array(z.object({
  id: z.string(),
  org_id: z.string(),
  space_id: z.string(),
  kind: z.enum(['entities', 'digest', 'connections']),
}));

export interface DreamRunRecord {
  id: string;
  org_id: string;
  space_id: string;
  kind: 'entities' | 'digest' | 'connections';
}

/** What a finished pass produced, and what the run row records about it. */
export interface DreamOutcome {
  inputDocumentCount: number;
  outputDocumentId: string | null;
  produced: number;
}

/** Stages a run can die in. The web client parses dream_runs.error as "<stage>: <message>". */
export type DreamStage = 'collect' | 'extract' | 'synthesize' | 'write';

export interface DreamEvent {
  event: 'started' | 'stage' | 'completed' | 'failed' | 'timeout';
  run_id: string;
  kind: DreamRunRecord['kind'];
  stage: DreamStage;
  elapsed_ms: number;
  input_document_count: number;
  produced?: number;
  output_document_id?: string | null;
}

/** Reports only metadata; logging failures must not interrupt a job. */
export function observe(pass: Pass, event: DreamEvent['event'], outcome?: DreamOutcome): void {
  if (!pass.deps.observeDream) return;
  try {
    pass.deps.observeDream({
      event,
      run_id: pass.run.id,
      kind: pass.run.kind,
      stage: pass.stage,
      elapsed_ms: pass.budget.elapsedMs(),
      input_document_count: pass.inputDocumentCount,
      ...(outcome
        ? { produced: outcome.produced, output_document_id: outcome.outputDocumentId }
        : {}),
    });
  } catch {
    console.error('dream observer failed');
  }
}

/** Shared execution state for one Dream pass. */
export interface Pass {
  run: DreamRunRecord;
  deps: JobDeps;
  db: SpaceScopedDb;
  budget: Budget;
  /** Where the pass is now, so a failed run row can report where the work stopped. */
  stage: DreamStage;
  /** How many documents the pass had read when it stopped, including on a timeout. */
  inputDocumentCount: number;
}

/** Records what the pass has read, so a terminal row can report it. */
export function counted(pass: Pass, chunks: SpaceChunkRow[]): SpaceChunkRow[] {
  pass.inputDocumentCount = documentCount(chunks);
  return chunks;
}

/** Enter a stage: leave the trail, then check the clock. */
export function enter(pass: Pass, stage: DreamStage): void {
  pass.stage = stage;
  pass.budget.checkpoint(stage);
  observe(pass, 'stage');
}

/** How far back a run reads. One day covers everything since the nightly run before it. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** What the entities pass reads back over, since matching an old chunk again costs nothing. */
export const WEEK_MS = 7 * LOOKBACK_MS;

/** About one model call's worth of space content, which is what a digest is written from. */
export const MAX_INPUT_CHUNKS = 120;

export const NOTHING: DreamOutcome = {
  inputDocumentCount: 0,
  outputDocumentId: null,
  produced: 0,
};

export function sinceIso(deps: JobDeps, windowMs: number = LOOKBACK_MS): string {
  return new Date(deps.http.now().getTime() - windowMs).toISOString();
}

/** What one completion in a dream needs. `purpose` picks the model and bills the call. */
export interface Asked {
  system: string;
  user: string;
  maxOutputTokens: number;
  json?: boolean;
  purpose?: CompletionPurpose;
}

export function ask(pass: Pass, asked: Asked): Promise<string> {
  const { deps, run } = pass;
  return deps.models.complete({
    orgId: run.org_id,
    purpose: asked.purpose ?? 'dream',
    system: asked.system,
    user: asked.user,
    maxOutputTokens: asked.maxOutputTokens,
    json: asked.json ?? false,
  });
}

/** Parses a model answer at the boundary, turning an unreadable one into a 502. */
export function parsed<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  console.error('a dream answer could not be read', what, result.error.message);
  throw new ApiError(502, 'model_answer_unreadable', `the ${what} the model returned was unusable`);
}

/** Models wrap JSON in a fence however firmly the prompt asks them not to. */
export function readAnswer<T>(schema: z.ZodType<T>, answer: string, what: string): T {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(answer);
  const text = (fenced ? fenced[1] : answer).trim();
  try {
    return parsed(schema, JSON.parse(text), what);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      502,
      'model_answer_unreadable',
      `the ${what} the model returned was not JSON`,
    );
  }
}

export function documentCount(chunks: SpaceChunkRow[]): number {
  return new Set(chunks.map((chunk) => chunk.document_id)).size;
}

/** Chunks handed to the model with the ids it must cite them by. */
export function chunkPrompt(chunks: SpaceChunkRow[]): string {
  return chunks.map((chunk) => `[${chunk.id}]\n${chunk.content}`).join('\n\n');
}
