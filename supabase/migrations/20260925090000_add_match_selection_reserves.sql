-- DCC Portal / App
-- Match-selection reserve-player support
--
-- A selected player now has one of two roles:
--
--   Playing
--   Reserve
--
-- A player may appear only once in a match selection.
--
-- Reserve players:
--   * are optional;
--   * do not count as playing participants;
--   * cannot be Captain;
--   * cannot be Wicketkeeper;
--   * do not affect availability;
--   * do not become official match participants merely by being
--     included in the published selection.
--
-- batting_position remains in the database for backwards
-- compatibility but is no longer part of the Team Selection UI.


-- ============================================================
-- 1. Add selection role
-- ============================================================

alter table public.match_selection_players
add column selection_role text not null default 'Playing';


alter table public.match_selection_players
add constraint match_selection_players_role_check
check (
  selection_role in ('Playing', 'Reserve')
);


create index match_selection_players_role_idx
  on public.match_selection_players (
    selection_id,
    selection_role
  );


-- ============================================================
-- 2. Add player to selection
-- ============================================================
--
-- Replace the original three-argument function with a
-- role-aware version.
--
-- target_selection_role defaults to Playing so existing callers
-- remain conceptually compatible while the Portal is upgraded.
--
-- batting_position is retained as an argument for backwards
-- compatibility but the Team Selection UI will no longer use it.
-- ============================================================

drop function if exists
public.add_player_to_match_selection(bigint, text, integer);


