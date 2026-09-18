-- A week of nightly digests must not push the document with the answer out of the passages.

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-00000000000d', 'dana@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.spaces (id, org_id, kind, name)
values
  ('50000000-0000-4000-8000-00000000000d',
   (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-00000000000d'),
   'team', 'Launch');

insert into public.space_members (space_id, user_id, created_at)
values
  ('50000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000000d',
   '2026-01-02 00:00:00+00');

-- One source document that states the date, and five digests written about it.
insert into public.documents (id, org_id, space_id, title, origin, created_at, updated_at)
select
  ('53000000-0000-4000-8000-00000000000' || n)::uuid,
  (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000d'),
  '50000000-0000-4000-8000-00000000000d',
  case when n = 0 then 'Launch date lock' else 'Digest ' || n end,
  case when n = 0 then 'upload' else 'dream' end::public.document_origin,
  '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'
from generate_series(0, 5) as n;

select set_config('recall.qvec',
  '[1,0,' || array_to_string(array_fill(0::real, array[1534]), ',') || ']', true);

-- The digests sit nearer the query than the source does, on both arms, which is the failure.
insert into public.chunks (id, org_id, space_id, document_id, ordinal, content, embedding)
select
  ('54000000-0000-4000-8000-00000000000' || n)::uuid,
  (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000d'),
  '50000000-0000-4000-8000-00000000000d',
  ('53000000-0000-4000-8000-00000000000' || n)::uuid,
  0,
  case when n = 0
    then 'the launch ships on 4 november'
    else 'the launch ships in november, the launch ships soon, launch launch ships'
  end,
  ('[' || (1 - 0.01 * (6 - n))::text || ',' || (0.01 * (6 - n))::text || ','
    || array_to_string(array_fill(0::real, array[1534]), ',') || ']')::extensions.vector(1536)
from generate_series(0, 5) as n;

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-00000000000d","role":"authenticated"}';

select ok(
  exists (
    select 1 from public.search(
      current_setting('recall.qvec')::extensions.vector(1536),
      'when does the launch ship', null, 4)
    where chunk_id = '54000000-0000-4000-8000-000000000000'
  ),
  'the source document reaches a budget of four even when five digests outscore it'
);

select is(
  (select count(*)::int from public.search(
     current_setting('recall.qvec')::extensions.vector(1536),
     'when does the launch ship', null, 4) r
   join public.documents d on d.id = r.document_id
   where d.origin = 'dream'),
  1, 'digests take one slot of a budget of four'
);

select is(
  (select count(*)::int from public.search(
     current_setting('recall.qvec')::extensions.vector(1536),
     'when does the launch ship', null, 12) r
   join public.documents d on d.id = r.document_id
   where d.origin = 'dream'),
  3, 'and three slots of a budget of twelve'
);

select is(
  (select count(*)::int from public.search(
     current_setting('recall.qvec')::extensions.vector(1536),
     'when does the launch ship', null, 20)),
  6, 'a budget with room for everything still returns everything'
);

reset role;

select * from finish();

rollback;
