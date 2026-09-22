-- =========================================================
-- General DCC account lifecycle
--
-- Supabase Auth owns authentication.
-- public.user_profiles owns the DCC application account.
--
-- A newly registered auth user receives a general DCC
-- account automatically:
--
--   account_role = User
--   player_id    = NULL
--   status       = Invited until email confirmation
--
-- Once the email address is confirmed, an Invited account
-- becomes Active.
--
-- Disabled accounts are never automatically reactivated.
-- =========================================================


-- =========================================================
-- Create the DCC application profile for a new auth user
-- =========================================================

create or replace function public.handle_new_dcc_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    initial_status text;
    supplied_display_name text;
begin
    -- Normally email confirmation happens after signup, so the
    -- account begins as Invited.
    --
    -- If the auth user is already email-confirmed when inserted
    -- (for example in a development environment where email
    -- confirmation is disabled), the account may safely begin
    -- as Active.
    initial_status :=
        case
            when new.email_confirmed_at is not null
                then 'Active'
            else 'Invited'
        end;

    -- A display name may optionally be supplied by the signup
    -- client through Supabase Auth user metadata.
    supplied_display_name :=
        nullif(
            btrim(
                coalesce(
                    new.raw_user_meta_data ->> 'display_name',
                    ''
                )
            ),
            ''
        );

    insert into public.user_profiles (
        user_id,
        player_id,
        account_role,
        status,
        display_name
    )
    values (
        new.id,
        null,
        'User',
        initial_status,
        supplied_display_name
    );

    return new;
end;
$$;


-- =========================================================
-- Activate an Invited DCC account after email confirmation
-- =========================================================

create or replace function public.handle_dcc_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Only react to the first transition from an unconfirmed
    -- email address to a confirmed email address.
    if old.email_confirmed_at is null
       and new.email_confirmed_at is not null then

        update public.user_profiles
        set
            status = 'Active',
            updated_at = now()
        where user_id = new.id
          and status = 'Invited';

        -- The status predicate above is deliberate:
        --
        --   Invited -> Active
        --
        -- is allowed automatically, while a Disabled account
        -- can never be reactivated by an auth event.
    end if;

    return new;
end;
$$;


-- =========================================================
-- Auth lifecycle triggers
-- =========================================================

drop trigger if exists on_dcc_auth_user_created
on auth.users;

create trigger on_dcc_auth_user_created
after insert
on auth.users
for each row
execute function public.handle_new_dcc_auth_user();


drop trigger if exists on_dcc_email_confirmed
on auth.users;

create trigger on_dcc_email_confirmed
after update of email_confirmed_at
on auth.users
for each row
when (
    old.email_confirmed_at is null
    and new.email_confirmed_at is not null
)
execute function public.handle_dcc_email_confirmation();


-- =========================================================
-- Function privileges
--
-- These functions are trigger implementation details and
-- must not be callable directly through the API.
-- =========================================================

revoke all
on function public.handle_new_dcc_auth_user()
from public;

revoke all
on function public.handle_new_dcc_auth_user()
from anon;

revoke all
on function public.handle_new_dcc_auth_user()
from authenticated;


revoke all
on function public.handle_dcc_email_confirmation()
from public;

revoke all
on function public.handle_dcc_email_confirmation()
from anon;

revoke all
on function public.handle_dcc_email_confirmation()
from authenticated;