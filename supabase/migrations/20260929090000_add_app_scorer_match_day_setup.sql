-- ============================================================================
-- DCC Portal / App
-- App Scorer match-day setup operations
--
-- Purpose:
--   Provide controlled RPCs for the setup phase between Start Match and
--   Start Innings.
--
-- Principles:
--   * Published Team Selection is never rewritten by scorer setup.
--   * match_participants records match-day scoring reality.
--   * DCC participants remain canonical DCC players.
--   * Opposition players are match-scoped EXTERNAL participants.
--   * Toss information belongs to the durable scoring session.
--   * Only an authorised manager of an eligible App Scorer match may mutate
--     scorer setup.
-- ============================================================================


-- ============================================================================
-- Set DCC participant status
--
-- Start Match preloads Published Playing players as AVAILABLE.
-- This RPC lets match-day setup confirm that a player participated or remove
-- them from the scorer's active participant pool without changing the
-- Published Team Selection.
-- ============================================================================

create or replace function public.set_app_scorer_dcc_participant_status(
  target_scoring_session_id uuid,
  target_match_participant_id uuid,
  target_participation_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  target_match_id text;
  target_session_status text;

  participant_type_value text;
  participant_role_value text;

  normalised_status text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_scoring_session_id is null then
    raise exception 'Scoring session ID is required.';
  end if;

  if target_match_participant_id is null then
    raise exception 'Match participant ID is required.';
  end if;

  normalised_status :=
    case lower(btrim(coalesce(target_participation_status, '')))
      when 'available' then 'AVAILABLE'
      when 'participated' then 'PARTICIPATED'
      when 'removed' then 'REMOVED'
      else null
    end;

  if normalised_status is null then
    raise exception
      'Participation status must be AVAILABLE, PARTICIPATED or REMOVED.';
  end if;

  select
    ss.match_id,
    ss.status
  into
    target_match_id,
    target_session_status
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then
    raise exception 'Scoring session not found.';
  end if;

  if not public.can_use_app_scorer(target_match_id) then
    raise exception
      'You do not have permission to manage App Scorer for this match.';
  end if;

  if target_session_status not in ('Setup', 'Ready') then
    raise exception
      'DCC participant setup can only be changed before scoring begins.';
  end if;

  select
    mp.participant_type,
    mp.participant_role
  into
    participant_type_value,
    participant_role_value
  from public.match_participants mp
  where mp.match_participant_id = target_match_participant_id
    and mp.scoring_session_id = target_scoring_session_id;

  if not found then
    raise exception
      'Match participant was not found in this scoring session.';
  end if;

  if participant_type_value <> 'DCC' then
    raise exception
      'This operation may only update DCC participants.';
  end if;

  if participant_role_value <> 'PLAYING' then
    raise exception
      'This operation may only update Playing participants.';
  end if;

  update public.match_participants
  set participation_status = normalised_status
  where match_participant_id = target_match_participant_id
    and scoring_session_id = target_scoring_session_id;
end;
$$;


-- ============================================================================
-- Add opposition player
--
-- Opposition identities are deliberately match-scoped. This RPC MUST NOT
-- create a row in public.players.
-- ============================================================================

create or replace function public.add_app_scorer_opposition_player(
  target_scoring_session_id uuid,
  target_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  target_match_id text;
  target_session_status text;

  opposition_side_id uuid;
  opposition_side_count integer;

  normalised_display_name text;

  new_participant_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_scoring_session_id is null then
    raise exception 'Scoring session ID is required.';
  end if;

  normalised_display_name :=
    nullif(btrim(coalesce(target_display_name, '')), '');

  if normalised_display_name is null then
    raise exception 'Opposition player name is required.';
  end if;

  select
    ss.match_id,
    ss.status
  into
    target_match_id,
    target_session_status
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then
    raise exception 'Scoring session not found.';
  end if;

  if not public.can_use_app_scorer(target_match_id) then
    raise exception
      'You do not have permission to manage App Scorer for this match.';
  end if;

  if target_session_status not in ('Setup', 'Ready') then
    raise exception
      'Opposition players can only be added before scoring begins.';
  end if;

  select count(*)
  into opposition_side_count
  from public.match_sides ms
  where ms.scoring_session_id = target_scoring_session_id
    and ms.side_type = 'EXTERNAL';

  if opposition_side_count <> 1 then
    raise exception
      'Exactly one external opposition side is required.';
  end if;

  select ms.side_id
  into opposition_side_id
  from public.match_sides ms
  where ms.scoring_session_id = target_scoring_session_id
    and ms.side_type = 'EXTERNAL'
  limit 1;

  insert into public.match_participants (
    scoring_session_id,
    side_id,
    participant_type,
    dcc_player_id,
    display_name,
    participant_role,
    participation_status,
    created_by
  )
  values (
    target_scoring_session_id,
    opposition_side_id,
    'EXTERNAL',
    null,
    normalised_display_name,
    'PLAYING',
    'AVAILABLE',
    current_user_id
  )
  returning match_participant_id
  into new_participant_id;

  return new_participant_id;
end;
$$;


-- ============================================================================
-- Set toss
--
-- The winner side must already belong to this scoring session. The persistence
-- foundation trigger independently enforces the same-session relationship.
-- ============================================================================

create or replace function public.set_app_scorer_toss(
  target_scoring_session_id uuid,
  target_toss_winner_side_id uuid,
  target_toss_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  target_match_id text;
  target_session_status text;

  normalised_decision text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_scoring_session_id is null then
    raise exception 'Scoring session ID is required.';
  end if;

  if target_toss_winner_side_id is null then
    raise exception 'Toss winner is required.';
  end if;

  normalised_decision :=
    case lower(btrim(coalesce(target_toss_decision, '')))
      when 'bat' then 'Bat'
      when 'bowl' then 'Bowl'
      else null
    end;

  if normalised_decision is null then
    raise exception 'Toss decision must be Bat or Bowl.';
  end if;

  select
    ss.match_id,
    ss.status
  into
    target_match_id,
    target_session_status
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then
    raise exception 'Scoring session not found.';
  end if;

  if not public.can_use_app_scorer(target_match_id) then
    raise exception
      'You do not have permission to manage App Scorer for this match.';
  end if;

  if target_session_status not in ('Setup', 'Ready') then
    raise exception
      'The toss can only be changed before scoring begins.';
  end if;

  if not exists (
    select 1
    from public.match_sides ms
    where ms.side_id = target_toss_winner_side_id
      and ms.scoring_session_id = target_scoring_session_id
  ) then
    raise exception
      'Toss winner must belong to this scoring session.';
  end if;

  update public.scoring_sessions
  set
    toss_winner_side_id = target_toss_winner_side_id,
    toss_decision = normalised_decision
  where scoring_session_id = target_scoring_session_id;
end;
$$;


-- ============================================================================
-- Function permissions
-- ============================================================================

revoke all
on function public.set_app_scorer_dcc_participant_status(uuid, uuid, text)
from public;

revoke all
on function public.set_app_scorer_dcc_participant_status(uuid, uuid, text)
from anon;

grant execute
on function public.set_app_scorer_dcc_participant_status(uuid, uuid, text)
to authenticated;


revoke all
on function public.add_app_scorer_opposition_player(uuid, text)
from public;

revoke all
on function public.add_app_scorer_opposition_player(uuid, text)
from anon;

grant execute
on function public.add_app_scorer_opposition_player(uuid, text)
to authenticated;


revoke all
on function public.set_app_scorer_toss(uuid, uuid, text)
from public;

revoke all
on function public.set_app_scorer_toss(uuid, uuid, text)
from anon;

grant execute
on function public.set_app_scorer_toss(uuid, uuid, text)
to authenticated;
