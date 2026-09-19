import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The two properties pgTAP cannot reach, both concurrency.
 *
 * A pgTAP file is one rolled-back transaction on one connection, so it can
 * never observe two callers racing. These need real concurrent clients.
 */

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SB_SERVICE_ROLE_KEY ?? '';
const RUN_ID = process.env.TEST_RUN_ID ?? Math.random().toString(36).slice(2, 8);

function serviceClient(): SupabaseClient {
  return createClient(API_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe('claiming ingest jobs', () => {
  const db = serviceClient();
  let userId = '';
  let orgId = '';
  let spaceId = '';

  beforeAll(async () => {
    const { data, error } = await db.auth.admin.createUser({
      email: `claim-${RUN_ID}@magpi.test`,
      password: 'magpi-integration-password-1',
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    userId = data.user.id;

    const { data: space } = await db
      .from('spaces')
      .select('id, org_id')
      .eq('owner_user_id', userId)
      .eq('kind', 'personal')
      .single();

    spaceId = space!.id;
    orgId = space!.org_id;
  });

  afterAll(async () => {
    if (!userId) return;
    // The signup trigger's organization is not reached by the user cascade.
    const { data: memberships } = await db
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId);
    await db.auth.admin.deleteUser(userId);
    for (const membership of memberships ?? []) {
      const { count } = await db
        .from('org_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('org_id', membership.org_id);
      if ((count ?? 0) === 0) await db.from('organizations').delete().eq('id', membership.org_id);
    }
  });

  it('hands the same job to exactly one worker when several claim at once', async () => {
    const documents = await db
      .from('documents')
      .insert(
        Array.from({ length: 12 }, (_, index) => ({
          org_id: orgId,
          space_id: spaceId,
          title: `Claim race ${index}`,
          origin: 'upload' as const,
        })),
      )
      .select('id');

    expect(documents.error).toBeNull();

    const jobs = await db
      .from('ingest_jobs')
      .insert(
        (documents.data ?? []).map((document) => ({
          org_id: orgId,
          space_id: spaceId,
          document_id: document.id,
          stage: 'extract' as const,
        })),
      )
      .select('id');

    expect(jobs.error).toBeNull();
    const queued = new Set((jobs.data ?? []).map((job) => job.id));
    expect(queued.size).toBe(12);

    const workers = await Promise.all(
      Array.from({ length: 4 }, () =>
        serviceClient().rpc('claim_ingest_jobs', { p_limit: 12, p_org_id: orgId }),
      ),
    );

    const claimed: string[] = [];
    for (const worker of workers) {
      expect(worker.error).toBeNull();
      for (const job of (worker.data ?? []) as { id: string }[]) claimed.push(job.id);
    }

    expect(claimed.every((id) => queued.has(id))).toBe(true);
    const ours = claimed;
    expect(ours).toHaveLength(new Set(ours).size);
    expect(new Set(ours).size).toBe(12);

    // Asserted here rather than in a second `it`, which read the rows this one
    // created and so could not be run on its own.
    const { data: after } = await db
      .from('ingest_jobs')
      .select('status, claimed_at, attempts')
      .eq('space_id', spaceId);

    expect(after?.length).toBe(12);
    for (const job of after ?? []) {
      expect(job.status).toBe('running');
      expect(job.claimed_at).not.toBeNull();
      expect(job.attempts).toBe(1);
    }
  });
});

describe('the rate limit counter', () => {
  it('does not multiply across concurrent callers', async () => {
    const bucket = `integration:${RUN_ID}:${Math.random().toString(36).slice(2)}`;

    // Twenty callers on twenty clients against a limit of five. A counter held
    // in function memory would let every cold start have its own five.
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        serviceClient().rpc('consume_rate_limit', {
          p_bucket: bucket,
          p_limit: 5,
          p_window_s: 60,
        }),
      ),
    );

    const allowed = results.filter((result) => {
      const row = (result.data as { allowed: boolean }[] | null)?.[0];
      return row?.allowed === true;
    });

    expect(allowed).toHaveLength(5);
  });
});
