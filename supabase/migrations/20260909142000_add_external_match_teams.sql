create table public.external_match_teams (
  external_match_id bigint not null
    references public.external_matches(id)
    on update cascade
    on delete cascade,

  team_id text not null
    references public.teams(team_id)
    on update cascade
    on delete restrict,

  created_at timestamptz not null default now(),

  primary key (external_match_id, team_id)
);

create index external_match_teams_team_id_idx
  on public.external_match_teams(team_id);

alter table public.external_match_teams
  enable row level security;


-- =========================================================
-- Backfill existing single-team ownership
-- =========================================================

insert into public.external_match_teams (
  external_match_id,
  team_id
)
select
  id,
  team_id
from public.external_matches
where team_id is not null
on conflict do nothing;


-- =========================================================
-- Super Admin access
-- =========================================================

create policy "Super Admins can view external match teams"
on public.external_match_teams
for select
to authenticated
using (public.is_active_super_admin());

create policy "Super Admins can create external match teams"
on public.external_match_teams
for insert
to authenticated
with check (public.is_active_super_admin());

create policy "Super Admins can delete external match teams"
on public.external_match_teams
for delete
to authenticated
using (public.is_active_super_admin());


-- =========================================================
-- Team Admin read access
-- =========================================================

create policy "Team Admins can view external match teams for their teams"
on public.external_match_teams
for select
to authenticated
using (
  public.is_active_team_admin_for_team(team_id)
);


-- =========================================================
-- Replace import authority helper
-- =========================================================

create or replace function public.can_manage_match_import(
  target_match_import_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_active_super_admin()
    or exists (
      select 1
      from public.match_imports mi
      join public.external_match_teams emt
        on emt.external_match_id = mi.external_match_id
      join public.team_admin_assignments taa
        on taa.team_id = emt.team_id
      where mi.id = target_match_import_id
        and taa.user_id = auth.uid()
        and taa.active = true
    );
$$;


-- =========================================================
-- Replace Team Admin RLS policies so they use
-- external_match_teams rather than external_matches.team_id
-- =========================================================

drop policy if exists
  "Team Admins can view external matches for their teams"
on public.external_matches;

drop policy if exists
  "Team Admins can view snapshots for their teams"
on public.external_match_snapshots;

drop policy if exists
  "Team Admins can view imports for their teams"
on public.match_imports;

drop policy if exists
  "Team Admins can view corrections for their teams"
on public.match_import_corrections;


create policy "Team Admins can view external matches for their teams"
on public.external_matches
for select
to authenticated
using (
  exists (
    select 1
    from public.external_match_teams emt
    where emt.external_match_id = external_matches.id
      and public.is_active_team_admin_for_team(emt.team_id)
  )
);


create policy "Team Admins can view snapshots for their teams"
on public.external_match_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.external_match_teams emt
    where emt.external_match_id =
      external_match_snapshots.external_match_id
      and public.is_active_team_admin_for_team(emt.team_id)
  )
);


create policy "Team Admins can view imports for their teams"
on public.match_imports
for select
to authenticated
using (
  exists (
    select 1
    from public.external_match_teams emt
    where emt.external_match_id =
      match_imports.external_match_id
      and public.is_active_team_admin_for_team(emt.team_id)
  )
);


create policy "Team Admins can view corrections for their teams"
on public.match_import_corrections
for select
to authenticated
using (
  exists (
    select 1
    from public.match_imports mi
    join public.external_match_teams emt
      on emt.external_match_id = mi.external_match_id
    where mi.id =
      match_import_corrections.match_import_id
      and public.is_active_team_admin_for_team(emt.team_id)
  )
);