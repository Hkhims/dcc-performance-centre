create table public.notifications (
  id bigint generated always as identity primary key,

  user_id uuid not null
    references public.user_profiles(user_id)
    on update cascade
    on delete cascade,

  notification_type text not null,

  entity_type text,
  entity_id text,

  title text not null,
  message text,

  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx
  on public.notifications(user_id);

create index notifications_user_created_at_idx
  on public.notifications(user_id, created_at desc);

create index notifications_user_unread_idx
  on public.notifications(user_id)
  where read_at is null;

alter table public.notifications
  enable row level security;


create policy "Users can view their own notifications"
on public.notifications
for select
to authenticated
using (
  auth.uid() = user_id
);


create policy "Users can mark their own notifications as read"
on public.notifications
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


create policy "Super Admins can view all notifications"
on public.notifications
for select
to authenticated
using (
  public.is_active_super_admin()
);