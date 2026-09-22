import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';

import type { Database } from '../../web/lib/database.types';

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const serviceKey = process.env.SB_SERVICE_ROLE_KEY ?? '';

const STALE = new Date(Date.now() - 20 * 60 * 1000).toISOString();

/**
 * The reset pauses execution before it waits for workers, and pausing unschedules the very
 * cron jobs whose claim functions retire abandoned rows. Without a sweep the reset waits on
 * a worker that can never come back.
 */
it('retires worker rows a dead worker left behind, even while execution is paused', async () => {
  if (!['localhost', '127.0.0.1'].includes(new URL(apiUrl).hostname)) {
    throw new Error('Worker sweep fixtures require local Supabase.');
  }
  const db = createClient<Database>(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await db.auth.admin.createUser({
    email: `stale-sweep-${randomUUID()}@magpi.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  const previousMode = await db.rpc('dream_execution_mode');
  if (previousMode.error) throw previousMode.error;
  try {
    const membership = await db.from('org_members').select('org_id').eq('user_id', userId).single();
    if (membership.error) throw membership.error;
    const orgId = membership.data.org_id;
    const space = await db.from('spaces').select('id').eq('owner_user_id', userId).single();
    if (space.error) throw space.error;
    const spaceId = space.data.id;

    const runs = await db
      .from('dream_runs')
      .insert([
        {
          org_id: orgId,
          space_id: spaceId,
          kind: 'digest',
          status: 'running',
          started_at: STALE,
          triggered_by: userId,
        },
        {
          org_id: orgId,
          space_id: spaceId,
          kind: 'entities',
          status: 'running',
          started_at: new Date().toISOString(),
          triggered_by: userId,
        },
      ])
      .select('id, kind');
    if (runs.error) throw runs.error;
    const abandonedRun = runs.data.find((run) => run.kind === 'digest')!.id;
    const liveRun = runs.data.find((run) => run.kind === 'entities')!.id;

    const document = await db
      .from('documents')
      .insert({ org_id: orgId, space_id: spaceId, origin: 'upload', title: 'Sweep fixture' })
      .select('id')
      .single();
    if (document.error) throw document.error;
    const job = await db
      .from('ingest_jobs')
      .insert({
        org_id: orgId,
        space_id: spaceId,
        document_id: document.data.id,
        status: 'running',
        claimed_at: STALE,
      })
      .select('id')
      .single();
    if (job.error) throw job.error;

    const paused = await db.rpc('set_dream_execution_mode', { p_mode: 'paused' });
    if (paused.error) throw paused.error;

    const swept = await db.rpc('sweep_stale_worker_runs');
    expect(swept.error).toBeNull();

    const after = await db
      .from('dream_runs')
      .select('id, status, finished_at, error')
      .in('id', [abandonedRun, liveRun]);
    if (after.error) throw after.error;
    const retired = after.data.find((run) => run.id === abandonedRun)!;
    expect(retired.status).toBe('timeout');
    expect(retired.finished_at).not.toBeNull();
    expect(retired.error).toBe('the worker did not come back before the reset');
    expect(after.data.find((run) => run.id === liveRun)!.status).toBe('running');

    const sweptJob = await db.from('ingest_jobs').select('status').eq('id', job.data.id).single();
    if (sweptJob.error) throw sweptJob.error;
    expect(sweptJob.data.status).toBe('queued');
  } finally {
    await db.rpc('set_dream_execution_mode', { p_mode: previousMode.data as string });
    await db.auth.admin.deleteUser(userId);
  }
});
