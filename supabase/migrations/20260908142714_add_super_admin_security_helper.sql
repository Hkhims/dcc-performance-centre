create or replace function public.is_active_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.user_profiles
        where user_id = auth.uid()
          and account_role = 'Super Admin'
          and status = 'Active'
    );
$$;

revoke all on function public.is_active_super_admin() from public;
grant execute on function public.is_active_super_admin() to authenticated;