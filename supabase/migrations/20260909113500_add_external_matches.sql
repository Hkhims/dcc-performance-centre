create table public.external_matches (
  id bigint generated always as identity primary key,

  provider text not null,
  external_match_id text not null,

  season integer not null
    references public.seasons(season)
    on update cascade
    on delete restrict,

  external_competition_id text,
  external_competition_name text,

  external_home_team_id text,
  external_home_team_name text,

  external_away_team_id text,
  external_away_team_name text,

  start_datetime timestamptz,
  match_status text,
  is_complete boolean not null default false,

  import_status text not null default 'Detected'
    check (
      import_status in (
        'Detected',
        'Imported',
        'Needs Review',
        'Approved',
        'Changed Upstream',
        'Rejected'
      )
    ),

  canonical_match_id text
    references public.matches(match_id)
    on update cascade
    on delete set null,

  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint external_matches_provider_external_match_id_key
    unique (provider, external_match_id)
);

create index external_matches_season_idx
  on public.external_matches(season);

create index external_matches_import_status_idx
  on public.external_matches(import_status);

create index external_matches_canonical_match_id_idx
  on public.external_matches(canonical_match_id);

alter table public.external_matches
  enable row level security;

create policy "Super Admins can view external matches"
on public.external_matches
for select
to authenticated
using (public.is_active_super_admin());

create policy "Super Admins can create external matches"
on public.external_matches
for insert
to authenticated
with check (public.is_active_super_admin());

create policy "Super Admins can update external matches"
on public.external_matches
for update
to authenticated
using (public.is_active_super_admin())
with check (public.is_active_super_admin());

create policy "Super Admins can delete external matches"
on public.external_matches
for delete
to authenticated
using (public.is_active_super_admin());

create or replace function public.set_external_match_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_external_match_updated_at
before update on public.external_matches
for each row
execute function public.set_external_match_updated_at();