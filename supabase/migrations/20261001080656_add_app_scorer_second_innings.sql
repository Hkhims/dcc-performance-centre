-- ============================================================================
-- DCC App Scorer — Start Second Innings
-- ============================================================================
--
-- Purpose
-- -------
-- Move an App Scorer match from the innings break into innings two.
--
-- The authoritative first-innings total is derived by the TypeScript cricket
-- engine and supplied as target_first_innings_runs. PostgreSQL does not
-- independently reimplement cricket scoring.
--
-- This RPC owns the durable lifecycle transition. It:
--   1. Requires an authenticated user with App Scorer authority.
--   2. Locks the scoring session.
--   3. Requires the session to be InProgress.
--   4. Requires innings one to be Completed.
--   5. Requires the supplied first-innings total to be non-negative.
--   6. Reverses the innings-one batting and bowling sides.
--   7. Inherits the innings-one scheduled ball limit.
--   8. Sets the chase target to first-innings runs + 1.
--   9. Validates the opening batters and opening bowler.
--  10. Creates innings two directly as InProgress.
--  11. Marks the opening participants as PARTICIPATED.
--
-- Important architecture
-- ----------------------
-- The TypeScript cricket engine remains authoritative for cricket scoring.
-- This RPC validates lifecycle, ownership, sides and participants, and persists
-- the second-innings structure.
--
-- No INNINGS_STARTED event is manufactured because the cricket engine has no
-- such event. scoring_innings.started_at is the durable lifecycle record.
-- ============================================================================

