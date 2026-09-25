-- Add presentation ordering to match team selections.
--
-- selection_order controls how Playing players are displayed in a
-- pre-match team selection. It is NOT an official batting position
-- and must not be used as scorecard/statistical batting-order data.
--
-- Reserve players do not participate in the Playing Team order.

alter table public.match_selection_players
add column selection_order integer;

alter table public.match_selection_players
add constraint match_selection_players_selection_order_check
check (
  selection_order is null
  or selection_order >= 1
);

-- Give existing Playing rows a deterministic order.
with ordered_players as (
  select
    selection_id,
    player_id,
    row_number() over (
      partition by selection_id
      order by player_id
    )::integer as new_selection_order
  from public.match_selection_players
  where selection_role = 'Playing'
)
update public.match_selection_players as msp
set selection_order = ordered_players.new_selection_order
from ordered_players
where msp.selection_id = ordered_players.selection_id
  and msp.player_id = ordered_players.player_id;

-- Reserves never occupy a Playing Team position.
update public.match_selection_players
set selection_order = null
where selection_role = 'Reserve';

create unique index
  match_selection_players_unique_playing_order
on public.match_selection_players (
  selection_id,
  selection_order
)
where selection_role = 'Playing'
  and selection_order is not null;


-- Replace add-player RPC so Playing players are appended to the
-- bottom of the Playing Team automatically.
drop function if exists public.add_player_to_match_selection(
  bigint,
  text,
  integer,
  text
);

create or replace function public.add_player_to_match_selection(
  target_selection_id bigint,
  target_player_id text,
  target_batting_position integer default null,
  target_selection_role text default 'Playing'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selection_row public.match_selections%rowtype;
  next_selection_order integer;
begin
  if target_player_id is null
     or btrim(target_player_id) = '' then
    raise exception 'A valid player is required.';
  end if;

  if target_selection_role not in ('Playing', 'Reserve') then
    raise exception 'Selection role must be Playing or Reserve.';
  end if;

  select *
  into selection_row
  from public.match_selections
  where selection_id = target_selection_id;

  if not found then
    raise exception 'Team selection not found.';
  end if;

  if selection_row.status <> 'Draft' then
    raise exception 'Only Draft selections can be changed.';
  end if;

  if not public.can_manage_match_selection(
    selection_row.match_id,
    selection_row.team_id
  ) then
    raise exception 'You do not have permission to manage this team selection.';
  end if;

  if not exists (
    select 1
    from public.players
    where player_id = target_player_id
      and active = true
  ) then
    raise exception 'Player is not an active DCC player.';
  end if;

  if exists (
    select 1
    from public.match_selection_players
    where selection_id = target_selection_id
      and player_id = target_player_id
  ) then
    raise exception 'Player is already in this team selection.';
  end if;

  if target_selection_role = 'Reserve'
     and target_batting_position is not null then
    raise exception 'Reserve players cannot have a batting position.';
  end if;

  if target_selection_role = 'Playing' then
    select coalesce(max(selection_order), 0) + 1
    into next_selection_order
    from public.match_selection_players
    where selection_id = target_selection_id
      and selection_role = 'Playing';
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
    is_wicketkeeper
  )
  values (
    target_selection_id,
    target_player_id,
    case
      when target_selection_role = 'Playing'
        then target_batting_position
      else null
    end,
    target_selection_role,
    next_selection_order,
    false,
    false
  );
end;
$$;


