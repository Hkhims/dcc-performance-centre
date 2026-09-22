-- =========================================================
-- Rename the ordinary DCC account role from Player to User
--
-- Player identity is represented separately by user_profiles.player_id.
-- A general DCC account may therefore exist without being a player.
-- =========================================================

alter table public.user_profiles
drop constraint user_profiles_account_role_check;

update public.user_profiles
set
    account_role = 'User',
    updated_at = now()
where account_role = 'Player';

alter table public.user_profiles
alter column account_role set default 'User';

alter table public.user_profiles
add constraint user_profiles_account_role_check
check (
    account_role in ('User', 'Super Admin')
);
