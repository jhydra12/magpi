import { z } from 'zod';

import { startDream } from '@/lib/dreams/start';
import { getSessionContext } from '@/lib/supabase/context';

const inputSchema = z.object({
  spaceId: z.uuid(),
  kind: z.enum(['entities', 'digest', 'connections', 'all']),
});

/** Submit through ordinary HTTP so a pending Dream does not block router actions. */
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json(
      { status: 'error', message: 'Request origin is not allowed.' },
      { status: 403 },
    );
  }
  const context = await getSessionContext();
  if (!context)
    return Response.json(
      { status: 'error', message: 'Sign in to start dreaming.' },
      { status: 401 },
    );
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json(
      { status: 'error', message: 'Choose a space and kind of run.' },
      { status: 400 },
    );
  try {
    return Response.json(await startDream(context, input.data), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { status: 'error', message: 'Could not start dreaming.' },
      { status: 500 },
    );
  }
}