create or replace function public.start_app_scorer_second_innings(
  target_scoring_session_id uuid,
  target_striker_participant_id uuid,
  target_non_striker_participant_id uuid,
  target_bowler_participant_id uuid,
  target_first_innings_runs integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  session_status text;
  session_match_id text;
  session_active_scorer_id uuid;

  first_innings_id uuid;
  first_innings_status text;
  first_batting_side_id uuid;
  first_bowling_side_id uuid;
  first_scheduled_balls integer;

  second_batting_side_id uuid;
  second_bowling_side_id uuid;

  striker_side_id uuid;
  striker_role text;
  striker_status text;

  non_striker_side_id uuid;
  non_striker_role text;
  non_striker_status text;

  bowler_side_id uuid;
  bowler_role text;
  bowler_status text;

  existing_second_innings_id uuid;
  new_innings_id uuid;
  started_timestamp timestamptz := now();
begin
  -- --------------------------------------------------------------------------
  -- Authentication
  -- --------------------------------------------------------------------------

  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;


  -- --------------------------------------------------------------------------
  -- Basic argument validation
  -- --------------------------------------------------------------------------

  if target_scoring_session_id is null then
    raise exception 'Scoring session is required.';
  end if;

  if target_striker_participant_id is null then
    raise exception 'Opening striker is required.';
  end if;

  if target_non_striker_participant_id is null then
    raise exception 'Opening non-striker is required.';
  end if;

  if target_bowler_participant_id is null then
    raise exception 'Opening bowler is required.';
  end if;

  if target_striker_participant_id = target_non_striker_participant_id then
    raise exception 'Striker and non-striker must be different participants.';
  end if;

  if target_first_innings_runs is null
     or target_first_innings_runs < 0 then
    raise exception 'First-innings runs must be zero or greater.';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock scoring session
  -- --------------------------------------------------------------------------

  select
    ss.status,
    ss.match_id,
    ss.active_scorer_id
  into
    session_status,
    session_match_id,
    session_active_scorer_id
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then
    raise exception 'Scoring session not found.';
  end if;


  -- --------------------------------------------------------------------------
  -- App Scorer authority / match eligibility
  -- --------------------------------------------------------------------------

  if not public.can_use_app_scorer(session_match_id) then
    raise exception 'You do not have permission to use App Scorer for this match.';
  end if;

  if session_status <> 'InProgress' then
    raise exception 'Second innings can only be started while the scoring session is in progress.';
  end if;

  if session_active_scorer_id is not null
     and session_active_scorer_id <> current_user_id then
    raise exception 'Only the active scorer can start the second innings.';
  end if;


  -- --------------------------------------------------------------------------
  -- Innings one must exist and be completed
  -- --------------------------------------------------------------------------

  select
    si.innings_id,
    si.status,
    si.batting_side_id,
    si.bowling_side_id,
    si.scheduled_balls
  into
    first_innings_id,
    first_innings_status,
    first_batting_side_id,
    first_bowling_side_id,
    first_scheduled_balls
  from public.scoring_innings si
  where si.scoring_session_id = target_scoring_session_id
    and si.innings_number = 1
  for update;

  if not found then
    raise exception 'Innings one has not been created for this match.';
  end if;

  if first_innings_status <> 'Completed' then
    raise exception 'Innings one must be completed before innings two can start.';
  end if;


  -- --------------------------------------------------------------------------
  -- Prevent duplicate innings two
  -- --------------------------------------------------------------------------

  select si.innings_id
  into existing_second_innings_id
  from public.scoring_innings si
  where si.scoring_session_id = target_scoring_session_id
    and si.innings_number = 2;

  if existing_second_innings_id is not null then
    raise exception 'Innings two has already been created for this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Reverse the sides
  -- --------------------------------------------------------------------------

  second_batting_side_id := first_bowling_side_id;
  second_bowling_side_id := first_batting_side_id;


  -- --------------------------------------------------------------------------
  -- Validate opening striker
  -- --------------------------------------------------------------------------

  select
    mp.side_id,
    mp.participant_role,
    mp.participation_status
  into
    striker_side_id,
    striker_role,
    striker_status
  from public.match_participants mp
  where mp.match_participant_id = target_striker_participant_id
    and mp.scoring_session_id = target_scoring_session_id;

  if not found then
    raise exception 'Opening striker does not belong to this scoring session.';
  end if;

  if striker_side_id <> second_batting_side_id then
    raise exception 'Opening striker must belong to the innings-two batting side.';
  end if;

  if striker_role <> 'PLAYING' then
    raise exception 'Opening striker must be a playing participant.';
  end if;

  if striker_status = 'REMOVED' then
    raise exception 'Opening striker has been removed from this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Validate opening non-striker
  -- --------------------------------------------------------------------------

  select
    mp.side_id,
    mp.participant_role,
    mp.participation_status
  into
    non_striker_side_id,
    non_striker_role,
    non_striker_status
  from public.match_participants mp
  where mp.match_participant_id = target_non_striker_participant_id
    and mp.scoring_session_id = target_scoring_session_id;

  if not found then
    raise exception 'Opening non-striker does not belong to this scoring session.';
  end if;

  if non_striker_side_id <> second_batting_side_id then
    raise exception 'Opening non-striker must belong to the innings-two batting side.';
  end if;

  if non_striker_role <> 'PLAYING' then
    raise exception 'Opening non-striker must be a playing participant.';
  end if;

  if non_striker_status = 'REMOVED' then
    raise exception 'Opening non-striker has been removed from this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Validate opening bowler
  -- --------------------------------------------------------------------------

  select
    mp.side_id,
    mp.participant_role,
    mp.participation_status
  into
    bowler_side_id,
    bowler_role,
    bowler_status
  from public.match_participants mp
  where mp.match_participant_id = target_bowler_participant_id
    and mp.scoring_session_id = target_scoring_session_id;

  if not found then
    raise exception 'Opening bowler does not belong to this scoring session.';
  end if;

  if bowler_side_id <> second_bowling_side_id then
    raise exception 'Opening bowler must belong to the innings-two bowling side.';
  end if;

  if bowler_role <> 'PLAYING' then
    raise exception 'Opening bowler must be a playing participant.';
  end if;

  if bowler_status = 'REMOVED' then
    raise exception 'Opening bowler has been removed from this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Create innings two directly as InProgress
  -- --------------------------------------------------------------------------

    insert into public.scoring_innings (
    scoring_session_id,
    innings_number,
    batting_side_id,
    bowling_side_id,
    status,
    scheduled_balls,
    target_runs,
    started_at,
    opening_striker_participant_id,
    opening_non_striker_participant_id,
    opening_bowler_participant_id
  )
  values (
    target_scoring_session_id,
    2,
    second_batting_side_id,
    second_bowling_side_id,
    'InProgress',
    first_scheduled_balls,
    target_first_innings_runs + 1,
    started_timestamp,
    target_striker_participant_id,
    target_non_striker_participant_id,
    target_bowler_participant_id
  )
  returning innings_id
  into new_innings_id;


  -- --------------------------------------------------------------------------
  -- Match-day reality
  -- --------------------------------------------------------------------------

  update public.match_participants
  set participation_status = 'PARTICIPATED'
  where scoring_session_id = target_scoring_session_id
    and match_participant_id in (
      target_striker_participant_id,
      target_non_striker_participant_id,
      target_bowler_participant_id
    );


  -- --------------------------------------------------------------------------
  -- Keep the current user as the active scorer
  -- --------------------------------------------------------------------------

  update public.scoring_sessions
  set active_scorer_id = current_user_id
  where scoring_session_id = target_scoring_session_id;


  return new_innings_id;
end;
$$;


-- ============================================================================
-- Permissions
-- ============================================================================

revoke all on function public.start_app_scorer_second_innings(
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) from public;

revoke all on function public.start_app_scorer_second_innings(
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) from anon;

grant execute on function public.start_app_scorer_second_innings(
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) to authenticated;