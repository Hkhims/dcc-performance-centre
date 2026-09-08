alter table public.user_profiles
drop constraint if exists user_profiles_player_id_key;

create unique index user_profiles_one_active_account_per_player
    on public.user_profiles (player_id)
    where status = 'Active';