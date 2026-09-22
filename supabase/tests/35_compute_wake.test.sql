begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- pg_net sends only after commit. All requests below roll back with this test.
update public.dream_runs set status = 'failed' where status in ('queued', 'running');
delete from vault.secrets where name = 'worker_base_url';
select vault.create_secret('https://compute-wake.test/', 'worker_base_url');
insert into auth.users(id, email, instance_id, aud, role) values
('a5000000-0000-4000-8000-000000000001', 'compute-wake@test.invalid',
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
create temp table scope as select s.id space_id, s.org_id from public.spaces s
join public.space_members m on m.space_id = s.id
where m.user_id = 'a5000000-0000-4000-8000-000000000001' limit 1;

select public.set_dream_execution_mode('compute');
select ok(exists(select 1 from cron.job where jobname = 'dream-compute-worker'
  and active and schedule = '10 seconds'
  and command = 'select public.wake_compute_dream_worker()'),
  'Compute has a durable ten-second retry');
select is((select count(*) from net.http_request_queue where url like 'https://compute-wake.test/%'),
  0::bigint, 'idle Compute sends no requests');

-- Exercise the actual manual submission path; insertion must wake an idle instance.
select public.enqueue_dream(org_id, space_id, 'a5000000-0000-4000-8000-000000000001',
  array['digest']::public.dream_kind[]) from scope;
select is((select count(*) from net.http_request_queue
  where url = 'https://compute-wake.test/compute/v1/dream/'),
  1::bigint, 'queueing a dream wakes Compute immediately');
select is((select method from net.http_request_queue
  where url = 'https://compute-wake.test/compute/v1/dream/' limit 1),
  'GET', 'wake uses the existing read-only health endpoint');

delete from net.http_request_queue where url like 'https://compute-wake.test/%';
select public.wake_compute_dream_worker();
select is((select count(*) from net.http_request_queue where url like 'https://compute-wake.test/%'),
  1::bigint, 'scheduler retries a lost initial wake while work is queued');
select is((select count(*) from public.claim_dream_runs(1)), 1::bigint,
  'the existing atomic claim still owns execution');
delete from net.http_request_queue where url like 'https://compute-wake.test/%';
select public.wake_compute_dream_worker();
select is((select count(*) from net.http_request_queue where url like 'https://compute-wake.test/%'),
  1::bigint, 'running work also keeps the worker awake');

update public.dream_runs set status = 'succeeded', finished_at = now()
where space_id = (select space_id from scope);
delete from net.http_request_queue where url like 'https://compute-wake.test/%';
select public.wake_compute_dream_worker();
select is((select count(*) from net.http_request_queue where url like 'https://compute-wake.test/%'),
  0::bigint, 'completed work stops wake requests');

select public.set_dream_execution_mode('paused');
select ok(not exists(select 1 from cron.job where jobname = 'dream-compute-worker' and active),
  'reset removes the Compute retry schedule');
select public.enqueue_dream(org_id, space_id, 'a5000000-0000-4000-8000-000000000001',
  array['digest']::public.dream_kind[]) from scope;
select public.wake_compute_dream_worker();
select is((select count(*) from net.http_request_queue where url like 'https://compute-wake.test/%'),
  0::bigint, 'paused mode suppresses both insertion and stale cron wakes');
select public.set_dream_execution_mode('compute');
select is((select count(*) from net.http_request_queue where url like 'https://compute-wake.test/%'),
  1::bigint, 'resuming Compute immediately wakes existing queued work');

select public.set_dream_execution_mode('edge');
select ok(not exists(select 1 from cron.job where jobname = 'dream-compute-worker' and active),
  'Edge mode removes the Compute retry schedule');
delete from net.http_request_queue where url like 'https://compute-wake.test/%';
select public.wake_compute_dream_worker();
select is((select count(*) from net.http_request_queue where url like 'https://compute-wake.test/%'),
  0::bigint, 'an old Compute tick cannot wake after switching to Edge');
select ok(not has_function_privilege('anon', 'public.wake_compute_dream_worker()', 'execute'),
  'anonymous callers cannot wake Compute');
select ok(not has_function_privilege('authenticated', 'public.wake_compute_dream_worker()', 'execute'),
  'signed-in callers cannot bypass submission authorization');
select ok(not has_function_privilege('service_role', 'public.wake_compute_dream_worker()', 'execute'),
  'wake is internal to the scheduler and queue trigger');

delete from vault.secrets where name = 'worker_base_url';
select lives_ok($$select public.set_dream_execution_mode('compute')$$,
  'an unconfigured database can switch mode without attempting HTTP');
select * from finish();
rollback;
