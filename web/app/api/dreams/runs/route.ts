import { parseDreamRunIds } from '@/lib/dreams/activity';
import { loadDreamActivity } from '@/lib/dreams/activity-queries';
import { getSessionContext } from '@/lib/supabase/context';

const headers = { 'Cache-Control': 'private, no-store' };

/** Read only Dream runs visible to the signed-in caller. */
export async function GET(request: Request): Promise<Response> {
  const context = await getSessionContext();
  if (!context)
    return Response.json({ error: 'Sign in to view Dream runs.' }, { status: 401, headers });
  let runIds: readonly string[] | undefined;
  try {
    runIds = parseDreamRunIds(new URL(request.url).searchParams.get('runs') ?? undefined);
  } catch {
    return Response.json(
      { error: 'Choose between 1 and 100 valid run IDs.' },
      { status: 400, headers },
    );
  }
  try {
    return Response.json(await loadDreamActivity(context, runIds), { headers });
  } catch {
    return Response.json({ error: 'Could not read Dream activity.' }, { status: 500, headers });
  }
}
