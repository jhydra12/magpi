-- Apply after the Node Compute ingestion worker is healthy.
create or replace function public.schedule_workers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cron.unschedule('ingest-worker')
  where exists (select 1 from cron.job where jobname = 'ingest-worker');

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

select cron.unschedule('ingest-worker')
where exists (select 1 from cron.job where jobname = 'ingest-worker');
