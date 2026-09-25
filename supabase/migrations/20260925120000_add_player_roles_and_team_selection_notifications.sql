-- DCC Portal / App
-- Canonical player roles and Team Selection publication notifications.
--
-- Player role:
--   - stored on the existing public.player_profiles.role column;
--   - may remain NULL when a role has not yet been chosen;
--   - may be changed by the player who owns that profile;
--   - may be changed by an Active Super Admin;
--   - Team Admin status alone does not permit changing another player's role.
--
-- Team Selection notifications:
--   - publication and notification creation happen in the same transaction;
--   - recipients are Active-account players who are either:
--       * active members of the relevant DCC team, or
--       * selected Playing players, or
--       * selected Reserve players;
--   - recipients are de-duplicated;
--   - first publication creates TeamSelectionPublished;
--   - re-publishing the same match does not create another first-publication
--     notification.
--
-- Existing player_profiles.photo_url is deliberately reused.
-- No duplicate role or photo storage is introduced.


-- ============================================================
-- 1. Canonical player-role values
-- ============================================================

alter table public.player_profiles
  drop constraint if exists player_profiles_role_check;

alter table public.player_profiles
  add constraint player_profiles_role_check
  check (
    role is null
    or role in (
      'Batter',
      'Pace Bowler',
      'Spin Bowler',
      'Batting Pace All-rounder',
      'Pace Bowling All-rounder',
      'Batting Spin All-rounder',
      'Spin Bowling All-rounder',
      'Wicketkeeper Batter'
    )
  );


-- ============================================================
-- 2. Controlled player-role update
-- ============================================================

create or replace function public.set_player_profile_role(
  target_player_id text,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  normalised_player_id text;
  normalised_role text;
  may_manage_role boolean := false;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  normalised_player_id := nullif(btrim(target_player_id), '');

  if normalised_player_id is null then
    raise exception 'Player ID is required.';
  end if;

  normalised_role :=
    case
      when target_role is null
        or btrim(target_role) = ''
        then null
      else btrim(target_role)
    end;

  if normalised_role is not null
     and normalised_role not in (
       'Batter',
       'Pace Bowler',
       'Spin Bowler',
       'Batting Pace All-rounder',
       'Pace Bowling All-rounder',
       'Batting Spin All-rounder',
       'Spin Bowling All-rounder',
       'Wicketkeeper Batter'
     ) then
    raise exception 'Invalid player role.';
  end if;

  if not exists (
    select 1
    from public.players p
    where p.player_id = normalised_player_id
  ) then
    raise exception 'Player not found.';
  end if;

  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = current_user_id
      and up.status = 'Active'
      and (
        up.account_role = 'Super Admin'
        or up.player_id = normalised_player_id
      )
  )
  into may_manage_role;

  if not may_manage_role then
    raise exception
      'You do not have permission to update this player role.';
  end if;

  insert into public.player_profiles (
    player_id,
    role,
    created_at,
    updated_at
  )
  values (
    normalised_player_id,
    normalised_role,
    now(),
    now()
  )
  on conflict (player_id)
  do update
    set role = excluded.role,
        updated_at = now();
end;
$$;


revoke all
on function public.set_player_profile_role(text, text)
from public;

revoke all
on function public.set_player_profile_role(text, text)
from anon;

grant execute
on function public.set_player_profile_role(text, text)
to authenticated;


-- ============================================================
-- 3. Team-announcement notification idempotency
-- ============================================================
--
-- There may be only one TeamSelectionPublished notification for
-- the same user and canonical match.
--
-- Other notification types are deliberately unaffected because
-- future match-start / innings / result notifications will have
-- their own event-specific idempotency rules.

create unique index if not exists
  notifications_team_selection_published_unique
on public.notifications (
  user_id,
  entity_id
)
where notification_type = 'TeamSelectionPublished'
  and entity_type = 'Match'
  and entity_id is not null;


-- ============================================================
-- 4. Internal helper: create first-publication notifications
-- ============================================================
--
-- This helper is intentionally NOT granted to authenticated users.
-- It is called by publish_match_selection() after the selection has
-- successfully become Published.
--
-- Because both operations happen inside the same PostgreSQL function
-- call/transaction, publication cannot succeed while notification
-- creation partially fails.

