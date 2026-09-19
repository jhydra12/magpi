import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import type { SessionContext } from '@/lib/supabase/context';

export type StubResponse = {
  readonly data?: unknown;
  readonly error?: { readonly message: string };
};

/** One link in a chain: the method name, then the arguments it was given. */
export type RecordedCall = readonly [string, ...unknown[]];

export type RecordingContext = {
  readonly context: SessionContext;
  /** Every call made against one table or edge function, in the order they happened. */
  readonly callsFor: (source: string) => readonly RecordedCall[];
};

const CHAIN_METHODS = [
  'range',
  'not',
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'in',
  'gte',
  'order',
  'limit',
  'maybeSingle',
  'single',
];

const READER: Omit<SessionContext, 'supabase'> = {
  userId: '77777777-7777-4777-8777-777777777777',
  email: 'reader@example.com',
  orgId: '99999999-9999-4999-8999-999999999999',
  role: 'member',
};

/** A postgrest and edge function client that records calls and replays queued responses. */
export function recordingContext({
  responses,
  session,
}: {
  readonly responses: Readonly<Record<string, readonly StubResponse[]>>;
  readonly session?: Partial<Omit<SessionContext, 'supabase'>>;
}): RecordingContext {
  const calls = new Map<string, RecordedCall[]>();
  const queues = new Map<string, StubResponse[]>(
    Object.entries(responses).map(([source, list]) => [source, [...list]]),
  );

  // Claimed when the query is created, not when it is awaited, so concurrent queries stay in order.
  function claim(
    source: string,
    call: RecordedCall,
  ): { recorded: RecordedCall[]; settled: { data: unknown; error: unknown } } {
    const recorded = calls.get(source) ?? [];
    recorded.push(call);
    calls.set(source, recorded);

    const next = queues.get(source)?.shift();
    if (!next) throw new Error(`The test queued no response for ${source}`);
    return { recorded, settled: { data: next.data ?? null, error: next.error ?? null } };
  }

  function builderFor(table: string): unknown {
    const { recorded, settled } = claim(table, ['from', table]);

    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(settled).then(resolve),
    };

    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        recorded.push([method, ...args]);
        return builder;
      };
    }

    return builder;
  }

  const supabase = {
    from: (table: string) => builderFor(table),
    functions: {
      invoke: (name: string, options: { body: Record<string, unknown> }) =>
        Promise.resolve(claim(name, ['invoke', name, options.body]).settled),
    },
  } as unknown as SupabaseClient<Database>;

  return {
    context: { ...READER, ...session, supabase },
    callsFor: (source) => calls.get(source) ?? [],
  };
}
