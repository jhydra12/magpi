import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55321';
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const SERVICE_KEY = process.env.SB_SERVICE_ROLE_KEY ?? '';

const RUN_ID = process.env.TEST_RUN_ID ?? Math.random().toString(36).slice(2, 8);
const PASSWORD = 'magpi-integration-password-1';

type Person = { email: string; userId: string; client: SupabaseClient };

function serviceClient() {
  return createClient(API_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createPerson(label: string): Promise<Person> {
  const email = `${label}-${RUN_ID}@magpi.test`;
  const service = serviceClient();

  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create ${email}: ${error.message}`);

  const client = createClient(API_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw new Error(`could not sign in ${email}: ${signInError.message}`);

  return { email, userId: data.user.id, client };
}

/**
 * Deletes a person and the organization they were the last member of. Deleting
 * an auth user cascades their personal space and their memberships and leaves
 * the organization standing, which accumulates one orphan per run.
 */
async function removePerson(userId: string) {
  const service = serviceClient();
  const { data: memberships } = await service
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId);

  await service.auth.admin.deleteUser(userId);

  for (const membership of memberships ?? []) {
    const { count } = await service
      .from('org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', membership.org_id);
    if ((count ?? 0) === 0) {
      await service.from('organizations').delete().eq('id', membership.org_id);
    }
  }
}

describe('a signed-in person, over real HTTP', () => {
  let alice: Person;
  let bob: Person;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([createPerson('alice'), createPerson('bob')]);
  });

  afterAll(async () => {
    // The organization the signup trigger built is not reached by the user
    // cascade, so a suite that only deletes users leaves one behind per run.
    for (const person of [alice, bob]) await removePerson(person.userId);
  });

  it('gets a personal space and an org space from the signup trigger', async () => {
    const { data, error } = await alice.client.from('spaces').select('kind, name');

    expect(error).toBeNull();
    expect(data?.map((row) => row.kind).sort()).toEqual(['org', 'personal']);
  });

  it('sees only its own spaces, and gets no error for the ones it cannot see', async () => {
    const { data: aliceSpaces } = await alice.client.from('spaces').select('id');
    const { data: bobSpaces, error } = await bob.client.from('spaces').select('id');

    const aliceIds = new Set((aliceSpaces ?? []).map((row) => row.id));
    expect(error).toBeNull();
    expect((bobSpaces ?? []).some((row) => aliceIds.has(row.id))).toBe(false);
  });

  it('reads the provider registry, and the five it can actually connect', async () => {
    const { data, error } = await alice.client
      .from('providers')
      .select('slug, enabled')
      .order('slug');

    expect(error).toBeNull();
    // The registry also carries the providers marked coming soon, so this pins the ones a
    // person can connect today rather than the length of the table.
    expect(data?.filter((row) => row.enabled).map((row) => row.slug)).toEqual([
      'github',
      'google_drive',
      'linear',
      'notion',
      'slack',
    ]);
    expect(data?.length).toBeGreaterThanOrEqual(5);
  });

  it('cannot ask for a provider token, even on a connection it could otherwise read', async () => {
    const { error } = await alice.client.from('connections').select('access_token_enc');

    // PostgREST refuses the column, so the failure is a 403 and not an empty
    // result. An empty result would mean the column was readable and the row
    // was hidden, which is a weaker guarantee.
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('cannot select every column of connections either', async () => {
    const { error } = await alice.client.from('connections').select('*');

    // The code, not merely an error. `not.toBeNull()` passes when the table has
    // been renamed away, and a test that survives the deletion of the thing it
    // guards is not guarding it.
    expect(error?.code).toBe('42501');
  });

  it('cannot write a chunk, because chunks are service-role only', async () => {
    const { data: spaces } = await alice.client.from('spaces').select('id, org_id').limit(1);
    const space = spaces?.[0];
    expect(space).toBeDefined();
    if (!space) return;

    const { error } = await alice.client.from('chunks').insert({
      org_id: space.org_id,
      space_id: space.id,
      document_id: '00000000-0000-0000-0000-000000000000',
      ordinal: 0,
      content: 'should never land',
    });

    expect(error?.code).toBe('42501');
  });

  it("cannot spend somebody else's rate limit budget", async () => {
    const { error } = await alice.client.rpc('consume_rate_limit', {
      p_bucket: 'chat:someone-else',
      p_limit: 1,
      p_window_s: 60,
    });

    // 42501 is the refusal. PGRST202 is PostgREST saying the function is not in
    // its schema cache, which is what this asserted for as long as it asserted
    // only that something went wrong: deleting consume_rate_limit outright kept
    // the test green.
    expect(error?.code).toBe('42501');
  });
});