create or replace function public.create_team_selection_published_notifications(
  target_selection_id bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match_id text;
  target_team_id text;
  target_selection_status text;
  team_name_value text;
  fixture_label_value text;
  inserted_count integer := 0;
begin
  if target_selection_id is null then
    raise exception 'Selection ID is required.';
  end if;

  select
    ms.match_id,
    ms.team_id,
    ms.status
  into
    target_match_id,
    target_team_id,
    target_selection_status
  from public.match_selections ms
  where ms.selection_id = target_selection_id;

  if not found then
    raise exception 'Match selection not found.';
  end if;

  if target_selection_status <> 'Published' then
    raise exception
      'The team selection must be Published before notifications can be created.';
  end if;

  select t.team_name
  into team_name_value
  from public.teams t
  where t.team_id = target_team_id;

  if not found then
    raise exception 'DCC team not found.';
  end if;

  select m.fixture_label
  into fixture_label_value
  from public.matches m
  where m.match_id = target_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if fixture_label_value is null
     or btrim(fixture_label_value) = '' then
    fixture_label_value := team_name_value || ' fixture';
  end if;

  with recipient_players as (
    -- Current active members of the DCC team.
    select distinct tpm.player_id
    from public.team_player_memberships tpm
    join public.players p
      on p.player_id = tpm.player_id
    where tpm.team_id = target_team_id
      and tpm.active = true
      and p.active = true

    union

    -- Playing and Reserve players explicitly named in this selection.
    -- This ensures a player stepping up from another team still receives
    -- the announcement.
    select distinct msp.player_id
    from public.match_selection_players msp
    join public.players p
      on p.player_id = msp.player_id
    where msp.selection_id = target_selection_id
      and msp.selection_role in ('Playing', 'Reserve')
      and p.active = true
  ),
  recipient_users as (
    select distinct up.user_id
    from recipient_players rp
    join public.user_profiles up
      on up.player_id = rp.player_id
    where up.status = 'Active'
  ),
  inserted as (
    insert into public.notifications (
      user_id,
      notification_type,
      entity_type,
      entity_id,
      title,
      message
    )
    select
      ru.user_id,
      'TeamSelectionPublished',
      'Match',
      target_match_id,
      team_name_value || ' Team Announced',
      'Team for ' || fixture_label_value || ' has been announced.'
    from recipient_users ru
    on conflict do nothing
    returning id
  )
  select count(*)
  into inserted_count
  from inserted;

  return inserted_count;
end;
$$;


revoke all
on function public.create_team_selection_published_notifications(bigint)
from public;

revoke all
on function public.create_team_selection_published_notifications(bigint)
from anon;

revoke all
on function public.create_team_selection_published_notifications(bigint)
from authenticated;


-- ============================================================
-- 5. Publish selection + create announcement notifications
-- ============================================================
--
-- This replaces the current reserve-aware publication function.
--
-- Existing publication rules are preserved:
--   - selection must be Draft;
--   - caller must have canonical Team Selection authority;
--   - match must still be Scheduled;
--   - only Playing players count towards publication validation;
--   - at least one Playing player is required;
--   - exactly one Playing Captain is required;
--   - exactly one Playing Wicketkeeper is required;
--   - availability remains independent.
--
-- New behaviour:
--   - once the selection becomes Published, notification records are
--     generated before this database transaction completes.

create or replace function public.publish_match_selection(
  target_selection_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  target_match_id text;
  target_team_id text;
  target_selection_status text;
  target_match_status text;
  playing_player_count integer;
  captain_count integer;
  wicketkeeper_count integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_selection_id is null then
    raise exception 'Selection ID is required.';
  end if;

  select
    ms.match_id,
    ms.team_id,
    ms.status
  into
    target_match_id,
    target_team_id,
    target_selection_status
  from public.match_selections ms
  where ms.selection_id = target_selection_id
  for update;

  if not found then
    raise exception 'Match selection not found.';
  end if;

  if target_selection_status <> 'Draft' then
    raise exception
      'Only a draft selection can be published.';
  end if;

  if not public.can_manage_match_selection(
    target_match_id,
    target_team_id
  ) then
    raise exception
      'You do not have permission to publish this selection.';
  end if;

  select m.status
  into target_match_status
  from public.matches m
  where m.match_id = target_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if target_match_status <> 'Scheduled' then
    raise exception
      'Selection can only be published while the match is scheduled.';
  end if;

  select
    count(*) filter (
      where msp.selection_role = 'Playing'
    ),
    count(*) filter (
      where msp.selection_role = 'Playing'
        and msp.is_captain = true
    ),
    count(*) filter (
      where msp.selection_role = 'Playing'
        and msp.is_wicketkeeper = true
    )
  into
    playing_player_count,
    captain_count,
    wicketkeeper_count
  from public.match_selection_players msp
  where msp.selection_id = target_selection_id;

  if playing_player_count = 0 then
    raise exception
      'At least one playing player must be selected before publication.';
  end if;

  if captain_count <> 1 then
    raise exception
      'Exactly one playing player must be designated captain.';
  end if;

  if wicketkeeper_count <> 1 then
    raise exception
      'Exactly one playing player must be designated wicketkeeper.';
  end if;

  update public.match_selections
  set
    status = 'Published',
    published_by = current_user_id,
    published_at = now(),
    updated_by = current_user_id,
    updated_at = now()
  where selection_id = target_selection_id;

  perform public.create_team_selection_published_notifications(
    target_selection_id
  );
end;
$$;


-- ============================================================
-- 6. Reassert publication-function privileges
-- ============================================================

revoke all
on function public.publish_match_selection(bigint)
from public;

revoke all
on function public.publish_match_selection(bigint)
from anon;

grant execute
on function public.publish_match_selection(bigint)
to authenticated;