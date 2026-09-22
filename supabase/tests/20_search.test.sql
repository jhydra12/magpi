-- Two people ask the same question and get different answers, because RLS ran inside search.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.spaces (id, org_id, kind, name)
values
  ('50000000-0000-4000-8000-00000000000a',
   (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001'),
   'team', 'Alice team'),
  ('50000000-0000-4000-8000-00000000000c',
   (select org_id from public.org_members where user_id = 'c0000000-0000-4000-8000-000000000003'),
   'team', 'Leadership');

insert into public.space_members (space_id, user_id, created_at)
values
  ('50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
   '2026-01-02 00:00:00+00'),
  ('50000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000003',
   '2026-01-02 00:00:00+00');

insert into public.documents (id, org_id, space_id, title, origin, created_at, updated_at)
values
  ('51000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', 'Team plan', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  ('51000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', 'Leadership plan', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00');

-- Vectors as text in session settings, so the call needs no helper to build its argument.
select set_config('recall.qvec',
  '[1,0,' || array_to_string(array_fill(0::real, array[1534]), ',') || ']', true);
select set_config('recall.vec_a',
  '[0.9,0.1,' || array_to_string(array_fill(0::real, array[1534]), ',') || ']', true);
select set_config('recall.vec_c',
  '[0.8,0.2,' || array_to_string(array_fill(0::real, array[1534]), ',') || ']', true);

-- Deliberately near-identical text, so nothing but the permission check separates the chunks.
insert into public.chunks (id, org_id, space_id, document_id, ordinal, content, embedding)
values
  ('52000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
   0, 'the roadmap ships the launch in march',
   current_setting('recall.vec_a')::extensions.vector(1536)),
  ('52000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000000c',
   0, 'the roadmap ships the launch in june after the board review',
   current_setting('recall.vec_c')::extensions.vector(1536));

-- Alice ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_eq(
  $$ select chunk_id from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship', null, 20) $$,
  array['52000000-0000-4000-8000-00000000000a']::uuid[],
  'an unfiltered search returns only the chunks the caller can see'
);

select is(
  (select count(*)::int from public.search(
     current_setting('recall.qvec')::extensions.vector(1536),
     'when does the roadmap ship',
     array['50000000-0000-4000-8000-00000000000a']::uuid[], 20)),
  1, 'filtering to a space the caller is in returns that space''s chunks'
);

-- Naming a space you cannot see is not an escalation and not an error either.
select lives_ok(
  $$ select * from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship',
       array['50000000-0000-4000-8000-00000000000c']::uuid[], 20) $$,
  'filtering to a space the caller cannot see raises no error'
);

select is(
  (select count(*)::int from public.search(
     current_setting('recall.qvec')::extensions.vector(1536),
     'when does the roadmap ship',
     array['50000000-0000-4000-8000-00000000000c']::uuid[], 20)),
  0, 'and returns nothing rather than leaking the space'
);

-- A filter is a narrowing argument, never a grant.
select set_eq(
  $$ select chunk_id from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship',
       array['50000000-0000-4000-8000-00000000000a',
             '50000000-0000-4000-8000-00000000000c']::uuid[], 20) $$,
  array['52000000-0000-4000-8000-00000000000a']::uuid[],
  'a filter naming both spaces still returns only the visible one'
);

-- Carol, same question, same index --------------------------------------------

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select set_eq(
  $$ select chunk_id from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship', null, 20) $$,
  array['52000000-0000-4000-8000-00000000000c']::uuid[],
  'the same query from the other side of the boundary returns the other row set'
);

select ok(
  not exists (
    select 1 from public.search(
      current_setting('recall.qvec')::extensions.vector(1536),
      'when does the roadmap ship', null, 20)
    where chunk_id = '52000000-0000-4000-8000-00000000000a'
  ),
  'and the two answers to the identical question share no chunk'
);

-- Bob, who has nothing indexed at all -----------------------------------------

set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.search(
     current_setting('recall.qvec')::extensions.vector(1536),
     'when does the roadmap ship', null, 20)),
  0, 'a caller with no indexed content gets an empty result, not somebody else''s'
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select * from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship', null, 20) $$,
  '42501', null, 'a signed-out caller cannot run the search at all'
);

reset role;

-- Digital Brain under a filtered index scan: a thousand unreachable rows nearer than the caller's five.

reset role;

insert into public.chunks (org_id, space_id, document_id, ordinal, content, embedding)
select (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
       '50000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000000c', n,
       'leadership filler line ' || n,
       ('[0,0,1,' || (n::numeric / 1000000) || ',' || repeat('0,', 1531) || '0]')::extensions.vector(1536)
from generate_series(1, 1000) as n;

insert into public.chunks (org_id, space_id, document_id, ordinal, content, embedding)
select (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
       '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a', n,
       'quarterly compensation memorandum ' || n,
       ('[0,0,0.5,0.5,' || repeat('0,', 1531) || '0]')::extensions.vector(1536)
from generate_series(1, 5) as n;

select set_config('magpi.qdense',
  '[0,0,1,' || repeat('0,', 1532) || '0]', true);

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Forcing the index puts the real plan under test instead of a sequential scan.
set local enable_seqscan = off;

select is(
  (select count(*)::int from public.search(
     current_setting('magpi.qdense')::extensions.vector(1536),
     'zzzznomatch', null, 20)
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  0, 'an index scan never returns a row from a space the caller cannot see'
);

-- What is left catches the one regression that matters: somebody removing the setting.
select is(
  (select coalesce(array_to_string(p.proconfig, ' '), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search') like '%hnsw.iterative_scan=relaxed_order%',
  true,
  'public.search carries the iterative scan setting, without which a filtered vector search returns nothing'
);

reset role;

-- The whole permission model of retrieval rests on this one flag.
select ok(
  not (select prosecdef from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'search'),
  'public.search is security invoker, so RLS applies to whoever called it'
);

-- A question long or dense enough breaks websearch_to_tsquery, and that used to take the whole
-- search down rather than the one arm that could not be built.
select is(
  public.text_search_query('what is Meniscus made of') is not null,
  true,
  'an ordinary question builds a lexical arm'
);

select is(
  public.text_search_query('') is null,
  true,
  'an empty question builds no lexical arm, rather than one matching everything'
);

-- Forty hyphens in a row. A table rule, an underline, the separator in any pasted table. The
-- parser raises on it, and the length of the rest of the question has nothing to do with it.
select is(
  public.text_search_query('Totals by region ' || repeat('-', 40) || ' Ink 1,470 42.0%') is null,
  true,
  'text the parser refuses builds no lexical arm, rather than raising'
);

-- The point of the whole change: the search still answers.
select lives_ok(
  $$ select * from public.search(
       (select embedding from public.chunks where embedding is not null limit 1),
       'Totals by region ' || repeat('-', 40) || ' Ink 1,470 42.0%',
       null, 12) $$,
  'a question the parser refuses still returns an answer from the semantic arm'
);

select * from finish();

rollback;
