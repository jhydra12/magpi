-- The one visibility predicate. Every content policy calls it.
create or replace function public.visible_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select space_id from public.space_members where user_id = (select auth.uid())
$$;

-- Revoking from PUBLIC drops execute for every role, service_role included, so each grant matters.
revoke all on function public.visible_space_ids() from public, anon;
grant execute on function public.visible_space_ids() to authenticated, service_role;

-- True when a connection sends at least one unit into a space the caller is a member of. A
-- connection is not in a space any more, so this is what stands in for the old space_id check.
create or replace function public.routes_into_visible_space(p_scope_selection jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Every guard below is about a malformed column rather than a hostile one. jsonb_each_text
  -- raises on a non-object, and the uuid cast raises on anything that is not one, and either
  -- would turn one bad row into an error for every reader of the connections page except its
  -- owner, whose own policy branch short-circuits before this runs.
  select exists (
    select 1
    from jsonb_each_text(
      case
        when jsonb_typeof(p_scope_selection -> 'routes') = 'object'
        then p_scope_selection -> 'routes'
        else '{}'::jsonb
      end
    ) as route(unit, space)
    where route.space ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and route.space::uuid in (select public.visible_space_ids())
  )
$$;

revoke all on function public.routes_into_visible_space(jsonb) from public, anon;
grant execute on function public.routes_into_visible_space(jsonb) to authenticated, service_role;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = (select auth.uid())
  )
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  )
$$;

revoke all on function public.is_org_admin(uuid) from public, anon;
grant execute on function public.is_org_admin(uuid) to authenticated, service_role;

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = (select auth.uid())
  )
$$;

revoke all on function public.is_space_member(uuid) from public, anon;
grant execute on function public.is_space_member(uuid) to authenticated, service_role;

-- Creates a team space and enrols the caller, so the space is never invisible to its own author.
create or replace function public.create_team_space(
  p_org_id uuid,
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  insert into public.spaces (org_id, kind, name, description)
  values (p_org_id, 'team', p_name, nullif(btrim(coalesce(p_description, '')), ''))
  returning id into v_space_id;

  insert into public.space_members (space_id, user_id)
  values (v_space_id, (select auth.uid()));

  return v_space_id;
end;
$$;

revoke all on function public.create_team_space(uuid, text, text) from public, anon;
grant execute on function public.create_team_space(uuid, text, text) to authenticated, service_role;

/**
 * websearch_to_tsquery raises 'tsquery stack too small' once the text has enough operands. A
 * pasted table or a long question reaches that, and it took the whole search down with it rather
 * than the half that could not be built.
 *
 * Null means no lexical arm for this query. Nothing is lost: websearch_to_tsquery ANDs every term,
 * so at that size it matches almost nothing anyway, and the semantic arm answers on its own.
 */
create or replace function public.text_search_query(p_text text)
returns tsquery
language plpgsql
stable
parallel safe
set search_path = ''
as $$
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;
  return websearch_to_tsquery('english', p_text);
exception
  -- The stack overflow arrives as internal_error. Anything else is not ours to swallow.
  when sqlstate 'XX000' then
    return null;
end;
$$;

revoke all on function public.text_search_query(text) from public, anon;
grant execute on function public.text_search_query(text) to authenticated, service_role;

-- Hybrid retrieval: pgvector and full text search merged with RRF. security invoker, so RLS holds.
create or replace function public.search(
  query_embedding extensions.vector(1536),
  query_text text,
  space_filter uuid[] default null,
  match_count integer default 20
)
returns table (
  chunk_id uuid,
  document_id uuid,
  space_id uuid,
  content text,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with
    -- Over-fetch each arm, because RRF only reorders what it is given.
    candidate_depth as (select greatest(match_count * 4, 40) as n),
    semantic as (
      select
        c.id,
        c.document_id,
        c.space_id,
        c.content,
        row_number() over (order by c.embedding <=> query_embedding) as rank
      from public.chunks c, candidate_depth d
      where c.embedding is not null
        and (space_filter is null or c.space_id = any (space_filter))
      order by c.embedding <=> query_embedding
      limit (select n from candidate_depth)
    ),
    -- Built once. A query that cannot be built is null, and the lexical arm returns nothing.
    asked as (select public.text_search_query(query_text) as tsq),
    lexical as (
      select
        c.id,
        c.document_id,
        c.space_id,
        c.content,
        row_number() over (order by ts_rank_cd(c.tsv, a.tsq) desc) as rank
      from public.chunks c, asked a
      where a.tsq is not null
        and c.tsv @@ a.tsq
        and (space_filter is null or c.space_id = any (space_filter))
      order by ts_rank_cd(c.tsv, a.tsq) desc
      limit (select n from candidate_depth)
    ),
    fused as (
      select
        coalesce(s.id, l.id) as chunk_id,
        coalesce(s.document_id, l.document_id) as document_id,
        coalesce(s.space_id, l.space_id) as space_id,
        coalesce(s.content, l.content) as content,
        -- k = 60 is the constant from the original RRF paper, so no per-corpus tuning.
        (coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + l.rank), 0))::real as score
      from semantic s
      full outer join lexical l on l.id = s.id
    ),
    -- A dream digest summarises the same documents the query is about, so it scores well on
    -- both arms. A week of nightly digests can then fill a small budget with summaries and push
    -- out the source that holds the answer. Digests get at most a quarter of the budget.
    ranked as (
      select
        f.*,
        d.origin = 'dream' as is_dream,
        row_number() over (partition by d.origin = 'dream' order by f.score desc) as origin_rank
      from fused f
      join public.documents d on d.id = f.document_id
    )
  select chunk_id, document_id, space_id, content, score
  from ranked
  where not is_dream or origin_rank <= greatest(1, match_count / 4)
  order by score desc
  limit match_count;
