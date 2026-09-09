create table public.external_competition_mappings (
  id bigint generated always as identity primary key,

  competition_id text not null
    references public.competitions(competition_id)
    on update cascade
    on delete restrict,

  season integer not null
    references public.seasons(season)
    on update cascade
    on delete restrict,

  provider text not null,
  external_competition_id text not null,
  external_competition_name text,

  status text not null default 'Confirmed'
    check (status in ('Confirmed', 'Inactive')),

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint external_competition_mappings_provider_season_external_id_key
    unique (provider, season, external_competition_id)
);

create index external_competition_mappings_competition_id_idx
  on public.external_competition_mappings(competition_id);

create index external_competition_mappings_provider_season_idx
  on public.external_competition_mappings(provider, season);

alter table public.external_competition_mappings
  enable row level security;

create policy "Super Admins can view external competition mappings"
on public.external_competition_mappings
for select
to authenticated
using (public.is_active_super_admin());

create policy "Super Admins can create external competition mappings"
on public.external_competition_mappings
for insert
to authenticated
with check (public.is_active_super_admin());

create policy "Super Admins can update external competition mappings"
on public.external_competition_mappings
for update
to authenticated
using (public.is_active_super_admin())
with check (public.is_active_super_admin());

create policy "Super Admins can delete external competition mappings"
on public.external_competition_mappings
for delete
to authenticated
using (public.is_active_super_admin());

create or replace function public.validate_external_competition_mapping_season()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  competition_season integer;
begin
  select c.season
  into competition_season
  from public.competitions c
  where c.competition_id = new.competition_id;

  if competition_season is distinct from new.season then
    raise exception
      'Competition % belongs to season %, not season %',
      new.competition_id,
      competition_season,
      new.season;
  end if;

  return new;
end;
$$;

create trigger validate_external_competition_mapping_season
before insert or update on public.external_competition_mappings
for each row
execute function public.validate_external_competition_mapping_season();

create or replace function public.set_external_competition_mapping_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_external_competition_mapping_updated_at
before update on public.external_competition_mappings
for each row
execute function public.set_external_competition_mapping_updated_at();