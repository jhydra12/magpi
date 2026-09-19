import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

const PAGE_SIZE = 1000;
const SPACE_BATCH_SIZE = 100;

/** Counts visible documents and distinct people in the requested spaces through RLS. */
export async function loadSpaceMetadata(
  client: SupabaseClient<Database>,
  spaceIds: readonly string[],
): Promise<{ documentCount: number; memberCount: number }> {
  const members = new Set<string>();
  let documentCount = 0;
  const ids = [...new Set(spaceIds)];
  for (let batch = 0; batch < ids.length; batch += SPACE_BATCH_SIZE) {
    const scope = ids.slice(batch, batch + SPACE_BATCH_SIZE);
    const documents = await client
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('space_id', scope);
    if (documents.error) throw new Error(documents.error.message);
    documentCount += documents.count ?? 0;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await client
        .from('space_members')
        .select('space_id, user_id')
        .in('space_id', scope)
        .order('space_id')
        .order('user_id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (result.error) throw new Error(result.error.message);
      for (const member of result.data ?? []) members.add(member.user_id);
      if ((result.data?.length ?? 0) < PAGE_SIZE) break;
    }
  }
  return { documentCount, memberCount: members.size };
}
