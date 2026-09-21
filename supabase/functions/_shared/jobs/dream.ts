// The dream job body: one synthesis pass over one space, through the space writer.

import { ApiError } from '../errors.ts';
import { DEFAULT_BUDGET_MS, StageTimeout, startBudget } from './budget.ts';
import { dreamConnections } from './dream_connections.ts';
import { dreamCancellation } from './dream_cancellation.ts';
import { dreamDigest } from './dream_digest.ts';
import { dreamEntities } from './dream_entities.ts';
import {
  type DreamOutcome,
  type DreamRunRecord,
  type DreamStage,
  NOTHING,
  observe,
  type Pass,
} from './dream_pass.ts';
import { spaceScoped } from './space_writer.ts';
import { type JobDeps, recordUsage } from './types.ts';

export type { DreamOutcome, DreamRunRecord };

export type DreamResult =
  | ({ kind: 'succeeded' } & DreamOutcome)
  | { kind: 'timeout'; stage: string }
  | { kind: 'failed'; detail: string };

function dispatch(pass: Pass): Promise<DreamOutcome> {
  switch (pass.run.kind) {
    case 'entities':
      return dreamEntities(pass);
    case 'digest':
      return dreamDigest(pass);
    case 'connections':
      return dreamConnections(pass);
    default: {
      const unhandled: never = pass.run.kind;
      throw new ApiError(500, 'internal', `unknown dream kind ${String(unhandled)}`);
    }
  }
}

async function updateRun(
  run: DreamRunRecord,
  deps: JobDeps,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await deps.db.from('dream_runs').update(fields).eq('id', run.id);
  if (error) {
    throw new ApiError(500, 'dream_status_unavailable', 'the dream run status could not be saved');
  }
}

function finish(
  pass: Pass,
  status: 'succeeded' | 'failed' | 'timeout',
  outcome: DreamOutcome,
  error: string | null,
): Promise<void> {
  return updateRun(pass.run, pass.deps, {
    status,
    finished_at: pass.deps.http.now().toISOString(),
    input_document_count: outcome.inputDocumentCount,
    output_document_id: outcome.outputDocumentId,
    error,
  });
}

/** What a person reads on the run row when a dream did not finish. */
function readableDetail(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'the dream run stopped on an unexpected error';
}

/** Prefixes the stage onto a terminal error; the client reads up to the first colon. */
function withStage(stage: DreamStage, message: string): string {
  return `${stage}: ${message}`;
}

/** What a run that stopped early got through, rather than the zero it finished with. */
function reached(pass: Pass): DreamOutcome {
  return { ...NOTHING, inputDocumentCount: pass.inputDocumentCount };
}

export async function runDreamJob(run: DreamRunRecord, deps: JobDeps): Promise<DreamResult> {
  const cancellation = dreamCancellation(deps.db, run.id);
  const models = deps.models;
  // Await the aborted call (and its accounting) before acknowledging cancellation.
  deps = {
    ...deps,
    models: {
      async complete(input) {
        cancellation.signal.throwIfAborted();
        const result = await models.complete({ ...input, signal: cancellation.signal });
        cancellation.signal.throwIfAborted();
        return result;
      },
      async embed(input) {
        cancellation.signal.throwIfAborted();
        const result = await models.embed({ ...input, signal: cancellation.signal });
        cancellation.signal.throwIfAborted();
        return result;
      },
    },
  };
  const budget = startBudget(deps.http, deps.budgetMs ?? DEFAULT_BUDGET_MS);
  const pass: Pass = {
    run,
    deps,
    db: spaceScoped(deps.db, { orgId: run.org_id, spaceId: run.space_id }),
    budget: {
      ...budget,
      checkpoint(stage) {
        cancellation.signal.throwIfAborted();
        budget.checkpoint(stage);
      },
    },
    stage: 'collect',
    inputDocumentCount: 0,
  };
  try {
    await updateRun(run, deps, { status: 'running', started_at: deps.http.now().toISOString() });
    await cancellation.start();
    observe(pass, 'started');
    const outcome = await dispatch(pass);
    cancellation.signal.throwIfAborted();
    await recordUsage(deps.db, [{ orgId: run.org_id, kind: 'dream_run', quantity: 1 }]);
    cancellation.signal.throwIfAborted();
    await finish(pass, 'succeeded', outcome, null);
    observe(pass, 'completed', outcome);
    return { kind: 'succeeded', ...outcome };
  } catch (err) {
    if (cancellation.signal.aborted) err = cancellation.signal.reason;
    if (err instanceof StageTimeout) {
      observe(pass, 'timeout');
      await finish(pass, 'timeout', reached(pass), withStage(pass.stage, err.message));
      return { kind: 'timeout', stage: err.stage };
    }
    const detail = readableDetail(err);
    observe(pass, 'failed');
    await finish(pass, 'failed', reached(pass), withStage(pass.stage, detail));
    return { kind: 'failed', detail };
  } finally {
    await cancellation.stop();
  }
}
