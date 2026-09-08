create policy "Players can view their own profile"
on public.user_profiles
for select
to authenticated
using (
    auth.uid() = user_id
);