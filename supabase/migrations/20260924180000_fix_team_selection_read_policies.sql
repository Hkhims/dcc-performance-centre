-- DCC Portal / App
-- Fix Team Selection read policies after user_profiles privilege hardening.
--
-- Active authenticated DCC users may read match selections and selected
-- players, but the client must not require direct SELECT access to
-- public.user_profiles.
--
-- get_my_portal_access() is the established SECURITY DEFINER boundary for
-- resolving the current user's active Portal access.

-- ============================================================
-- 1. Match selections
-- ============================================================

drop policy if exists
  "Active DCC users can read match selections"
on public.match_selections;

create policy
  "Active DCC users can read match selections"
on public.match_selections
for select
to authenticated
using (
  exists (
    select 1
    from public.get_my_portal_access() access
    where access.account_status = 'Active'
  )
);


-- ============================================================
-- 2. Selected players
-- ============================================================

drop policy if exists
  "Active DCC users can read selected players"
on public.match_selection_players;

create policy
  "Active DCC users can read selected players"
on public.match_selection_players
for select
to authenticated
using (
  exists (
    select 1
    from public.get_my_portal_access() access
    where access.account_status = 'Active'
  )
);