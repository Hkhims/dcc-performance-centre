-- Prevent inactive Portal accounts from receiving Team Admin assignments.
-- Existing assignments remain stored and become visible again
-- if the account is reactivated.

CREATE OR REPLACE FUNCTION public.get_my_portal_access()
RETURNS TABLE (
  user_id uuid,
  player_id text,
  account_role text,
  account_status text,
  display_name text,
  team_ids text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    up.user_id,
    up.player_id,
    up.account_role,
    up.status AS account_status,
    up.display_name,
    COALESCE(
      array_agg(DISTINCT taa.team_id)
        FILTER (
          WHERE taa.team_id IS NOT NULL
            AND taa.active = true
            AND up.status = 'Active'
        ),
      '{}'::text[]
    ) AS team_ids
  FROM public.user_profiles up
  LEFT JOIN public.team_admin_assignments taa
    ON taa.user_id = up.user_id
   AND taa.active = true
  WHERE up.user_id = auth.uid()
  GROUP BY
    up.user_id,
    up.player_id,
    up.account_role,
    up.status,
    up.display_name;
$function$;