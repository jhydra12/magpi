import { z } from 'zod';

import { errorState, type ActionState } from '@/lib/actions/state';

import type { DreamRunOutcome } from './edge';
import type { DreamKind } from './status';

const responseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('error'), message: z.string() }),
  z.object({
    status: z.literal('success'),
    data: z.object({
      dreamRunId: z.uuid(),
      dreamRunIds: z.array(z.uuid()).min(1),
      status: z.enum(['queued', 'succeeded', 'failed', 'timeout']),
      outputDocumentId: z.uuid().nullable(),
    }),
  }),
]);

/** Queue real Dreams without putting submission in the navigation action queue. */
export async function submitDream(
  spaceId: string,
  kind: DreamKind | 'all',
): Promise<ActionState<DreamRunOutcome>> {
  try {
    const response = await fetch('/api/dreams/start', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, kind }),
    });
    return responseSchema.parse(await response.json());
  } catch {
    return errorState('Could not start dreaming. Try again.');
  }
}
