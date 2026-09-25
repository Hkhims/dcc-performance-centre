-- DCC Portal / App
-- Team-selection transport marker + previous-team copy
--
-- Principles:
--   * "Car" is fixture-specific logistical information only.
--   * No minimum number of cars is required.
--   * Car status does not affect selection validity or eligibility.
--   * "Use Last Team" copies the most recent previous Published
--     selection for the same DCC team into a new independent Draft.
--   * Existing match-selection authority remains the single source
--     of truth for Super Admin, match-specific admin and Team Admin.


-- ============================================================
-- 1. Fixture-specific car marker
-- ============================================================

alter table public.match_selection_players
add column if not exists has_car boolean not null default false;


-- ============================================================
-- 2. Set / unset car marker
-- ============================================================

create or replace function public.set_match_selection_player_car(
  target_selection_id bigint,
  target_player_id text,
  target_has_car boolean
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

  if target_has_car is null then
    raise exception 'Car status is required.';
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

  if not exists (
    select 1
    from public.match_selection_players msp
    where msp.selection_id = target_selection_id
      and msp.player_id = target_player_id
  ) then
    raise exception
      'This player is not in the selection.';
  end if;

  update public.match_selection_players
  set
    has_car = target_has_car,
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
-- 3. Create Draft from most recent previous Published team
-- ============================================================

create or replace function public.create_match_selection_from_previous(
  target_match_id text,
  target_team_id text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  target_match_date date;
  target_match_status text;
  team_is_on_match boolean := false;
  existing_selection_id bigint;
  previous_selection_id bigint;
  new_selection_id bigint;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_match_id is null
     or btrim(target_match_id) = '' then
    raise exception 'Match ID is required.';
  end if;

  if target_team_id is null
     or btrim(target_team_id) = '' then
    raise exception 'Team ID is required.';
  end if;

  if not public.can_manage_match_selection(
    target_match_id,
    target_team_id
  ) then
    raise exception
      'You do not have permission to manage selection for this match.';
  end if;

  select
    m.match_date,
    m.status
  into
    target_match_date,
    target_match_status
  from public.matches m
  where m.match_id = target_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if target_match_status <> 'Scheduled' then
    raise exception
      'Team selection can only be created for a scheduled match.';
  end if;

  select exists (
    select 1
    from public.match_team_entries mte
    where mte.match_id = target_match_id
      and mte.team_id = target_team_id
  )
  into team_is_on_match;

  if not team_is_on_match then
    raise exception
      'The selected DCC team is not linked to this match.';
  end if;

  select ms.selection_id
  into existing_selection_id
  from public.match_selections ms
  where ms.match_id = target_match_id
    and ms.team_id = target_team_id
  limit 1;

  if existing_selection_id is not null then
    return existing_selection_id;
  end if;

  select ms.selection_id
  into previous_selection_id
  from public.match_selections ms
  join public.matches m
    on m.match_id = ms.match_id
  where ms.team_id = target_team_id
    and ms.status = 'Published'
    and ms.match_id <> target_match_id
    and m.match_date < target_match_date
  order by
    m.match_date desc,
    ms.published_at desc nulls last,
    ms.selection_id desc
  limit 1;

  if previous_selection_id is null then
    raise exception
      'No previous published team is available to copy.';
  end if;

  insert into public.match_selections (
    match_id,
    team_id,
    status,
    created_by,
    created_at,
    updated_by,
    updated_at
  )
  values (
    target_match_id,
    target_team_id,
    'Draft',
    current_user_id,
    now(),
    current_user_id,
    now()
  )
  returning selection_id
  into new_selection_id;

  insert into public.match_selection_players (
    selection_id,
    player_id,
    batting_position,
    selection_role,
    selection_order,
    is_captain,
    is_wicketkeeper,
    has_car,
    added_at,
    added_by,
    updated_at,
    updated_by
  )
  select
    new_selection_id,
    previous_player.player_id,
    null,
    previous_player.selection_role,
    case
      when previous_player.selection_role = 'Playing'
        then previous_player.selection_order
      else null
    end,
    previous_player.is_captain,
    previous_player.is_wicketkeeper,
    previous_player.has_car,
    now(),
    current_user_id,
    now(),
    current_user_id
  from public.match_selection_players previous_player
  join public.players p
    on p.player_id = previous_player.player_id
  where previous_player.selection_id = previous_selection_id
    and p.active = true;

  return new_selection_id;
end;
$$;


-- ============================================================
-- 4. Function privileges
-- ============================================================

revoke all
on function public.set_match_selection_player_car(
  bigint,
  text,
  boolean
)
from public;


revoke all
on function public.create_match_selection_from_previous(
  text,
  text
)
from public;


grant execute
on function public.set_match_selection_player_car(
  bigint,
  text,
  boolean
)
to authenticated;


grant execute
on function public.create_match_selection_from_previous(
  text,
  text
)
to authenticated;