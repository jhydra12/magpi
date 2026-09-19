-- Pause new Dream claims while demo reset waits for active work.
create or replace function public.dream_execution_mode()
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from cron.job where jobname = 'dream-edge-worker' and active
  ) then 'edge' when exists (
    select 1 from cron.job where jobname = 'dream-edge-worker' and not active
  ) then 'paused' else 'compute' end;
$$;

create or replace function public.set_dream_execution_mode(p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_mode not in ('edge', 'compute', 'paused') or p_mode is null then
    raise exception 'execution mode must be edge, compute, or paused';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dream-execution', 0));
  if p_mode = 'edge' then
    perform cron.schedule('dream-edge-worker', '10 seconds',
      'select public.wake_edge_dream_worker()');
    perform cron.alter_job(jobid, active := true) from cron.job
    where jobname = 'dream-edge-worker';
    perform cron.schedule('ingest-worker', '* * * * *',
      $job$select public.invoke_worker('ingest-worker', 8)$job$);
    perform public.wake_edge_dream_worker();
  elsif p_mode = 'paused' then
    perform cron.schedule('dream-edge-worker', '10 seconds',
      'select public.wake_edge_dream_worker()');
    perform cron.alter_job(jobid, active := false) from cron.job
    where jobname = 'dream-edge-worker';
    perform cron.unschedule(jobid) from cron.job where jobname = 'ingest-worker';
  else
    perform cron.unschedule(jobid) from cron.job
    where jobname in ('dream-edge-worker', 'ingest-worker');
  end if;
end;
$$;

create or replace function public.claim_ingest_jobs(p_limit integer, p_org_id uuid default null)
returns setof public.ingest_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('dream-execution', 0));
  if public.dream_execution_mode() = 'paused' then return; end if;
  return query
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
end;
$$;
