import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '../errors.ts';

// Shared protocol with the admin Reset dreams action. Running rows remain running
// until the worker has stopped all writes, including model-call accounting.
export const DREAM_CANCEL_REQUEST = 'cancel: reset requested';

export function dreamCancellation(db: SupabaseClient, runId: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let stopped = false;

  async function check(): Promise<void> {
    try {
      const { data, error } = await db.from('dream_runs').select('error')
        .eq('id', runId).abortSignal(AbortSignal.timeout(5000));
      if (error) {
        throw new ApiError(500, 'dream_status_unavailable', 'cancellation could not be checked');
      }
      if (data?.some((row) => row.error === DREAM_CANCEL_REQUEST)) {
        controller.abort(new ApiError(409, 'dream_cancelled', 'cancelled by Reset dreams'));
      }
    } catch (error) {
      controller.abort(error);
    }
    if (!stopped && !controller.signal.aborted) {
      timer = setTimeout(() => {
        pending = check();
      }, 500);
    }
  }

  return {
    signal: controller.signal,
    async start() {
      pending = check();
      await pending;
      controller.signal.throwIfAborted();
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await pending;
    },
  };
}
