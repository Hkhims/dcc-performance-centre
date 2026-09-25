-- DCC Portal / App
-- Fix match-selection add-player audit fields.
--
-- The selection-order migration replaced add_player_to_match_selection()
-- so Playing players could be appended using selection_order.
--
-- That replacement accidentally stopped populating the existing
-- NOT NULL audit fields added_by and updated_by.
--
-- This migration preserves the selection-order behaviour while restoring
-- the authenticated-user audit trail.
--
-- selection_order remains presentation order only. It is NOT an official
-- batting position or scorecard/statistical batting-order field.


create or replace function public.add_player_to_match_selection(
  target_selection_id bigint,
  target_player_id text,
  target_batting_position integer default null,
  target_selection_role text default 'Playing'
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
  target_player_active boolean := false;
  normalised_selection_role text;
  next_selection_order integer;
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


  if normalised_selection_role = 'Playing' then
    select coalesce(max(msp.selection_order), 0) + 1
    into next_selection_order
    from public.match_selection_players msp
    where msp.selection_id = target_selection_id
      and msp.selection_role = 'Playing';
  else
    next_selection_order := null;
  end if;


  insert into public.match_selection_players (
    selection_id,
    player_id,
    batting_position,
    selection_role,
    selection_order,
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
    case
      when normalised_selection_role = 'Playing'
        then target_batting_position
      else null
    end,
    normalised_selection_role,
    next_selection_order,
    false,
    false,
    now(),
    current_user_id,
    now(),
    current_user_id
    );


  update public.match_selections
  set
    updated_by = current_user_id,
    updated_at = now()
  where selection_id = target_selection_id;

end;
$$;


-- Reassert controlled execution privileges.

revoke all
on function public.add_player_to_match_selection(
  bigint,
  text,
  integer,
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