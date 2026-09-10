-- Provide the authenticated user with the minimum Portal access context
-- required by the DCC web Portal and future DCC mobile app.
--
-- This avoids exposing user_profiles or team_admin_assignments broadly through
-- RLS. The function returns only the caller's own account details and active
-- team-admin assignments.

create or replace function public.get_my_portal_access()
returns table (
  user_id uuid,
  player_id text,
  account_role text,
  account_status text,
  display_name text,
  team_ids text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    up.user_id,
    up.player_id,
    up.account_role,
    up.status as account_status,
    up.display_name,
    coalesce(
      array_agg(distinct taa.team_id)
        filter (where taa.team_id is not null and taa.active = true),
      '{}'::text[]
    ) as team_ids
  from public.user_profiles up
  left join public.team_admin_assignments taa
    on taa.user_id = up.user_id
   and taa.active = true
  where up.user_id = auth.uid()
  group by
    up.user_id,
    up.player_id,
    up.account_role,
    up.status,
    up.display_name;
$$;

revoke all
on function public.get_my_portal_access()
from public;

grant execute
on function public.get_my_portal_access()
to authenticated;
