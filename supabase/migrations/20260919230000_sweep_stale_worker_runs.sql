-- The demo reset pauses execution and then waits for active workers to drain. Pausing
-- unschedules the cron jobs whose claim functions are the only thing that retires rows a
-- dead worker abandoned, so a run left at 'running' made that wait never end. Sweep here
-- instead, where pausing cannot switch the sweep off.
create or replace function public.sweep_stale_worker_runs()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('dream-execution', 0));
  -- Two minutes, because the longest worker budget is 45 seconds: anything older is gone,
  -- and no claim can start a new one while execution is paused.
  update public.dream_runs
  set status = 'timeout', finished_at = now(),
      error = 'the worker did not come back before the reset'
  where status = 'running'
    and coalesce(started_at, created_at) < now() - interval '2 minutes';
  update public.ingest_jobs
  set status = 'queued'
  where status = 'running'
    and coalesce(claimed_at, created_at) < now() - interval '2 minutes';
end;
$$;
revoke all on function public.sweep_stale_worker_runs() from public, anon, authenticated;
grant execute on function public.sweep_stale_worker_runs() to service_role;
