-- ============================================================
-- Fix availability SELECT policies
--
-- Availability read policies originally queried user_profiles
-- directly. Authenticated users deliberately do not have direct
-- SELECT privileges on user_profiles after Portal security
-- hardening, so those policies fail with PostgreSQL 42501.
--
-- Use the existing SECURITY DEFINER get_my_portal_access()
-- function instead. This preserves the user_profiles security
-- boundary while still allowing active DCC accounts to read
-- availability data.
-- ============================================================


-- ------------------------------------------------------------
-- Availability polls
-- ------------------------------------------------------------

drop policy if exists
  "Active DCC users can read availability polls"
on public.match_availability_polls;

create policy
  "Active DCC users can read availability polls"
on public.match_availability_polls
for select
to authenticated
using (
  exists (
    select 1
    from public.get_my_portal_access() access
    where access.account_status = 'Active'
  )
);


-- ------------------------------------------------------------
-- Availability audience
-- ------------------------------------------------------------

drop policy if exists
  "Active DCC users can read availability audience"
on public.match_availability_audience;

create policy
  "Active DCC users can read availability audience"
on public.match_availability_audience
for select
to authenticated
using (
  exists (
    select 1
    from public.get_my_portal_access() access
    where access.account_status = 'Active'
  )
);


-- ------------------------------------------------------------
-- Availability responses
-- ------------------------------------------------------------

drop policy if exists
  "Active DCC users can read availability responses"
on public.match_availability;

create policy
  "Active DCC users can read availability responses"
on public.match_availability
for select
to authenticated
using (
  exists (
    select 1
    from public.get_my_portal_access() access
    where access.account_status = 'Active'
  )
);