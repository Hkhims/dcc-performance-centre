create policy "Super Admins can view all user profiles"
on public.user_profiles
for select
to authenticated
using (
    public.is_active_super_admin()
);

create policy "Super Admins can create user profiles"
on public.user_profiles
for insert
to authenticated
with check (
    public.is_active_super_admin()
);

create policy "Super Admins can update user profiles"
on public.user_profiles
for update
to authenticated
using (
    public.is_active_super_admin()
)
with check (
    public.is_active_super_admin()
);

create policy "Super Admins can delete user profiles"
on public.user_profiles
for delete
to authenticated
using (
    public.is_active_super_admin()
);