-- The functions the permission model rests on, and the posture of the schema around them.

begin;

create extension if not exists pgtap with schema extensions;

select plan(45);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- Carol is a plain member of Alice's org, so is_org_admin has a real negative case.
-- Joining an organization means leaving your own: org_members_user_id_idx is unique on the
-- user, so the membership the signup trigger made is moved rather than added to.
update public.org_members
set org_id = (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner'),
    role = 'member'
where user_id = 'c0000000-0000-4000-8000-000000000003';

-- Moving an organization leaves the org space of the old one behind, so enrol them in the new one
-- the way the signup trigger would have.
insert into public.space_members (space_id, user_id)
select s.id, m.user_id
from public.org_members m
join public.spaces s on s.org_id = m.org_id and s.kind = 'org'
on conflict (space_id, user_id) do nothing;

delete from public.space_members sm
using public.spaces s
where sm.space_id = s.id
  and s.kind = 'org'
  and not exists (
    select 1 from public.org_members m
    where m.user_id = sm.user_id and m.org_id = s.org_id
  );


insert into public.spaces (id, org_id, kind, name)
values
  ('50000000-0000-4000-8000-00000000000a',
   (select org_id from public.org_members
    where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner'),
   'team', 'Alice team'),
  ('50000000-0000-4000-8000-00000000000b',
   (select org_id from public.org_members where user_id = 'b0000000-0000-4000-8000-000000000002'),
   'team', 'Bob team');

insert into public.space_members (space_id, user_id, created_at)
values
  ('50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
   '2026-01-02 00:00:00+00'),
  ('50000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002',
   '2026-01-02 00:00:00+00');

select set_config(
  'recall.org_a',
  (select org_id::text from public.org_members
   where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner'),
  true
);

select set_config(
  'recall.org_b',
  (select org_id::text from public.org_members
   where user_id = 'b0000000-0000-4000-8000-000000000002'),
  true
);

-- The predicates ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.visible_space_ids()),
  3, 'visible_space_ids returns the personal space, the org space and the one team space'
);

select ok(
  '50000000-0000-4000-8000-00000000000a' in (select public.visible_space_ids()),
  'and it holds the team space the caller joined'
);

select ok(
  '50000000-0000-4000-8000-00000000000b' not in (select public.visible_space_ids()),
  'and not another organization''s team space'
);

select ok(
  public.is_org_member(current_setting('recall.org_a')::uuid),
  'is_org_member is true for the caller''s own org'
);

select ok(
  not public.is_org_member(current_setting('recall.org_b')::uuid),
  'and false for an org they have nothing to do with'
);

select ok(
  public.is_org_admin(current_setting('recall.org_a')::uuid),
  'is_org_admin is true for the owner of the org'
);

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select ok(
  not public.is_org_admin(current_setting('recall.org_a')::uuid),
  'and false for a plain member of the same org'
);

set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select ok(
  public.is_space_member('50000000-0000-4000-8000-00000000000a'),
  'is_space_member is true for a space the caller is in'
);

select ok(
  not public.is_space_member('50000000-0000-4000-8000-00000000000b'),
  'and false for one they are not'
);

-- Single-use exchanges -----------------------------------------------------------

reset role;

insert into public.providers (slug, display_name, kind, enabled)
values ('notion', 'Notion', 'api_key', true)
on conflict (slug) do nothing;

-- Fixed far-future and far-past expiries, so the clock comparison is decided by the fixture.
-- No space is chosen before the redirect any more, so neither row carries one.
insert into public.oauth_states (state, user_id, provider, code_verifier, expires_at, created_at)
values
  ('state-live', 'a0000000-0000-4000-8000-000000000001', 'notion', 'verifier-live',
   '2099-01-01 00:00:00+00', '2026-01-02 00:00:00+00'),
  ('state-stale', 'a0000000-0000-4000-8000-000000000001', 'notion', 'verifier-stale',
   '2020-01-01 00:00:00+00', '2019-12-31 00:00:00+00');

insert into public.pending_connections (ticket_hash, user_id, provider,
                                        access_token_enc, expires_at, created_at)
values ('ticket-live', 'a0000000-0000-4000-8000-000000000001', 'notion',
        '\xdeadbeef',
        '2099-01-01 00:00:00+00', '2026-01-02 00:00:00+00');

set local role service_role;

select is(
  (select code_verifier from public.consume_oauth_state('state-live')),
  'verifier-live', 'consume_oauth_state hands back the pending attempt once'
);

select is(
  (select count(*)::int from public.consume_oauth_state('state-live')),
  0, 'and a second callback with the same state gets nothing'
);

select is(
  (select count(*)::int from public.consume_oauth_state('state-stale')),
  0, 'an expired attempt is never handed back at all'
);

select is(
  (select user_id from public.consume_pending_connection('ticket-live')),
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'consume_pending_connection hands back the parked token once'
);

select is(
  (select count(*)::int from public.consume_pending_connection('ticket-live')),
  0, 'and a second attempt with the same ticket gets nothing'
);

-- Rate limiting. The counter is in a table because a per-instance counter multiplies the limit.

select ok(
  (select allowed from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  'the first call inside the limit is allowed'
);

select ok(
  (select allowed from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  'and so is the second'
);

select ok(
  (select allowed from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  'the call that reaches the limit is still allowed'
);

select is(
  (select remaining from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  0, 'and by then there is nothing remaining'
);

select ok(
  not (select allowed from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  'the call past the limit is refused'
);

-- No client role holds these ---------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select * from public.consume_oauth_state('state-live') $$,
  '42501', null, 'a client role cannot redeem an oauth state'
);

select throws_ok(
  $$ select * from public.consume_pending_connection('ticket-live') $$,
  '42501', null, 'a client role cannot redeem a parked connection'
);

select throws_ok(
  $$ select * from public.consume_rate_limit('recall-test-bucket', 3, 3600) $$,
  '42501', null, 'a client role cannot spend somebody else''s rate limit'
);

-- Pruning deletes every in-flight OAuth attempt, so no client may call it.
select throws_ok(
  $$ select public.prune_oauth_states() $$,
  '42501', null, 'a client role cannot prune the oauth state table'
);

reset role;

-- Posture -----------------------------------------------------------------------------

select ok(
  (select bool_and(c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'row level security is enabled on every table in public'
);

-- Without force, the table owner is exempt from its own policies.
select ok(
  (select bool_and(c.relforcerowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'and forced on every table in public'
);

select ok(
  not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'search'),
  'public.search is security invoker, so a search runs as whoever asked'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('visible_space_ids', 'is_org_member', 'is_org_admin', 'is_space_member')
     and p.prosecdef),
  4, 'the four visibility predicates are security definer'
);

-- A definer function needs search_path pinned to the empty string, not to `public`.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) as cfg
                         where cfg = 'search_path=""'))),
  0, 'every security definer function in public pins an empty search_path'
);

-- Nothing in public is executable by PUBLIC. A null proacl is that default, so it counts.
select is_empty(
  $$ select p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')'
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE')) $$,
  'no function in public is executable by PUBLIC'
);

-- The allowlist of what a client may call, so a new function is caught when it becomes callable.
select set_eq(
  $$ select p.proname::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            or has_function_privilege('anon', p.oid, 'EXECUTE')) $$,
  array['visible_space_ids', 'is_org_member', 'is_org_admin', 'is_space_member',
        'routes_into_visible_space', 'text_search_query',
        'search', 'plan_document_limit', 'plan_monthly_query_limit',
        'check_ingest_allowed', 'check_query_allowed', 'record_retrieval',
        'org_member_emails', 'org_usage_totals', 'create_team_space'],
  'the only functions a client role may execute are the fifteen meant to be callable'
);

-- Grants. A policy is only reachable if the role also holds the table privilege.

select ok(
  (select bool_and(has_table_privilege('authenticated', t, 'select'))
   from unnest(array['public.documents', 'public.chunks', 'public.spaces',
                     'public.space_members', 'public.entities', 'public.entity_mentions',
                     'public.dream_runs', 'public.dream_links', 'public.ingest_jobs',
                     'public.conversations', 'public.messages', 'public.organizations',
                     'public.org_members', 'public.providers', 'public.usage_events',
                     'public.model_calls']) as t),
  'authenticated holds select on the tables whose policies decide what it reads'
);

select ok(
  not (select bool_or(has_table_privilege('anon', c.oid, 'select'))
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'),
  'anon holds select on nothing in public'
);

-- Migration drift. The expected set is written by hand from 95_grants.sql and compared both ways.
select set_eq(
  $$ select grantee::text || ' ' || table_name::text || ' ' || privilege_type::text
     from information_schema.role_table_grants
     where table_schema = 'public'
       -- Every privilege for the two client roles, not the four PostgREST uses: TRUNCATE ignores
       -- RLS and the stock roles arrive holding it, so filtering it out hid the thing worth
       -- catching. service_role is the trusted backend role and is expected to hold everything, so
       -- it is compared on the four that say what the product does with it.
       and (
         grantee in ('anon', 'authenticated')
         or (grantee = 'service_role'
             and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
       ) $$,
  $$
    -- anon is absent on purpose. A row for it on the left is itself the failure.
    select 'authenticated ' || t || ' ' || p
    from (values
      ('organizations', 'SELECT'),
      ('org_members', 'SELECT'), ('org_members', 'DELETE'),
      ('org_invites', 'SELECT'), ('org_invites', 'INSERT'), ('org_invites', 'DELETE'),
      -- No UPDATE. spaces is granted by column list, to keep org_id and kind out.
      ('spaces', 'SELECT'), ('spaces', 'INSERT'), ('spaces', 'DELETE'),
      ('space_members', 'SELECT'), ('space_members', 'INSERT'), ('space_members', 'DELETE'),
      ('providers', 'SELECT'),
      -- No SELECT. connections is granted by column list, to keep the token columns out.
      ('connections', 'DELETE'),
      ('documents', 'SELECT'), ('documents', 'DELETE'),
      ('chunks', 'SELECT'),
      ('entities', 'SELECT'),
      ('entity_mentions', 'SELECT'),
      ('dream_runs', 'SELECT'),
      -- No UPDATE. dream_links is granted by column list; the policy tests only the space.
      ('dream_links', 'SELECT'),
      ('ingest_jobs', 'SELECT'),
      ('conversations', 'SELECT'), ('conversations', 'INSERT'),
      ('conversations', 'UPDATE'), ('conversations', 'DELETE'),
      -- UPDATE is a column grant, so it is absent here on purpose.
      ('conversation_folders', 'SELECT'), ('conversation_folders', 'INSERT'),
      ('conversation_folders', 'DELETE'),
      ('messages', 'SELECT'), ('messages', 'INSERT'),
      ('usage_events', 'SELECT'),
      ('model_calls', 'SELECT')
    ) as g(t, p)
    union all
    -- service_role holds all four everywhere, so tables are crossed with privileges.
    select 'service_role ' || t || ' ' || p
    from (values
      ('organizations'), ('org_members'), ('org_invites'), ('spaces'),
      ('space_members'), ('providers'), ('connections'), ('documents'),
      ('chunks'), ('entities'), ('entity_mentions'), ('dream_runs'),
      ('dream_links'), ('ingest_jobs'), ('conversations'), ('conversation_folders'),
      ('messages'),
      ('usage_events'), ('model_calls'),
      -- Granted in their own schema files, and reachable by no other role.
      ('oauth_states'), ('pending_connections'), ('rate_limits'), ('stripe_events')
    ) as s(t)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as pr(p)
  $$,
  'the applied table privileges are exactly the ones the schema files declare'
);

-- The same comparison for function execute privileges, reading proacl as stored.
select set_eq(
  $$ select r.role_name || ' ' || p.proname::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     cross join lateral (
       select case when a.grantee = 0 then 'PUBLIC'
                   else pg_get_userbyid(a.grantee)::text end
     ) as r(role_name)
     where n.nspname = 'public'
       and a.privilege_type = 'EXECUTE'
       and r.role_name in ('PUBLIC', 'anon', 'authenticated') $$,
  $$
    -- anon and PUBLIC are absent on purpose. A row for either is itself the failure.
    select 'authenticated ' || f
    from (values
      ('visible_space_ids'), ('routes_into_visible_space'), ('text_search_query'),
      ('is_org_member'), ('is_org_admin'), ('is_space_member'),
      ('search'), ('plan_document_limit'), ('plan_monthly_query_limit'),
      ('check_ingest_allowed'), ('check_query_allowed'), ('record_retrieval'),
      ('org_member_emails'), ('org_usage_totals'), ('create_team_space')
    ) as c(f)
  $$,
  'the applied function execute privileges are exactly the ones 80_functions.sql declares'
);

-- connections is granted by column list, so the provider token columns are unreadable.
select ok(
  not has_table_privilege('authenticated', 'public.connections', 'select'),
  'a client holds no table-wide select on connections, only named columns'
);

select ok(
  has_column_privilege('authenticated', 'public.connections', 'status', 'select'),
  'a client can read the status of a connection'
);

-- The one column that turns a readable row into a usable credential.
select ok(
  not has_column_privilege('authenticated', 'public.connections', 'access_token_enc', 'select'),
  'but never the provider token stored on it'
);

-- spaces is granted by column list, so a member can rename a space but not move it.
select ok(
  not has_table_privilege('authenticated', 'public.spaces', 'update'),
  'a member holds no table-wide update on spaces, only named columns'
);

select ok(
  has_column_privilege('authenticated', 'public.spaces', 'name', 'update')
    and has_column_privilege('authenticated', 'public.spaces', 'dreaming_enabled', 'update'),
  'a member can rename a space and turn dreaming off'
);

select ok(
  not has_table_privilege('authenticated', 'public.dream_links', 'update')
    and has_column_privilege('authenticated', 'public.dream_links', 'confirmed_at', 'update')
    and has_column_privilege('authenticated', 'public.dream_links', 'dismissed_at', 'update'),
  'a member can confirm or dismiss a candidate link'
);

-- A member must not repoint a link at a document they cannot see.
select ok(
  not has_column_privilege('authenticated', 'public.dream_links', 'document_b', 'update')
    and not has_column_privilege('authenticated', 'public.dream_links', 'rationale', 'update'),
  'but never move it to another document or rewrite what it says'
);

-- The two columns that decide which organization owns the rows and who reaches them.
select ok(
  not has_column_privilege('authenticated', 'public.spaces', 'org_id', 'update')
    and not has_column_privilege('authenticated', 'public.spaces', 'kind', 'update'),
  'but never move it between organizations or change what kind of space it is'
);

-- Compute drains ingestion and dreams; the remaining schedules create work.
select is(
  (select count(*)::int from cron.job
   where jobname in ('ingest-worker', 'sync-worker', 'dream-worker')),
  1, 'only the sync worker remains scheduled'
);

select is(
  (select count(*)::int from cron.job where jobname = 'ingest-worker'),
  0,
  'Compute owns ingestion polling'
);

-- cron.job.command is readable from the catalog, so secrets stay in Vault.
select is(
  (select count(*)::int from cron.job where command like '%eyJ%' or command like '%secret%'),
  0, 'no schedule carries a credential in its command'
);

select * from finish();

rollback;
