import { z } from 'zod';

import { loadEntities } from '@/lib/dreams/queries';
import { getSessionContext } from '@/lib/supabase/context';

const headers = { 'Cache-Control': 'private, no-store' };

/** Return fresh entity evidence through the caller's RLS session. */
export async function GET(request: Request): Promise<Response> {
  const context = await getSessionContext();
  if (!context)
    return Response.json({ error: 'Sign in to view entities.' }, { status: 401, headers });
  const space = new URL(request.url).searchParams.get('space') ?? undefined;
  if (space && !z.uuid().safeParse(space).success)
    return Response.json({ error: 'Invalid space.' }, { status: 400, headers });
  try {
    const query = context.supabase
      .from('dream_runs')
      .select('id')
      .eq('org_id', context.orgId)
      .in('status', ['queued', 'running'])
      .limit(1);
    const activity = await (space ? query.eq('space_id', space) : query);
    if (activity.error) throw new Error(activity.error.message);
    // Workers persist entities before completing. Read activity first so an idle
    // response includes their final writes before the browser stops polling.
    const entities = await loadEntities(context, space);
    return Response.json(
      { groups: entities.groups, active: activity.data.length > 0 },
      { headers },
    );
  } catch {
    return Response.json({ error: 'Could not refresh entities.' }, { status: 500, headers });
  }
}
