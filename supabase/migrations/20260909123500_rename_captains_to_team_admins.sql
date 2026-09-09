-- =========================================================
-- Rename captain assignment architecture to Team Admin
-- =========================================================

alter table public.captain_assignments
rename to team_admin_assignments;

-- Rename existing constraints for clarity.

alter table public.team_admin_assignments
rename constraint captain_assignments_pkey
to team_admin_assignments_pkey;

alter table public.team_admin_assignments
rename constraint captain_assignments_removed_at_check
to team_admin_assignments_removed_at_check;

alter table public.team_admin_assignments
rename constraint captain_assignments_team_id_fkey
to team_admin_assignments_team_id_fkey;

alter table public.team_admin_assignments
rename constraint captain_assignments_user_id_fkey
to team_admin_assignments_user_id_fkey;


-- =========================================================
-- Remove old Captain-specific RLS policies
-- =========================================================

drop policy if exists
  "Players can view their own captain assignments"
on public.team_admin_assignments;

drop policy if exists
  "Super Admins can create captain assignments"
on public.team_admin_assignments;

drop policy if exists
  "Super Admins can delete captain assignments"
on public.team_admin_assignments;

drop policy if exists
  "Super Admins can update captain assignments"
on public.team_admin_assignments;

drop policy if exists
  "Super Admins can view all captain assignments"
on public.team_admin_assignments;


-- =========================================================
-- Recreate assignment policies using Team Admin terminology
-- =========================================================

create policy "Players can view their own team admin assignments"
on public.team_admin_assignments
for select
to authenticated
using (auth.uid() = user_id);

create policy "Super Admins can create team admin assignments"
on public.team_admin_assignments
for insert
to authenticated
with check (public.is_active_super_admin());

create policy "Super Admins can delete team admin assignments"
on public.team_admin_assignments
for delete
to authenticated
using (public.is_active_super_admin());

create policy "Super Admins can update team admin assignments"
on public.team_admin_assignments
for update
to authenticated
using (public.is_active_super_admin())
with check (public.is_active_super_admin());

create policy "Super Admins can view all team admin assignments"
on public.team_admin_assignments
for select
to authenticated
using (public.is_active_super_admin());


-- =========================================================
-- Prevent the same user being actively assigned twice
-- to the same team
-- =========================================================

create unique index team_admin_assignments_active_user_team_key
on public.team_admin_assignments(team_id, user_id)
where active = true;


-- =========================================================
-- Enforce maximum 5 active Team Admins per team
-- =========================================================

create or replace function public.enforce_team_admin_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_admin_count integer;
begin
  -- Serialise assignment changes for this team so that two
  -- simultaneous requests cannot both create a sixth admin.
  perform pg_advisory_xact_lock(hashtext(new.team_id));

  if new.active = true then

    select count(*)
    into active_admin_count
    from public.team_admin_assignments taa
    where taa.team_id = new.team_id
      and taa.active = true
      and taa.assignment_id <> coalesce(new.assignment_id, -1);

    if active_admin_count >= 5 then
      raise exception
        'Team % already has the maximum of 5 active Team Admins',
        new.team_id;
    end if;

  end if;

  return new;
end;
$$;

create trigger enforce_team_admin_limit
before insert or update of team_id, active
on public.team_admin_assignments
for each row
execute function public.enforce_team_admin_limit();


-- =========================================================
-- Replace Captain helper function
-- =========================================================

create or replace function public.is_active_team_admin_for_team(
  target_team_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_admin_assignments taa
    where taa.user_id = auth.uid()
      and taa.team_id = target_team_id
      and taa.active = true
  );
$$;

revoke all
on function public.is_active_team_admin_for_team(text)
from public;

grant execute
on function public.is_active_team_admin_for_team(text)
to authenticated;


-- =========================================================
-- Replace Captain-facing import policies
-- =========================================================

drop policy if exists
  "Captains can view external matches for their teams"
on public.external_matches;

drop policy if exists
  "Captains can view snapshots for their teams"
on public.external_match_snapshots;

drop policy if exists
  "Captains can view imports for their teams"
on public.match_imports;

drop policy if exists
  "Captains can view corrections for their teams"
on public.match_import_corrections;


create policy "Team Admins can view external matches for their teams"
on public.external_matches
for select
to authenticated
using (
  team_id is not null
  and public.is_active_team_admin_for_team(team_id)
);


create policy "Team Admins can view snapshots for their teams"
on public.external_match_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.external_matches em
    where em.id = external_match_snapshots.external_match_id
      and em.team_id is not null
      and public.is_active_team_admin_for_team(em.team_id)
  )
);


create policy "Team Admins can view imports for their teams"
on public.match_imports
for select
to authenticated
using (
  exists (
    select 1
    from public.external_matches em
    where em.id = match_imports.external_match_id
      and em.team_id is not null
      and public.is_active_team_admin_for_team(em.team_id)
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
    join public.external_matches em
      on em.id = mi.external_match_id
    where mi.id = match_import_corrections.match_import_id
      and em.team_id is not null
      and public.is_active_team_admin_for_team(em.team_id)
  )
);


-- =========================================================
-- Remove obsolete Captain helper
-- =========================================================

drop function if exists public.is_active_captain_for_team(text);