$$;

-- Iterative scan for search(). The vector cast below must run before the ALTER is accepted.
do $$
begin
  perform '[1]'::extensions.vector;
end;
$$;

alter function public.search(extensions.vector, text, uuid[], integer)
  set hnsw.iterative_scan = relaxed_order;

revoke all on function public.search(extensions.vector, text, uuid[], integer) from public, anon;
grant execute on function public.search(extensions.vector, text, uuid[], integer)
  to authenticated, service_role;

-- Deletes and returns an unexpired state row, so two callbacks with one state cannot both win.
create or replace function public.consume_oauth_state(p_state text)
returns table (user_id uuid, provider text, code_verifier text, return_to text)
language sql
security definer
set search_path = ''
as $$
  delete from public.oauth_states
  where state = p_state and expires_at > clock_timestamp()
  returning user_id, provider, code_verifier, return_to;
$$;

revoke all on function public.consume_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_oauth_state(text) to service_role;

create or replace function public.prune_oauth_states()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.oauth_states where expires_at < clock_timestamp();
$$;

revoke all on function public.prune_oauth_states() from public, anon, authenticated;
grant execute on function public.prune_oauth_states() to service_role;

-- Deliberately does not filter on user id, so the caller can compare and audit a mismatch.
create or replace function public.consume_pending_connection(p_ticket_hash text)
returns table (
  user_id uuid,
  provider text,
  external_account_id text,
  access_token_enc bytea,
  refresh_token_enc bytea,
  scopes text[],
  token_expires_at timestamptz,
  return_to text
)
language sql
security definer
set search_path = ''
as $$
  delete from public.pending_connections
  where ticket_hash = p_ticket_hash and expires_at > clock_timestamp()
  returning user_id, provider, external_account_id, access_token_enc,
            refresh_token_enc, scopes, token_expires_at, return_to;
$$;

revoke all on function public.consume_pending_connection(text) from public, anon, authenticated;
grant execute on function public.consume_pending_connection(text) to service_role;

create or replace function public.prune_pending_connections()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.pending_connections where expires_at <= clock_timestamp();
$$;

revoke all on function public.prune_pending_connections() from public, anon, authenticated;
grant execute on function public.prune_pending_connections() to service_role;

-- One atomic upsert, so concurrent callers cannot both see count < limit and both proceed.
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_s integer
)
returns table (allowed boolean, remaining integer, retry_after_s integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_s) * p_window_s
  );

  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning public.rate_limits.count into v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    greatest(
      1,
      ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_s))
                              - clock_timestamp()))::integer
    );
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

create or replace function public.prune_rate_limits()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limits where window_start < clock_timestamp() - interval '1 day';
$$;

revoke all on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;

