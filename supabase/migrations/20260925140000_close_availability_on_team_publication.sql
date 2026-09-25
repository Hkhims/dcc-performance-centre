-- DCC Portal / App
-- Close availability when a Team Selection is published.
--
-- Product rule:
--   - Availability and Team Selection remain independent while planning.
--   - A Team Selection may be published whether or not an availability
--     poll exists.
--   - Once a team is Published, any Open availability poll for that same
--     match/team is automatically Closed.
--   - Returning a Published selection to Draft does NOT automatically
--     reopen availability.
--   - Availability cannot be reopened while the corresponding Team
--     Selection remains Published.
--
-- This prevents the contradictory state:
--
--     Team Published + Availability Open
--
-- Publication, availability closure and first-publication notification
-- creation all occur inside the same database transaction.


-- ============================================================
-- 1. Publish selection + close availability + notification
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


  -- Once the team is Published, availability has served its
  -- pre-selection purpose. Close any Open poll for this exact
  -- match/team.
  --
  -- If no poll exists, this is deliberately a no-op.
  -- If the poll is already Closed, its original closure audit
  -- information is deliberately preserved.

  update public.match_availability_polls
  set
    status = 'Closed',
    closed_at = now(),
    closed_by = current_user_id,
    updated_at = now()
  where match_id = target_match_id
    and team_id = target_team_id
    and status = 'Open';


  perform public.create_team_selection_published_notifications(
    target_selection_id
  );
end;
$$;


-- ============================================================
-- 2. Prevent availability reopening while team is Published
-- ============================================================

create or replace function public.reopen_match_availability(
  target_poll_id bigint
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
  target_poll_status text;
  target_match_status text;
  published_selection_exists boolean := false;
begin
  current_user_id := auth.uid();


  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;


  if target_poll_id is null then
    raise exception 'Poll ID is required.';
  end if;


  select
    map.match_id,
    map.team_id,
    map.status
  into
    target_match_id,
    target_team_id,
    target_poll_status
  from public.match_availability_polls map
  where map.poll_id = target_poll_id
  for update;


  if not found then
    raise exception 'Availability poll not found.';
  end if;


  if not public.can_manage_match_availability(
    target_match_id,
    target_team_id
  ) then
    raise exception
      'You do not have permission to manage this availability poll.';
  end if;


  if target_poll_status = 'Open' then
    raise exception
      'This availability poll is already open.';
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
      'Availability can only be re-opened while the match is scheduled.';
  end if;


  -- For a team-scoped poll, a Published selection for the same
  -- match/team blocks reopening.
  --
  -- A match-level/custom poll has team_id NULL. It therefore has no
  -- corresponding team-specific selection to test here.

  if target_team_id is not null then
    select exists (
      select 1
      from public.match_selections ms
      where ms.match_id = target_match_id
        and ms.team_id = target_team_id
        and ms.status = 'Published'
    )
    into published_selection_exists;


    if published_selection_exists then
      raise exception
        'Availability cannot be re-opened while the team selection is published. Return the team selection to Draft first.';
    end if;
  end if;


  update public.match_availability_polls
  set
    status = 'Open',
    closed_at = null,
    closed_by = null,
    updated_at = now()
  where poll_id = target_poll_id;
end;
$$;


-- ============================================================
-- 3. Reassert controlled function privileges
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


revoke all
on function public.reopen_match_availability(bigint)
from public;


revoke all
on function public.reopen_match_availability(bigint)
from anon;


grant execute
on function public.reopen_match_availability(bigint)
to authenticated;