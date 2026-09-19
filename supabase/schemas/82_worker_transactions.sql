-- Service-only queue and persistence operations. Each call commits all its changes together.
create index if not exists dream_runs_queued_idx on public.dream_runs (created_at, id) where status = 'queued';

create or replace function public.enqueue_dream(p_org_id uuid, p_space_id uuid, p_user_id uuid, p_kinds public.dream_kind[])
returns setof public.dream_runs language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('dream:' || p_space_id::text, 0));
  if not exists (select 1 from public.spaces where id = p_space_id and org_id = p_org_id) then
    raise exception 'space does not belong to organization';
  end if;
  insert into public.dream_runs (org_id, space_id, kind, triggered_by)
  select p_org_id, p_space_id, k, p_user_id from (select distinct unnest(p_kinds) k) kinds
  where not exists (select 1 from public.dream_runs r where r.space_id = p_space_id and r.kind = k and r.status in ('queued', 'running'));
  return query select r.* from public.dream_runs r where r.space_id = p_space_id and r.kind = any(p_kinds) and r.status in ('queued', 'running') order by r.created_at, r.id;
end;
$$;
revoke all on function public.enqueue_dream(uuid, uuid, uuid, public.dream_kind[]) from public, anon, authenticated;
grant execute on function public.enqueue_dream(uuid, uuid, uuid, public.dream_kind[]) to service_role;

create or replace function public.enqueue_document(p_document jsonb, p_force boolean default false)
returns table(document_id uuid, ingest_job_id uuid) language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.documents;
  v_job public.ingest_jobs;
  v_input public.documents := jsonb_populate_record(null::public.documents, p_document);
  v_identity text;
begin
  v_identity := coalesce(v_input.connection_id::text || ':' || v_input.external_id, v_input.space_id::text || ':' || v_input.storage_path, v_input.id::text);
  if v_identity is null then raise exception 'a stable document identity is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('document:' || v_identity, 0));
  select d.* into v_doc from public.documents d where
    (v_input.id is not null and d.id = v_input.id) or
    (v_input.connection_id is not null and d.connection_id = v_input.connection_id and d.external_id = v_input.external_id) or
    (v_input.storage_path is not null and d.space_id = v_input.space_id and d.storage_path = v_input.storage_path)
    limit 1 for update;
  if v_doc.id is not null and (v_doc.org_id <> v_input.org_id or v_doc.space_id <> v_input.space_id) then
    raise exception 'document identity belongs to another space';
  end if;
  if v_doc.id is null then
    insert into public.documents(id, org_id, space_id, connection_id, external_id, title, origin, mime_type, storage_path, url, size_bytes, created_by)
    values(coalesce(v_input.id, gen_random_uuid()), v_input.org_id, v_input.space_id, v_input.connection_id, v_input.external_id, coalesce(v_input.title, 'Untitled'), v_input.origin, v_input.mime_type, v_input.storage_path, v_input.url, v_input.size_bytes, v_input.created_by)
    returning * into v_doc;
  end if;
  if p_force then
    update public.documents set
      title = coalesce(p_document->>'title', title),
      url = case when p_document ? 'url' then p_document->>'url' else url end,
      mime_type = coalesce(p_document->>'mime_type', mime_type),
      storage_path = coalesce(p_document->>'storage_path', storage_path),
      created_by = coalesce((p_document->>'created_by')::uuid, created_by),
      updated_at = coalesce((p_document->>'updated_at')::timestamptz, now())
    where id = v_doc.id;
  end if;
  select j.* into v_job from public.ingest_jobs j where j.document_id = v_doc.id order by j.created_at desc, j.id desc limit 1 for update;
  if v_job.id is null or v_job.status in ('failed', 'timeout') or (p_force and v_job.status = 'succeeded') then
    insert into public.ingest_jobs(org_id, space_id, document_id, connection_id)
    values(v_doc.org_id, v_doc.space_id, v_doc.id, v_doc.connection_id) returning * into v_job;
  end if;
  return query select v_doc.id, v_job.id;
end;
$$;
revoke all on function public.enqueue_document(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.enqueue_document(jsonb, boolean) to service_role;

-- Changed chunks lose their mentions; unchanged chunks retain IDs and graph evidence.
-- A failure rolls back both replacement chunks and metadata, including cascaded deletions.
create or replace function public.replace_document_chunks(p_document_id uuid, p_chunks jsonb, p_metadata jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_doc public.documents;
begin
  select * into strict v_doc from public.documents where id = p_document_id for update;
  delete from public.chunks c where c.document_id = p_document_id and not exists (
    select 1 from jsonb_to_recordset(p_chunks) x(ordinal integer, content text)
    where x.ordinal = c.ordinal and x.content = c.content
  );
  insert into public.chunks(org_id, space_id, document_id, ordinal, content, token_count, embedding)
  select v_doc.org_id, v_doc.space_id, v_doc.id, x.ordinal, x.content, x.token_count, x.embedding::text::extensions.vector
  from jsonb_to_recordset(p_chunks) x(ordinal integer, content text, token_count integer, embedding jsonb)
  on conflict(document_id, ordinal) do update set token_count = excluded.token_count, embedding = excluded.embedding;
  update public.documents set content_hash = p_metadata->>'content_hash', version = version + 1,
    title = coalesce(p_metadata->>'title', title), url = p_metadata->>'url',
    mime_type = p_metadata->>'mime_type', size_bytes = (p_metadata->>'size_bytes')::bigint
  where id = p_document_id;
end;
$$;
revoke all on function public.replace_document_chunks(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_document_chunks(uuid, jsonb, jsonb) to service_role;
