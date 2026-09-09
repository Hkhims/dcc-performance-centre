alter table public.external_matches
add column team_id text
  references public.teams(team_id)
  on update cascade
  on delete restrict;

create index external_matches_team_id_idx
  on public.external_matches(team_id);

create or replace function public.is_active_captain_for_team(target_team_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.captain_assignments ca
    where ca.user_id = auth.uid()
      and ca.team_id = target_team_id
      and ca.active = true
  );
$$;

revoke all on function public.is_active_captain_for_team(text) from public;
grant execute on function public.is_active_captain_for_team(text) to authenticated;

create policy "Captains can view external matches for their teams"
on public.external_matches
for select
to authenticated
using (
  team_id is not null
  and public.is_active_captain_for_team(team_id)
);

create policy "Captains can view snapshots for their teams"
on public.external_match_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.external_matches em
    where em.id = external_match_snapshots.external_match_id
      and em.team_id is not null
      and public.is_active_captain_for_team(em.team_id)
  )
);

create policy "Captains can view imports for their teams"
on public.match_imports
for select
to authenticated
using (
  exists (
    select 1
    from public.external_matches em
    where em.id = match_imports.external_match_id
      and em.team_id is not null
      and public.is_active_captain_for_team(em.team_id)
  )
);

create policy "Captains can view corrections for their teams"
on public.match_import_corrections
for select
to authenticated
using (
  exists (
    select 1
    from public.match_imports mi
    join public.external_matches em
      on em.id = mi.external_match_id
    where mi.id = match_import_corrections.match_import_id
      and em.team_id is not null
      and public.is_active_captain_for_team(em.team_id)
  )
);