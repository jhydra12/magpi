SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.notify_edge_dream_queue()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform public.wake_edge_dream_worker();
  perform public.wake_compute_dream_worker();
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_dream_execution_mode (
  p_mode text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if p_mode not in ('edge', 'compute', 'paused') or p_mode is null then
    raise exception 'execution mode must be edge, compute, or paused';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dream-execution', 0));
  if p_mode = 'edge' then
    perform cron.unschedule(jobid) from cron.job where jobname = 'dream-compute-worker';
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
    perform cron.unschedule(jobid) from cron.job
    where jobname in ('ingest-worker', 'dream-compute-worker');
  else
    perform cron.unschedule(jobid) from cron.job
    where jobname in ('dream-edge-worker', 'ingest-worker');
    perform cron.schedule('dream-compute-worker', '10 seconds',
      'select public.wake_compute_dream_worker()');
    perform public.wake_compute_dream_worker();
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.wake_compute_dream_worker()
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_base text;
begin
  if public.dream_execution_mode() <> 'compute' then return; end if;
  if not exists (select 1 from public.dream_runs where status in ('queued', 'running')) then
    return;
  end if;
  select decrypted_secret into v_base
  from vault.decrypted_secrets where name = 'worker_base_url';
  if v_base is null then return; end if;

  -- No credential or task payload is needed by this read-only health endpoint.
  -- pg_net sends after commit, once the newly queued tasks are visible to Compute.
  perform net.http_get(
    url := rtrim(v_base, '/') || '/compute/v1/dream/',
    timeout_milliseconds := 5000
  );
exception when others then
  -- A failed wake must not roll back the queued work. The next cron tick retries.
  raise warning 'Compute Dream wake could not be submitted (SQLSTATE %)', sqlstate;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."wake_compute_dream_worker"() FROM PUBLIC, "anon", "authenticated", "service_role";

GRANT EXECUTE ON FUNCTION "public"."wake_compute_dream_worker"() TO "postgres";

-- cron.job rows are runtime state, not declarative DDL. Install the retry for
-- projects already on Compute without changing their chosen execution mode.
SELECT public.set_dream_execution_mode(public.dream_execution_mode());
