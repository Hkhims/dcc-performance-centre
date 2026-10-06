-- Allow signed-in Portal users to read and mark notifications as read.
--
-- Row-level security remains responsible for restricting access to each
-- user's own notifications. Notification creation remains server-controlled.

grant select, update
on table public.notifications
to authenticated;