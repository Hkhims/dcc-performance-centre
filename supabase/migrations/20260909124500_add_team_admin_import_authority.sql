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
      join public.external_matches em
        on em.id = mi.external_match_id
      join public.team_admin_assignments taa
        on taa.team_id = em.team_id
      where mi.id = target_match_import_id
        and taa.user_id = auth.uid()
        and taa.active = true
    );
$$;

revoke all
on function public.can_manage_match_import(bigint)
from public;

grant execute
on function public.can_manage_match_import(bigint)
to authenticated;