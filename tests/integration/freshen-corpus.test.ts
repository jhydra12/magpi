import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';

import type { Database } from '../../web/lib/database.types';

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const serviceKey = process.env.SB_SERVICE_ROLE_KEY ?? '';

const STALE = '2026-09-01T00:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A digest reads only the last day of chunks, and re-ingestion keeps a chunk whose content has
 * not changed, so the reset has to move the fixture's timestamps itself.
 */
it('moves seeded source timestamps into the window a digest reads', async () => {
  if (!['localhost', '127.0.0.1'].includes(new URL(apiUrl).hostname)) {
    throw new Error('Freshen fixtures require local Supabase.');
  }
  const db = createClient<Database>(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await db.auth.admin.createUser({
    email: `freshen-${randomUUID()}@magpi.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  try {
    const membership = await db.from('org_members').select('org_id').eq('user_id', userId).single();
    if (membership.error) throw membership.error;
    const orgId = membership.data.org_id;
    const space = await db.from('spaces').select('id').eq('owner_user_id', userId).single();
    if (space.error) throw space.error;
    const spaceId = space.data.id;

    const documents = await db
      .from('documents')
      .insert([
        { org_id: orgId, space_id: spaceId, origin: 'upload', title: 'Source', updated_at: STALE },
        { org_id: orgId, space_id: spaceId, origin: 'dream', title: 'Digest', updated_at: STALE },
      ])
      .select('id, origin');
    if (documents.error) throw documents.error;
    const source = documents.data.find((document) => document.origin === 'upload')!;
    const dreamOutput = documents.data.find((document) => document.origin === 'dream')!;

    const chunk = await db
      .from('chunks')
      .insert({
        org_id: orgId,
        space_id: spaceId,
        document_id: source.id,
        ordinal: 0,
        content: 'A line the digest should be able to read.',
        created_at: STALE,
      })
      .select('id')
      .single();
    if (chunk.error) throw chunk.error;

    const freshened = await db.rpc('freshen_demo_corpus', { p_org_id: orgId });
    expect(freshened.error).toBeNull();

    const after = await db.from('chunks').select('created_at').eq('id', chunk.data.id).single();
    if (after.error) throw after.error;
    const age = Date.now() - Date.parse(after.data.created_at);
    expect(age).toBeLessThan(DAY_MS);

    const sourceAfter = await db
      .from('documents')
      .select('updated_at')
      .eq('id', source.id)
      .single();
    if (sourceAfter.error) throw sourceAfter.error;
    expect(Date.now() - Date.parse(sourceAfter.data.updated_at)).toBeLessThan(DAY_MS);

    // Dream output is not source material, so a reset must not make it look freshly imported.
    const outputAfter = await db
      .from('documents')
      .select('updated_at')
      .eq('id', dreamOutput.id)
      .single();
    if (outputAfter.error) throw outputAfter.error;
    expect(Date.parse(outputAfter.data.updated_at)).toBe(Date.parse(STALE));
  } finally {
    await db.auth.admin.deleteUser(userId);
  }
});
