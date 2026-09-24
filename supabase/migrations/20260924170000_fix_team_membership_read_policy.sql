-- ============================================================
-- Fix team-player membership SELECT policy
--
-- The original membership read policy queried user_profiles
-- directly. Authenticated users deliberately do not have direct
-- SELECT privileges on user_profiles after Portal security
-- hardening.
--
-- Use the existing SECURITY DEFINER get_my_portal_access()
-- function instead so the security boundary remains intact.
-- ============================================================

drop policy if exists
  "Active DCC users can read team player memberships"
on public.team_player_memberships;

create policy
  "Active DCC users can read team player memberships"
on public.team_player_memberships
for select
to authenticated
using (
  exists (
    select 1
    from public.get_my_portal_access() access
    where access.account_status = 'Active'
  )
);