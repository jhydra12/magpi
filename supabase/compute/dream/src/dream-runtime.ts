import { createClient } from '@supabase/supabase-js';

import { coreEnv, type EnvSource, openAiKey } from '../../../functions/_shared/env.ts';
import { createModelRunner } from '../../../functions/_shared/model_client.ts';
import { storageUploads } from '../../../functions/_shared/jobs/runtime.ts';
import type { JobDeps } from '../../../functions/_shared/jobs/types.ts';

/** Bounds database and model requests, including their response bodies. */
export function timedFetch(
  fetcher: typeof fetch,
  timeoutMs = 60_000,
  deadline?: AbortSignal,
): typeof fetch {
  return (input, init) => {
    const upstream = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (upstream) signals.push(upstream);
    if (deadline) signals.push(deadline);
    return fetcher(input, { ...init, signal: AbortSignal.any(signals) });
  };
}

/** A hard deadline also stops pending writes before the 15-minute abandonment sweep. */
export function dreamDepsFromEnv(source: EnvSource, budgetMs: number): JobDeps {
  const env = coreEnv(source);
  const fetcher = timedFetch(fetch, 60_000, AbortSignal.timeout(budgetMs + 120_000));
  const db = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  });
  const now = (): Date => new Date();
  return {
    db,
    http: { fetch: fetcher, now },
    models: createModelRunner({ db, apiKey: openAiKey(source), fetch: fetcher, now }),
    uploads: storageUploads(db),
    env: source,
    budgetMs,
  };
}

/** Keeps the configured budget below the abandonment threshold with time to save the result. */
export function dreamBudgetMs(value: string | undefined): number {
  const budget = Number(value ?? 300_000);
  if (!Number.isInteger(budget) || budget < 1_000 || budget > 600_000) {
    throw new Error('Dream budget must be between 1000 and 600000 milliseconds');
  }
  return budget;
}
