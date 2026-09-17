-- Dreams drain on the Supabase Compute instance, which watches the queue all night. The cron that
-- called the dream-worker Edge Function through the 02:00 hour would race it for the same rows.

create or replace function public.schedule_workers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cron.schedule(
    'ingest-worker', '*/2 * * * *',
    $job$select public.invoke_worker('ingest-worker', 100)$job$
  );

  perform cron.schedule(
    'sync-worker', '0 * * * *',
    $job$select public.invoke_worker('sync-worker', 10)$job$
  );

  perform cron.schedule(
    'queue-nightly-dreams', '55 1 * * *',
    $job$select public.queue_nightly_dreams()$job$
  );
end;
$$;

revoke all on function public.schedule_workers()
  from public, anon, authenticated, service_role;

-- The job already on the schedule does not go away when the function stops creating it.
select cron.unschedule('dream-worker')
where exists (select 1 from cron.job where jobname = 'dream-worker');
