import 'server-only';

import type { SessionContext } from '@/lib/supabase/context';

import type { DreamActivitySnapshot } from './activity';

const COLUMNS =
  'id, space_id, kind, status, created_at, started_at, finished_at, input_document_count, output_document_id, error';

/** Read the latest finished Dream per visible space, including scheduled and older runs. */
export async function loadLastDreamTimes(
  context: SessionContext,
  spaceIds: readonly string[],
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    spaceIds.map(async (spaceId) => {
      const { data, error } = await context.supabase
        .from('dream_runs')
        .select('finished_at')
        .eq('org_id', context.orgId)
        .eq('space_id', spaceId)
        .in('status', ['succeeded', 'failed', 'timeout'])
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error('Could not read the last Dream time.');
      return [spaceId, data?.finished_at ?? null] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** All reads use the caller's session and RLS; explicit batches never expand to other runs. */
export async function loadDreamActivity(
  context: SessionContext,
  runIds?: readonly string[],
): Promise<DreamActivitySnapshot> {
  const query = () =>
    context.supabase.from('dream_runs').select(COLUMNS).eq('org_id', context.orgId);
  const observedAt = new Date().toISOString();
  if (runIds) {
    const { data, error } = await query()
      .in('id', [...runIds])
      .order('created_at')
      .limit(100);
    if (error) throw new Error('Could not read Dream activity.');
    return { runs: data, observedAt };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [active, recent] = await Promise.all([
    query()
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(100),
    query().gte('created_at', since).order('created_at', { ascending: false }).limit(100),
  ]);
  if (active.error || recent.error) throw new Error('Could not read Dream activity.');
  // Include completed companion tasks for scheduled Dreams and runs started by teammates.
  const runs = [...new Map([...active.data, ...recent.data].map((run) => [run.id, run])).values()];
  return { runs: runs.slice(0, 100), observedAt };
}