-- Replace role-change RPC so moving between Playing and Reserve
-- also maintains Playing Team ordering.
create or replace function public.set_match_selection_player_role(
  target_selection_id bigint,
  target_player_id text,
  target_selection_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selection_row public.match_selections%rowtype;
  player_row public.match_selection_players%rowtype;
  next_selection_order integer;
begin
  if target_selection_role not in ('Playing', 'Reserve') then
    raise exception 'Selection role must be Playing or Reserve.';
  end if;

  select *
  into selection_row
  from public.match_selections
  where selection_id = target_selection_id;

  if not found then
    raise exception 'Team selection not found.';
  end if;

  if selection_row.status <> 'Draft' then
    raise exception 'Only Draft selections can be changed.';
  end if;

  if not public.can_manage_match_selection(
    selection_row.match_id,
    selection_row.team_id
  ) then
    raise exception 'You do not have permission to manage this team selection.';
  end if;

  select *
  into player_row
  from public.match_selection_players
  where selection_id = target_selection_id
    and player_id = target_player_id;

  if not found then
    raise exception 'Player is not in this team selection.';
  end if;

  if player_row.selection_role = target_selection_role then
    return;
  end if;

  if target_selection_role = 'Reserve' then
    if player_row.is_captain then
      raise exception 'Move the captain role to another Playing player first.';
    end if;

    if player_row.is_wicketkeeper then
      raise exception 'Move the wicketkeeper role to another Playing player first.';
    end if;

    update public.match_selection_players
    set
      selection_role = 'Reserve',
      selection_order = null,
      batting_position = null
    where selection_id = target_selection_id
      and player_id = target_player_id;

    -- Close the gap left in the Playing Team order.
-- First move the remaining positions into a temporary range so
-- the unique Playing Team order cannot collide while renumbering.
update public.match_selection_players
set selection_order = selection_order + 1000
where selection_id = target_selection_id
  and selection_role = 'Playing'
  and selection_order is not null;

with reordered as (
  select
    player_id,
    row_number() over (
      order by selection_order, player_id
    )::integer as new_selection_order
  from public.match_selection_players
  where selection_id = target_selection_id
    and selection_role = 'Playing'
)
update public.match_selection_players as msp
set selection_order = reordered.new_selection_order
from reordered
where msp.selection_id = target_selection_id
  and msp.player_id = reordered.player_id;

  else
    select coalesce(max(selection_order), 0) + 1
    into next_selection_order
    from public.match_selection_players
    where selection_id = target_selection_id
      and selection_role = 'Playing';

    update public.match_selection_players
    set
      selection_role = 'Playing',
      selection_order = next_selection_order,
      batting_position = null
    where selection_id = target_selection_id
      and player_id = target_player_id;
  end if;
end;
$$;


-- Move one Playing player up or down by swapping its order with
-- the adjacent Playing player.
create or replace function public.move_match_selection_player(
  target_selection_id bigint,
  target_player_id text,
  target_direction text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selection_row public.match_selections%rowtype;
  player_row public.match_selection_players%rowtype;
  adjacent_player_id text;
  adjacent_order integer;
  temporary_order integer;
begin
  if target_direction not in ('Up', 'Down') then
    raise exception 'Direction must be Up or Down.';
  end if;

  select *
  into selection_row
  from public.match_selections
  where selection_id = target_selection_id;

  if not found then
    raise exception 'Team selection not found.';
  end if;

  if selection_row.status <> 'Draft' then
    raise exception 'Only Draft selections can be reordered.';
  end if;

  if not public.can_manage_match_selection(
    selection_row.match_id,
    selection_row.team_id
  ) then
    raise exception 'You do not have permission to manage this team selection.';
  end if;

  select *
  into player_row
  from public.match_selection_players
  where selection_id = target_selection_id
    and player_id = target_player_id;

  if not found then
    raise exception 'Player is not in this team selection.';
  end if;

  if player_row.selection_role <> 'Playing' then
    raise exception 'Only Playing players can be reordered.';
  end if;

  if player_row.selection_order is null then
    raise exception 'Playing player does not have a selection order.';
  end if;

  if target_direction = 'Up' then
    select player_id, selection_order
    into adjacent_player_id, adjacent_order
    from public.match_selection_players
    where selection_id = target_selection_id
      and selection_role = 'Playing'
      and selection_order < player_row.selection_order
    order by selection_order desc
    limit 1;
  else
    select player_id, selection_order
    into adjacent_player_id, adjacent_order
    from public.match_selection_players
    where selection_id = target_selection_id
      and selection_role = 'Playing'
      and selection_order > player_row.selection_order
    order by selection_order asc
    limit 1;
  end if;

  -- Already at the top/bottom.
  if adjacent_player_id is null then
    return;
  end if;

  -- Use a temporary negative value so the partial unique index
  -- is never violated during the swap.
  temporary_order := (
  select coalesce(max(selection_order), 0) + 1000
  from public.match_selection_players
  where selection_id = target_selection_id
);

  update public.match_selection_players
  set selection_order = temporary_order
  where selection_id = target_selection_id
    and player_id = target_player_id;

  update public.match_selection_players
  set selection_order = player_row.selection_order
  where selection_id = target_selection_id
    and player_id = adjacent_player_id;

  update public.match_selection_players
  set selection_order = adjacent_order
  where selection_id = target_selection_id
    and player_id = target_player_id;
end;
$$;


revoke all on function public.add_player_to_match_selection(
  bigint,
  text,
  integer,
  text
) from public;

revoke all on function public.set_match_selection_player_role(
  bigint,
  text,
  text
) from public;

revoke all on function public.move_match_selection_player(
  bigint,
  text,
  text
) from public;

grant execute on function public.add_player_to_match_selection(
  bigint,
  text,
  integer,
  text
) to authenticated;

grant execute on function public.set_match_selection_player_role(
  bigint,
  text,
  text
) to authenticated;

grant execute on function public.move_match_selection_player(
  bigint,
  text,
  text
) to authenticated;