create table public.external_team_mappings (
  id bigint generated always as identity primary key,

  team_id text not null
    references public.teams(team_id)
    on update cascade
    on delete restrict,

  provider text not null,
  external_team_id text not null,
  external_team_name text,

  status text not null default 'Confirmed'
    check (status in ('Confirmed', 'Inactive')),

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint external_team_mappings_provider_external_id_key
    unique (provider, external_team_id)
);

create index external_team_mappings_team_id_idx
  on public.external_team_mappings(team_id);

create index external_team_mappings_provider_idx
  on public.external_team_mappings(provider);

alter table public.external_team_mappings
  enable row level security;

create policy "Super Admins can view external team mappings"
on public.external_team_mappings
for select
to authenticated
using (public.is_active_super_admin());

create policy "Super Admins can create external team mappings"
on public.external_team_mappings
for insert
to authenticated
with check (public.is_active_super_admin());

create policy "Super Admins can update external team mappings"
on public.external_team_mappings
for update
to authenticated
using (public.is_active_super_admin())
with check (public.is_active_super_admin());

create policy "Super Admins can delete external team mappings"
on public.external_team_mappings
for delete
to authenticated
using (public.is_active_super_admin());

create or replace function public.set_external_team_mapping_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_external_team_mapping_updated_at
before update on public.external_team_mappings
for each row
execute function public.set_external_team_mapping_updated_at();