-- Claims queued ingest jobs. `for update skip locked` gives concurrent callers disjoint sets.
create or replace function public.claim_ingest_jobs(p_limit integer, p_org_id uuid default null)
returns setof public.ingest_jobs
language sql
security definer
set search_path = ''
as $$
  -- Requeue a job whose worker never came back, using claimed_at, without counting an attempt.
  with reclaimed as (
    update public.ingest_jobs
    set status = 'queued'
    where (p_org_id is null or org_id = p_org_id) and status = 'running'
      and claimed_at < now() - interval '15 minutes'
    returning id
  ),
  -- Fail what the claim is about to skip, so a poison job does not sit at 'queued' forever.
  retired as (
    update public.ingest_jobs
    set status = 'failed',
        error = 'gave up after 3 attempts'
    where (p_org_id is null or org_id = p_org_id) and status = 'queued' and attempts >= 3
    returning id
  )
  update public.ingest_jobs j
  set status = 'running',
      claimed_at = now(),
      attempts = j.attempts + 1
  where j.id in (
    select c.id
    from public.ingest_jobs c
    where (p_org_id is null or c.org_id = p_org_id) and c.status = 'queued'
      -- Three, because most ingest failures are deterministic and a fourth try pays to repeat one.
      and c.attempts < 3
    order by c.created_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning j.*;
$$;

revoke all on function public.claim_ingest_jobs(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_ingest_jobs(integer, uuid) to service_role;

-- Plan limits live in the database. An ingest job past an org's plan is refused here.
create or replace function public.plan_document_limit(p_plan public.org_plan)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'free' then 200
    when 'team' then 25000
    when 'enterprise' then 1000000
  end;
$$;

revoke all on function public.plan_document_limit(public.org_plan) from public, anon;
grant execute on function public.plan_document_limit(public.org_plan) to authenticated, service_role;

create or replace function public.plan_monthly_query_limit(p_plan public.org_plan)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'free' then 500
    when 'team' then 50000
    when 'enterprise' then 5000000
  end;
$$;

revoke all on function public.plan_monthly_query_limit(public.org_plan) from public, anon;
grant execute on function public.plan_monthly_query_limit(public.org_plan)
  to authenticated, service_role;

create or replace function public.check_ingest_allowed(p_org_id uuid)
returns table (allowed boolean, reason text, used bigint, plan_limit integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.org_plan;
  v_limit integer;
  v_used bigint;
begin
  select plan into v_plan from public.organizations where id = p_org_id;
  if v_plan is null then
    return query select false, 'organization not found'::text, 0::bigint, 0;
    return;
  end if;

  v_limit := public.plan_document_limit(v_plan);
  select count(*) into v_used from public.documents where org_id = p_org_id;

  if v_used >= v_limit then
    return query select false, format('document limit reached for %s plan', v_plan), v_used, v_limit;
  else
    return query select true, null::text, v_used, v_limit;
  end if;
end;
$$;

revoke all on function public.check_ingest_allowed(uuid) from public, anon;
grant execute on function public.check_ingest_allowed(uuid) to authenticated, service_role;

-- The same gate for questions, counted over the calendar month in UTC.
create or replace function public.check_query_allowed(p_org_id uuid)
returns table (allowed boolean, reason text, used bigint, plan_limit integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.org_plan;
  v_limit integer;
  v_used bigint;
begin
  select plan into v_plan from public.organizations where id = p_org_id;
  if v_plan is null then
    return query select false, 'organization not found'::text, 0::bigint, 0;
    return;
  end if;

  v_limit := public.plan_monthly_query_limit(v_plan);

  select coalesce(sum(quantity), 0) into v_used
  from public.usage_events
  where org_id = p_org_id
    and kind = 'query'
    and occurred_at >= date_trunc('month', now() at time zone 'utc');

  if v_used >= v_limit then
    return query select false, format('question limit reached for %s plan', v_plan), v_used, v_limit;
  else
    return query select true, null::text, v_used, v_limit;
  end if;
end;
$$;

revoke all on function public.check_query_allowed(uuid) from public, anon;
grant execute on function public.check_query_allowed(uuid) to authenticated, service_role;

-- Marks documents retrieved for the admin dead-content panel, once per search, not per chunk.
create or replace function public.record_retrieval(p_document_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.documents
  set last_retrieved_at = now(),
      retrieval_count = retrieval_count + 1
  where id = any(p_document_ids)
    and space_id in (select public.visible_space_ids());
$$;

revoke all on function public.record_retrieval(uuid[]) from public, anon;
grant execute on function public.record_retrieval(uuid[]) to authenticated, service_role;

-- Addresses for one organization's members, gated on is_org_admin inside the function itself.
create or replace function public.org_member_emails(p_org_id uuid)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text
  from public.org_members m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org_id
    and public.is_org_admin(p_org_id);
$$;

revoke all on function public.org_member_emails(uuid) from public, anon;
grant execute on function public.org_member_emails(uuid) to authenticated, service_role;

-- The three plan meters in one statement. security invoker, so usage_events_select_admin applies.
create or replace function public.org_usage_totals(p_org_id uuid, p_month_start timestamptz)
returns table (documents bigint, queries bigint, storage_bytes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(quantity) filter (where kind = 'document_ingested'), 0)::bigint,
    -- The only meter with a month window, because its limit is monthly.
    coalesce(sum(quantity) filter (where kind = 'query' and occurred_at >= p_month_start), 0)::bigint,
    coalesce(sum(quantity) filter (where kind = 'storage_bytes'), 0)::bigint
  from public.usage_events
  where org_id = p_org_id;
$$;

revoke all on function public.org_usage_totals(uuid, timestamptz) from public, anon;
grant execute on function public.org_usage_totals(uuid, timestamptz) to authenticated, service_role;

-- How often each entity has been mentioned, so the dream only enriches what keeps coming up.
-- The dream worker is the only caller, so no client role holds execute on it.
create or replace function public.entity_mention_counts(
  p_space_id uuid,
  p_entity_ids uuid[]
)
returns table (entity_id uuid, mentions bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.entity_id, count(*)
  from public.entity_mentions m
  where m.space_id = p_space_id
    and m.entity_id = any(p_entity_ids)
  group by m.entity_id;
$$;

revoke all on function public.entity_mention_counts(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.entity_mention_counts(uuid, uuid[]) to service_role;

-- Every new user gets an organization and a personal space, so there is always somewhere to write.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_slug text;
  v_label text;
begin
  v_label := coalesce(nullif(split_part(new.email, '@', 1), ''), 'workspace');
  v_slug := regexp_replace(lower(v_label), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if char_length(v_slug) < 2 then
    v_slug := 'workspace';
  end if;
  v_slug := left(v_slug, 40) || '-' || left(replace(new.id::text, '-', ''), 8);

  insert into public.organizations (name, slug)
  values (v_label || '''s workspace', v_slug)
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role) values (v_org_id, new.id, 'owner');

  insert into public.spaces (org_id, kind, name, owner_user_id)
  values (v_org_id, 'personal', 'Personal', new.id);

  insert into public.spaces (org_id, kind, name)
  values (v_org_id, 'org', 'Everyone');

  insert into public.space_members (space_id, user_id)
  select id, new.id from public.spaces where org_id = v_org_id;

  return new;
end;
$$;

-- A trigger function runs as the table owner, so no role needs execute for the trigger to fire.
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Joining an org gets you the org space. Leaving it takes the org space away.
create or replace function public.sync_org_space_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.space_members (space_id, user_id)
    select s.id, new.user_id
    from public.spaces s
    where s.org_id = new.org_id and s.kind = 'org'
    on conflict do nothing;
    return new;
  end if;

  delete from public.space_members sm
  using public.spaces s
  where sm.space_id = s.id and s.org_id = old.org_id and sm.user_id = old.user_id;
  return old;
end;
$$;

revoke all on function public.sync_org_space_membership() from public, anon, authenticated;

create or replace trigger org_members_sync_org_space
  after insert or delete on public.org_members
  for each row execute function public.sync_org_space_membership();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

create or replace trigger conversation_folders_touch_updated_at
  before update on public.conversation_folders
  for each row execute function public.touch_updated_at();

create or replace trigger connections_touch_updated_at
  before update on public.connections
  for each row execute function public.touch_updated_at();

create or replace trigger documents_touch_updated_at
  before update on public.documents
  for each row execute function public.touch_updated_at();

create or replace trigger ingest_jobs_touch_updated_at
  before update on public.ingest_jobs
  for each row execute function public.touch_updated_at();

create or replace trigger conversations_touch_updated_at
  before update on public.conversations
  for each row execute function public.touch_updated_at();
