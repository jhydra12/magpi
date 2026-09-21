-- A digest only reads chunks created in the last day, and re-ingestion deliberately keeps a
-- chunk whose content has not changed, so a corpus seeded earlier can never produce one. The
-- reset returns the fixture to a state the digest can read, which re-ingestion cannot do.
create or replace function public.freshen_demo_corpus(p_org_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.chunks set created_at = now() where org_id = p_org_id;
  -- Connections reads updated_at while the digest reads chunks.created_at; move both together
  -- so the two passes see the same corpus. Dream output is not source material.
  update public.documents set updated_at = now()
  where org_id = p_org_id and origin <> 'dream';
end;
$$;
revoke all on function public.freshen_demo_corpus(uuid) from public, anon, authenticated;
grant execute on function public.freshen_demo_corpus(uuid) to service_role;
