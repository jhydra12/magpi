import 'server-only';

import type { SessionContext } from '@/lib/supabase/context';

import { readPages, readIdBatches } from './paging';

import type { DreamActivitySnapshot } from './activity';

const COLUMNS =
  'id, space_id, kind, status, created_at, started_at, finished_at, input_document_count, output_document_id, error';

/** Read the latest finished Dream per visible space, including scheduled and older runs. */
export async function loadLastDreamTimes(
  context: SessionContext,
  spaceIds: readonly string[],
): Promise<Record<string, string | null>> {
  const rows = await readIdBatches(spaceIds, async (ids) => {
    const { data, error } = await context.supabase
      .from('spaces')
      .select('id, dream_runs(finished_at)')
      .eq('org_id', context.orgId)
      .in('id', ids)
      .in('dream_runs.status', ['succeeded', 'failed', 'timeout'])
      .not('dream_runs.finished_at', 'is', null)
      .order('finished_at', { referencedTable: 'dream_runs', ascending: false })
      .limit(1, { referencedTable: 'dream_runs' });
    if (error) throw new Error('Could not read the last Dream times.');
    return data ?? [];
  });
  const times: Record<string, string | null> = Object.fromEntries(spaceIds.map((id) => [id, null]));
  for (const row of rows) times[row.id] = row.dream_runs[0]?.finished_at ?? null;
  return times;
}

/** The Entities header needs only the latest visible completion. */
export async function loadLatestDreamTime(
  context: SessionContext,
  spaceId?: string,
): Promise<string | null> {
  const query = context.supabase
    .from('dream_runs')
    .select('finished_at')
    .eq('org_id', context.orgId)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1);
  const { data, error } = await (spaceId ? query.eq('space_id', spaceId) : query).maybeSingle();
  if (error) throw new Error('Could not read the last Dream time.');
  return data?.finished_at ?? null;
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
    const runs = await readIdBatches(runIds, (ids) =>
      readPages((from, to) =>
        query().in('id', ids).order('created_at').order('id').range(from, to),
      ),
    );
    return { runs, observedAt };
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [active, recent] = await Promise.all([
    readPages((from, to) =>
      query().in('status', ['queued', 'running']).order('id').range(from, to),
    ),
    readPages((from, to) => query().gte('created_at', since).order('id').range(from, to)),
  ]);
  const runs = [...new Map([...active, ...recent].map((run) => [run.id, run])).values()];
  return { runs, observedAt };
}
