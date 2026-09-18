-- A dream digest summarises the documents a question is about, so a week of nightly digests
-- scores well on both arms of the hybrid search and can fill a small passage budget with
-- summaries, pushing out the source that holds the answer. Digests now take at most a quarter
-- of match_count; the rest is left for the documents themselves.

create or replace function public.search(
  query_embedding extensions.vector(1536),
  query_text text,
  space_filter uuid[] default null,
  match_count integer default 20
)
returns table (
  chunk_id uuid,
  document_id uuid,
  space_id uuid,
  content text,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with
    -- Over-fetch each arm, because RRF only reorders what it is given.
    candidate_depth as (select greatest(match_count * 4, 40) as n),
    semantic as (
      select
        c.id,
        c.document_id,
        c.space_id,
        c.content,
        row_number() over (order by c.embedding <=> query_embedding) as rank
      from public.chunks c, candidate_depth d
      where c.embedding is not null
        and (space_filter is null or c.space_id = any (space_filter))
      order by c.embedding <=> query_embedding
      limit (select n from candidate_depth)
    ),
    -- Built once. A query that cannot be built is null, and the lexical arm returns nothing.
    asked as (select public.text_search_query(query_text) as tsq),
    lexical as (
      select
        c.id,
        c.document_id,
        c.space_id,
        c.content,
        row_number() over (order by ts_rank_cd(c.tsv, a.tsq) desc) as rank
      from public.chunks c, asked a
      where a.tsq is not null
        and c.tsv @@ a.tsq
        and (space_filter is null or c.space_id = any (space_filter))
      order by ts_rank_cd(c.tsv, a.tsq) desc
      limit (select n from candidate_depth)
    ),
    fused as (
      select
        coalesce(s.id, l.id) as chunk_id,
        coalesce(s.document_id, l.document_id) as document_id,
        coalesce(s.space_id, l.space_id) as space_id,
        coalesce(s.content, l.content) as content,
        -- k = 60 is the constant from the original RRF paper, so no per-corpus tuning.
        (coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + l.rank), 0))::real as score
      from semantic s
      full outer join lexical l on l.id = s.id
    ),
    -- A dream digest summarises the same documents the query is about, so it scores well on
    -- both arms. A week of nightly digests can then fill a small budget with summaries and push
    -- out the source that holds the answer. Digests get at most a quarter of the budget.
    ranked as (
      select
        f.*,
        d.origin = 'dream' as is_dream,
        row_number() over (partition by d.origin = 'dream' order by f.score desc) as origin_rank
      from fused f
      join public.documents d on d.id = f.document_id
    )
  select chunk_id, document_id, space_id, content, score
  from ranked
  where not is_dream or origin_rank <= greatest(1, match_count / 4)
  order by score desc
  limit match_count;
$$;

-- Iterative scan for search(). The vector cast below must run before the ALTER is accepted.
do $$
begin
  perform '[1]'::extensions.vector;
end;
$$;

alter function public.search(extensions.vector, text, uuid[], integer)
  set hnsw.iterative_scan = relaxed_order;
