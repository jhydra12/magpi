import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';

import { claimQueuedRow } from '../../supabase/functions/_shared/jobs/claim';
import type { Database } from '../../web/lib/database.types';

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const serviceKey = process.env.SB_SERVICE_ROLE_KEY ?? '';
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

it('lets one worker claim a Dream while readers see only their own runs', async () => {
  if (!['localhost', '127.0.0.1'].includes(new URL(apiUrl).hostname)) {
    throw new Error('Dream integration fixtures require local Supabase.');
  }
  const db = createClient<Database>(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `dream-queue-${randomUUID()}@magpi.test`;
  const password = randomUUID();
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  const member = createClient<Database>(apiUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonymous = createClient<Database>(apiUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const membership = await db.from('org_members').select('org_id').eq('user_id', userId).single();
  if (membership.error) {
    await db.auth.admin.deleteUser(userId);
    throw membership.error;
  }
  const orgId = membership.data.org_id;
  try {
    const signIn = await member.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    const space = await db.from('spaces').select('id').eq('owner_user_id', userId).single();
    if (space.error) throw space.error;
    const inserted = await db
      .from('dream_runs')
      .insert({
        org_id: orgId,
        space_id: space.data.id,
        kind: 'digest',
        status: 'queued',
        triggered_by: userId,
      })
      .select('id')
      .single();
    if (inserted.error) throw inserted.error;
    const runId = inserted.data.id;

    const readers = await member.from('dream_runs').select('id,status').eq('id', runId);
    expect(readers.error).toBeNull();
    expect(readers.data).toEqual([{ id: runId, status: 'queued' }]);

    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        claimQueuedRow(db, 'dream_runs', runId, {
          status: 'running',
          started_at: new Date().toISOString(),
        }),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    const current = await member
      .from('dream_runs')
      .select('status,started_at')
      .eq('id', runId)
      .single();
    expect(current.error).toBeNull();
    expect(current.data?.status).toBe('running');
    expect(current.data?.started_at).not.toBeNull();

    const hidden = await anonymous.from('dream_runs').select('id').eq('id', runId);
    expect(hidden.data ?? []).toEqual([]);

    const finished = await db
      .from('dream_runs')
      .update({
        status: 'succeeded',
        finished_at: new Date().toISOString(),
        input_document_count: 2,
      })
      .eq('id', runId);
    expect(finished.error).toBeNull();
    expect(await claimQueuedRow(db, 'dream_runs', runId, { status: 'running' })).toBe(false);
  } finally {
    await member.auth.signOut();
    const removedOrg = await db.from('organizations').delete().eq('id', orgId);
    const removedUser = await db.auth.admin.deleteUser(userId);
    if (removedOrg.error) throw removedOrg.error;
    if (removedUser.error) throw removedUser.error;
  }
});
