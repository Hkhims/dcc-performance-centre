-- Require an Active Portal account for match import management.
-- An active team assignment alone must not grant access.

CREATE OR REPLACE FUNCTION public.can_manage_match_import(
  target_match_import_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    public.is_active_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.match_imports mi
      JOIN public.external_match_teams emt
        ON emt.external_match_id = mi.external_match_id
      JOIN public.team_admin_assignments taa
        ON taa.team_id = emt.team_id
      JOIN public.user_profiles up
        ON up.user_id = taa.user_id
      WHERE mi.id = target_match_import_id
        AND taa.user_id = auth.uid()
        AND taa.active = true
        AND up.status = 'Active'
    );
$function$;