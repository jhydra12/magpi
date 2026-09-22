-- Demo-wide switches an operator flips from Admin > Demo. One row, because these describe the
-- demo rather than any organization in it.
create table if not exists public.demo_settings (
  id boolean primary key default true check (id),
  -- Rehearsal answers model calls from the prompt's own text instead of calling the provider, so
  -- the demo can be practised without spending. SB_MODEL_REHEARSAL overrides this when it is set.
  model_rehearsal boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.demo_settings (id) values (true) on conflict (id) do nothing;

alter table public.demo_settings enable row level security;
alter table public.demo_settings force row level security;
revoke all on table public.demo_settings from public, anon, authenticated;

create or replace function public.model_rehearsal_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select model_rehearsal from public.demo_settings where id), false);
$$;
revoke all on function public.model_rehearsal_enabled() from public, anon, authenticated;
grant execute on function public.model_rehearsal_enabled() to service_role;

-- Answers with the value that is now stored, so a caller never has to read back to confirm.
create or replace function public.set_model_rehearsal(p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean;
begin
  if p_enabled is null then
    raise exception 'rehearsal mode must be true or false';
  end if;
  insert into public.demo_settings (id, model_rehearsal, updated_at)
  values (true, p_enabled, now())
  on conflict (id) do update set model_rehearsal = excluded.model_rehearsal, updated_at = now()
  returning model_rehearsal into v_enabled;
  return v_enabled;
end;
$$;
revoke all on function public.set_model_rehearsal(boolean) from public, anon, authenticated;
grant execute on function public.set_model_rehearsal(boolean) to service_role;
