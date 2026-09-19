-- The enabled Edge cron job is the durable execution-mode switch.
create or replace function public.dream_execution_mode()
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from cron.job where jobname = 'dream-edge-worker' and active
  ) then 'edge' else 'compute' end;
$$;
revoke all on function public.dream_execution_mode() from public, anon, authenticated;
grant execute on function public.dream_execution_mode() to service_role;

-- Start work immediately; the cron repeats this check if an invocation is lost.
-- Stale running rows also cause a wake so the worker can retire interrupted work.
create or replace function public.wake_edge_dream_worker()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.dream_execution_mode() <> 'edge' then return; end if;
  if exists (
    select 1 from public.dream_runs
    where status = 'running' and started_at >= now() - interval '15 minutes'
  ) then return; end if;
  if exists (select 1 from public.dream_runs where status in ('queued', 'running')) then
    perform public.invoke_worker('dream-worker', 1);
  end if;
end;
$$;
revoke all on function public.wake_edge_dream_worker() from public, anon, authenticated;
grant execute on function public.wake_edge_dream_worker() to service_role;

-- Mode changes share the short claim lock. Already-running work finishes normally.
create or replace function public.set_dream_execution_mode(p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_mode not in ('edge', 'compute') or p_mode is null then
    raise exception 'execution mode must be edge or compute';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dream-execution', 0));
  if p_mode = 'edge' then
    perform cron.schedule('dream-edge-worker', '10 seconds',
      'select public.wake_edge_dream_worker()');
    perform cron.schedule('ingest-worker', '* * * * *',
      $job$select public.invoke_worker('ingest-worker', 8)$job$);
    perform public.wake_edge_dream_worker();
  else
    perform cron.unschedule(jobid) from cron.job
    where jobname in ('dream-edge-worker', 'ingest-worker');
  end if;
end;
$$;
revoke all on function public.set_dream_execution_mode(text) from public, anon, authenticated;
grant execute on function public.set_dream_execution_mode(text) to service_role;

-- At most one active Dream globally in the Edge baseline, even when wakes overlap.
create or replace function public.claim_edge_dream_run(p_org_id uuid default null)
returns setof public.dream_runs language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('dream-execution', 0));
  if public.dream_execution_mode() <> 'edge' then return; end if;
  update public.dream_runs set status = 'timeout', finished_at = now(),
    error = 'the Edge execution was interrupted and did not finish'
  where status = 'running' and started_at < now() - interval '15 minutes';
  if exists (select 1 from public.dream_runs where status = 'running') then return; end if;
  return query
    update public.dream_runs r set status = 'running', started_at = now()
    where r.id = (
      select q.id from public.dream_runs q
      where q.status = 'queued' and (p_org_id is null or q.org_id = p_org_id)
      order by q.created_at, q.id limit 1 for update skip locked
    ) returning r.*;
end;
$$;
revoke all on function public.claim_edge_dream_run(uuid) from public, anon, authenticated;
grant execute on function public.claim_edge_dream_run(uuid) to service_role;

-- Compute uses the same tasks after the operator explicitly changes mode.
create or replace function public.claim_dream_runs(p_limit integer, p_org_id uuid default null)
returns setof public.dream_runs language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('dream-execution', 0));
  if public.dream_execution_mode() <> 'compute' then return; end if;
  return query
    update public.dream_runs r set status = 'running', started_at = now()
    where r.id in (
      select q.id from public.dream_runs q
      where q.status = 'queued' and (p_org_id is null or q.org_id = p_org_id)
      order by q.created_at, q.id limit greatest(least(p_limit, 100), 0)
      for update skip locked
    ) returning r.*;
end;
$$;
revoke all on function public.claim_dream_runs(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_dream_runs(integer, uuid) to service_role;

create or replace function public.notify_edge_dream_queue()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.wake_edge_dream_worker();
  return null;
end;
$$;
revoke all on function public.notify_edge_dream_queue() from public, anon, authenticated, service_role;

create trigger dream_queue_insert_wake after insert on public.dream_runs
for each statement execute function public.notify_edge_dream_queue();
create trigger dream_queue_completion_wake after update of status on public.dream_runs
for each row when (old.status = 'running' and new.status in ('succeeded', 'failed', 'timeout'))
execute function public.notify_edge_dream_queue();

create or replace function public.schedule_workers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cron.schedule(
    'sync-worker', '0 * * * *',
    $job$select public.invoke_worker('sync-worker', 10)$job$
  );

  -- Queue nightly work without changing the operator's execution mode.
  perform cron.schedule(
    'queue-nightly-dreams', '55 1 * * *',
    $job$select public.queue_nightly_dreams()$job$
  );
end;
$$;

revoke all on function public.schedule_workers()
  from public, anon, authenticated, service_role;

-- Set the baseline once; later scheduling and seed runs retain an intentional cutover.
select public.set_dream_execution_mode('edge');