create or replace function public.add_player_to_match_selection(
  target_selection_id bigint,
  target_player_id text,
  target_batting_position integer default null,
  target_selection_role text default 'Playing'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  target_match_id text;
  target_team_id text;
  target_selection_status text;
  target_player_active boolean := false;
  normalised_selection_role text;
  new_selection_player_id bigint;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;


  if target_selection_id is null then
    raise exception 'Selection ID is required.';
  end if;


  if target_player_id is null
     or btrim(target_player_id) = '' then
    raise exception 'Player ID is required.';
  end if;


  if target_batting_position is not null
     and target_batting_position < 1 then
    raise exception
      'Batting position must be 1 or greater.';
  end if;


  normalised_selection_role :=
    case
      when lower(btrim(coalesce(target_selection_role, ''))) = 'playing'
        then 'Playing'
      when lower(btrim(coalesce(target_selection_role, ''))) = 'reserve'
        then 'Reserve'
      else null
    end;


  if normalised_selection_role is null then
    raise exception
      'Selection role must be Playing or Reserve.';
  end if;


  if normalised_selection_role = 'Reserve'
     and target_batting_position is not null then
    raise exception
      'Reserve players cannot have a batting position.';
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
      'Only a draft selection can be edited.';
  end if;


  if not public.can_manage_match_selection(
    target_match_id,
    target_team_id
  ) then
    raise exception
      'You do not have permission to manage this selection.';
  end if;


  select p.active
  into target_player_active
  from public.players p
  where p.player_id = target_player_id;


  if not found then
    raise exception 'Player not found.';
  end if;


  if not coalesce(target_player_active, false) then
    raise exception
      'Only active DCC players can be selected.';
  end if;


  if exists (
    select 1
    from public.match_selection_players msp
    where msp.selection_id = target_selection_id
      and msp.player_id = target_player_id
  ) then
    raise exception
      'This player is already in the selection.';
  end if;


  if target_batting_position is not null
     and exists (
       select 1
       from public.match_selection_players msp
       where msp.selection_id = target_selection_id
         and msp.batting_position = target_batting_position
     ) then
    raise exception
      'That batting position is already assigned.';
  end if;


  insert into public.match_selection_players (
    selection_id,
    player_id,
    batting_position,
    selection_role,
    is_captain,
    is_wicketkeeper,
    added_at,
    added_by,
    updated_at,
    updated_by
  )
  values (
    target_selection_id,
    target_player_id,
    target_batting_position,
    normalised_selection_role,
    false,
    false,
    now(),
    current_user_id,
    now(),
    current_user_id
  )
  returning selection_player_id
  into new_selection_player_id;


  update public.match_selections
  set
    updated_by = current_user_id,
    updated_at = now()
  where selection_id = target_selection_id;


  return new_selection_player_id;
end;
$$;


-- ============================================================
-- 3. Change Playing / Reserve role
-- ============================================================
--
-- A Captain or Wicketkeeper cannot silently become a Reserve.
-- The Team Admin must first transfer those responsibilities.
-- ============================================================

create or replace function public.set_match_selection_player_role(
  target_selection_id bigint,
  target_player_id text,
  target_selection_role text
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
  normalised_selection_role text;
  target_is_captain boolean;
  target_is_wicketkeeper boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;


  if target_selection_id is null then
    raise exception 'Selection ID is required.';
  end if;


  if target_player_id is null
     or btrim(target_player_id) = '' then
    raise exception 'Player ID is required.';
  end if;


  normalised_selection_role :=
    case
      when lower(btrim(coalesce(target_selection_role, ''))) = 'playing'
        then 'Playing'
      when lower(btrim(coalesce(target_selection_role, ''))) = 'reserve'
        then 'Reserve'
      else null
    end;


  if normalised_selection_role is null then
    raise exception
      'Selection role must be Playing or Reserve.';
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
      'Only a draft selection can be edited.';
  end if;


  if not public.can_manage_match_selection(
    target_match_id,
    target_team_id
  ) then
    raise exception
      'You do not have permission to manage this selection.';
  end if;


  select
    msp.is_captain,
    msp.is_wicketkeeper
  into
    target_is_captain,
    target_is_wicketkeeper
  from public.match_selection_players msp
  where msp.selection_id = target_selection_id
    and msp.player_id = target_player_id;


  if not found then
    raise exception
      'This player is not in the selection.';
  end if;


  if normalised_selection_role = 'Reserve'
     and target_is_captain then
    raise exception
      'The Captain must be a playing player. Transfer the Captain role before moving this player to Reserve.';
  end if;


  if normalised_selection_role = 'Reserve'
     and target_is_wicketkeeper then
    raise exception
      'The Wicketkeeper must be a playing player. Transfer the Wicketkeeper role before moving this player to Reserve.';
  end if;


  update public.match_selection_players
  set
    selection_role = normalised_selection_role,
    batting_position =
      case
        when normalised_selection_role = 'Reserve'
          then null
        else batting_position
      end,
    updated_at = now(),
    updated_by = current_user_id
  where selection_id = target_selection_id
    and player_id = target_player_id;


  update public.match_selections
  set
    updated_by = current_user_id,
    updated_at = now()
  where selection_id = target_selection_id;
end;
$$;


-- ============================================================
-- 4. Captain must be a Playing player
-- ============================================================

create or replace function public.set_match_selection_captain(
  target_selection_id bigint,
  target_player_id text
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
  target_selection_role text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
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
      'Only a draft selection can be edited.';
  end if;


  if not public.can_manage_match_selection(
    target_match_id,
    target_team_id
  ) then
    raise exception
      'You do not have permission to manage this selection.';
  end if;


  select msp.selection_role
  into target_selection_role
  from public.match_selection_players msp
  where msp.selection_id = target_selection_id
    and msp.player_id = target_player_id;


  if not found then
    raise exception
      'Captain must be a selected player.';
  end if;


  if target_selection_role <> 'Playing' then
    raise exception
      'Captain must be a playing player.';
  end if;


  update public.match_selection_players
  set
    is_captain = false,
    updated_at = now(),
    updated_by = current_user_id
  where selection_id = target_selection_id
    and is_captain = true;


  update public.match_selection_players
  set
    is_captain = true,
    updated_at = now(),
    updated_by = current_user_id
  where selection_id = target_selection_id
    and player_id = target_player_id;


  update public.match_selections
  set
    updated_by = current_user_id,
    updated_at = now()
  where selection_id = target_selection_id;
end;
$$;


-- ============================================================
-- 5. Wicketkeeper must be a Playing player
-- ============================================================

create or replace function public.set_match_selection_wicketkeeper(
  target_selection_id bigint,
  target_player_id text
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
  target_selection_role text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
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
      'Only a draft selection can be edited.';
  end if;


  if not public.can_manage_match_selection(
    target_match_id,
    target_team_id
  ) then
    raise exception
      'You do not have permission to manage this selection.';
  end if;


  select msp.selection_role
  into target_selection_role
  from public.match_selection_players msp
  where msp.selection_id = target_selection_id
    and msp.player_id = target_player_id;


  if not found then
    raise exception
      'Wicketkeeper must be a selected player.';
  end if;


  if target_selection_role <> 'Playing' then
    raise exception
      'Wicketkeeper must be a playing player.';
  end if;


  update public.match_selection_players
  set
    is_wicketkeeper = false,
    updated_at = now(),
    updated_by = current_user_id
  where selection_id = target_selection_id
    and is_wicketkeeper = true;


  update public.match_selection_players
  set
    is_wicketkeeper = true,
    updated_at = now(),
    updated_by = current_user_id
  where selection_id = target_selection_id
    and player_id = target_player_id;


  update public.match_selections
  set
    updated_by = current_user_id,
    updated_at = now()
  where selection_id = target_selection_id;
end;
$$;


-- ============================================================
-- 6. Publish selection
-- ============================================================
--
-- Only Playing players count towards publication validation.
--
-- Reserve players are optional and are not playing participants.
--
-- Availability remains completely independent of publication.
-- ============================================================

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
end;
$$;


-- ============================================================
-- 7. Function privileges
-- ============================================================

revoke all
on function public.add_player_to_match_selection(
  bigint,
  text,
  integer,
  text
)
from public;


revoke all
on function public.set_match_selection_player_role(
  bigint,
  text,
  text
)
from public;


grant execute
on function public.add_player_to_match_selection(
  bigint,
  text,
  integer,
  text
)
to authenticated;


grant execute
on function public.set_match_selection_player_role(
  bigint,
  text,
  text
)
to authenticated;


-- Reassert the existing controlled-function privileges after
-- replacing these functions.

revoke all
on function public.set_match_selection_captain(
  bigint,
  text
)
from public;


revoke all
on function public.set_match_selection_wicketkeeper(
  bigint,
  text
)
from public;


revoke all
on function public.publish_match_selection(
  bigint
)
from public;


grant execute
on function public.set_match_selection_captain(
  bigint,
  text
)
to authenticated;


grant execute
on function public.set_match_selection_wicketkeeper(
  bigint,
  text
)
to authenticated;


grant execute
on function public.publish_match_selection(
  bigint
)
to authenticated;