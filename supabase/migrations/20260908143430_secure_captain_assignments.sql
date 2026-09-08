create policy "Players can view their own captain assignments"
on public.captain_assignments
for select
to authenticated
using (
    auth.uid() = user_id
);

create policy "Super Admins can view all captain assignments"
on public.captain_assignments
for select
to authenticated
using (
    public.is_active_super_admin()
);

create policy "Super Admins can create captain assignments"
on public.captain_assignments
for insert
to authenticated
with check (
    public.is_active_super_admin()
);

create policy "Super Admins can update captain assignments"
on public.captain_assignments
for update
to authenticated
using (
    public.is_active_super_admin()
)
with check (
    public.is_active_super_admin()
);

create policy "Super Admins can delete captain assignments"
on public.captain_assignments
for delete
to authenticated
using (
    public.is_active_super_admin()
);