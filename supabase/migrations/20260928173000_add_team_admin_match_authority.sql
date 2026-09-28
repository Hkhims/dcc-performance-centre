-- ============================================================================
-- DCC Performance Centre
-- Extend generic match-management authority to relevant Team Admins
--
-- Authority routes:
--   1. Active Super Admin
--   2. Active explicit Match Admin
--   3. Active Team Admin for a DCC team attached to the match
--
-- This keeps generic match-management authority aligned with the existing
-- Team Selection authority model and allows relevant Team Admins to use
-- App Scorer for eligible Friendly/Warm-up matches.
-- ============================================================================

create or replace function public.can_manage_match(
  target_match_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth.uid() is not null
    and nullif(trim(target_match_id), '') is not null
    and exists (
      select 1
      from public.user_profiles up
      where up.user_id = auth.uid()
        and up.status = 'Active'
        and (
          up.account_role = 'Super Admin'

          or exists (
            select 1
            from public.match_admin_assignments maa
            where maa.match_id = trim(target_match_id)
              and maa.user_id = auth.uid()
              and maa.active = true
          )

          or exists (
            select 1
            from public.match_team_entries mte
            join public.team_admin_assignments taa
              on taa.team_id = mte.team_id
            where mte.match_id = trim(target_match_id)
              and taa.user_id = auth.uid()
              and taa.active = true
          )
        )
    );
$function$;

revoke all
on function public.can_manage_match(text)
from public;

grant execute
on function public.can_manage_match(text)
to authenticated;
