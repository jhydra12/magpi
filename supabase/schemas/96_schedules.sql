-- Scheduling lives in the database: pg_cron holds the schedule and pg_net makes the call.

-- The base URL and key come from Vault at fire time, since cron.job.command is readable.
create or replace function public.invoke_worker(p_worker text, p_batch integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_key text;
begin
  select decrypted_secret into v_base
  from vault.decrypted_secrets where name = 'worker_base_url';

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'worker_service_key';

  -- A database nobody has configured ticks and does nothing.
  if v_base is null or v_key is null then
    return;
  end if;

  -- Two minutes, against a pg_net default of five seconds that timed out on every busy tick.
  perform net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/' || p_worker,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('batch', p_batch),
    timeout_milliseconds := 120000
  );
end;
$$;

-- Nobody but the scheduler: this function reads a service role key out of Vault.
revoke all on function public.invoke_worker(text, integer)
  from public, anon, authenticated, service_role;

/**
 * Queues tonight's dreams. dream-worker only drains what is already queued, so without this the
 * cron fired into an empty queue every night and nothing dreamed unless somebody pressed the
 * button on a space page.
 *
 * One run per space per kind. A space whose last run of that kind is still queued or running is
 * skipped, so running this twice in a night does not double the bill. Every pass returns early
 * when nothing arrived in its window, so a quiet space costs a row and no model call.
 */
create or replace function public.queue_nightly_dreams()
returns integer
language sql
security definer
set search_path = ''
as $$
  with queued as (
    insert into public.dream_runs (org_id, space_id, kind)
    select s.org_id, s.id, k.kind
    from public.spaces s
    cross join unnest(enum_range(null::public.dream_kind)) as k(kind)
    where s.dreaming_enabled
      and not exists (
        select 1 from public.dream_runs r
        where r.space_id = s.id
          and r.kind = k.kind
          and r.status in ('queued', 'running')
      )
    returning 1
  )
  select count(*)::integer from queued;
$$;

revoke all on function public.queue_nightly_dreams()
  from public, anon, authenticated, service_role;

-- The whole schedule in one function; cron.schedule upserts on the job name.
create or replace function public.schedule_workers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Every two minutes, which claim_ingest_jobs reasons its reclaim window from. A hundred at a
  -- time, eight at once: the batch used to be twenty-five because the jobs ran in sequence and
  -- that was all that fitted in the budget. A hundred now takes about three seconds.
  perform cron.schedule(
    'ingest-worker', '*/2 * * * *',
    $job$select public.invoke_worker('ingest-worker', 100)$job$
  );

  perform cron.schedule(
    'sync-worker', '0 * * * *',
    $job$select public.invoke_worker('sync-worker', 10)$job$
  );

  -- 01:55 UTC. The dream compute instance drains the queue as soon as the rows appear, so nothing
  -- schedules dream-worker any more. The Edge Function stays deployed as the manual path.
  perform cron.schedule(
    'queue-nightly-dreams', '55 1 * * *',
    $job$select public.queue_nightly_dreams()$job$
  );
end;
$$;

revoke all on function public.schedule_workers()
  from public, anon, authenticated, service_role;
