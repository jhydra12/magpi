// Builds the injected clients a job body takes. The only place the workers read the environment.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError, bearerToken } from '../errors.ts';
import { coreEnv, denoEnv, type EnvSource, modelRehearsalOverride, openAiKey } from '../env.ts';
import { liveHttp } from '../deps.ts';
import { serviceClient } from '../db.ts';
import { createModelRunner, type ModelRunner } from '../model_client.ts';
import { createRehearsalRunner } from '../model_rehearsal.ts';
import { timingSafeEqual } from '../crypto.ts';
import type { JobDeps, UploadStore } from './types.ts';

/** Objects are keyed `${space_id}/${document_id}/${filename}`. */
const UPLOAD_BUCKET = 'documents';

export function storageUploads(db: SupabaseClient): UploadStore {
  return {
    async read(storagePath) {
      const { data, error } = await db.storage.from(UPLOAD_BUCKET).download(storagePath);
      if (error || !data) {
        // The path is the caller's; the reason is not theirs to see.
        console.error('upload could not be read', storagePath, error?.message);
        throw new ApiError(404, 'upload_missing', 'that upload could not be read');
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

/** Reads the Admin > Demo toggle. An unreadable setting means the provider, never a silent stub. */
async function runnerFromSetting(
  db: SupabaseClient,
  fetch: typeof globalThis.fetch,
  now: () => Date,
  source: EnvSource,
): Promise<ModelRunner> {
  const { data, error } = await db.rpc('model_rehearsal_enabled');
  if (error) console.error('rehearsal setting could not be read', error.message);
  return data === true
    ? createRehearsalRunner({ db, fetch, now, apiKey: '' })
    : createModelRunner({ db, fetch, now, apiKey: openAiKey(source) });
}

/**
 * The model client every worker takes. SB_MODEL_REHEARSAL decides when it is set; otherwise the
 * stored toggle does, read once per worker and held for the rest of its work, so a flip mid-run
 * cannot leave one dream half rehearsed. Rehearsal never reads OPENAI_API_KEY, so a demo project
 * can run with no provider key at all.
 */
export function modelRunnerFromEnv(
  db: SupabaseClient,
  fetch: typeof globalThis.fetch,
  now: () => Date,
  source: EnvSource = denoEnv,
): ModelRunner {
  const forced = modelRehearsalOverride(source);
  if (forced === true) return createRehearsalRunner({ db, fetch, now, apiKey: '' });
  if (forced === false) return createModelRunner({ db, fetch, now, apiKey: openAiKey(source) });

  let resolved: Promise<ModelRunner> | null = null;
  const chosen = (): Promise<
    ModelRunner
  > => (resolved ??= runnerFromSetting(db, fetch, now, source));
  return {
    embed: (input) => chosen().then((runner) => runner.embed(input)),
    complete: (input) => chosen().then((runner) => runner.complete(input)),
  };
}

export function jobDepsFromEnv(source: EnvSource = denoEnv): JobDeps {
  const db = serviceClient(source);
  return {
    db,
    http: { fetch: liveHttp.fetch, now: () => new Date() },
    models: modelRunnerFromEnv(db, liveHttp.fetch, () => new Date(), source),
    uploads: storageUploads(db),
    env: source,
  };
}

/** Only a caller holding the service role key may start a worker. Compared in constant time. */
export function requireWorkerCaller(headers: Headers, source: EnvSource = denoEnv): void {
  const token = bearerToken(headers.get('authorization'), 'missing worker credential');
  if (!timingSafeEqual(token, coreEnv(source).serviceRoleKey)) {
    throw new ApiError(403, 'forbidden', 'this endpoint is not called directly');
  }
}
