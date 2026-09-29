-- ============================================================================
-- DCC App Scorer — Start Innings
-- ============================================================================
--
-- Purpose
-- -------
-- Move an App Scorer match from match-day setup into live scoring.
--
-- This RPC:
--   1. Requires an authenticated user with App Scorer authority.
--   2. Locks the scoring session.
--   3. Requires the session to still be in Setup or Ready.
--   4. Requires a completed toss.
--   5. Derives innings-one batting/bowling sides from the toss.
--   6. Validates striker, non-striker and opening bowler.
--   7. Creates innings one directly as InProgress.
--   8. Marks the three opening participants as PARTICIPATED.
--   9. Moves the scoring session to InProgress.
--
-- Important architecture
-- ----------------------
-- The TypeScript cricket engine does NOT have an INNINGS_STARTED action event.
-- Therefore this RPC does not manufacture one.
--
-- scoring_innings.started_at is the durable record that innings one started.
--
-- The first persisted cricket-engine event will be the first DELIVERY, whose
-- payload contains:
--   strikerId
--   nonStrikerId
--   bowlerId
--
-- Published Team Selection remains intention.
-- match_participants remains match-day reality.
--
-- Opposition players remain match-scoped participants and are never inserted
-- into public.players.
-- ============================================================================


create or replace function public.start_app_scorer_innings(
  target_scoring_session_id uuid,
  target_striker_participant_id uuid,
  target_non_striker_participant_id uuid,
  target_bowler_participant_id uuid,
  target_scheduled_balls integer default null
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
  toss_winner_side_id uuid;
  toss_decision text;

  side_one_id uuid;
  side_two_id uuid;

  batting_side_id uuid;
  bowling_side_id uuid;

  striker_side_id uuid;
  striker_role text;
  striker_status text;

  non_striker_side_id uuid;
  non_striker_role text;
  non_striker_status text;

  bowler_side_id uuid;
  bowler_role text;
  bowler_status text;

  new_innings_id uuid;
  existing_innings_id uuid;
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

  if target_scheduled_balls is not null
     and target_scheduled_balls <= 0 then
    raise exception 'Scheduled balls must be greater than zero.';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock scoring session
  -- --------------------------------------------------------------------------

  select
    ss.status,
    ss.match_id,
    ss.toss_winner_side_id,
    ss.toss_decision
  into
    session_status,
    session_match_id,
    toss_winner_side_id,
    toss_decision
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then
    raise exception 'Scoring session not found.';
  end if;


  -- --------------------------------------------------------------------------
  -- App Scorer authority / match eligibility
  -- --------------------------------------------------------------------------

  if not public.can_use_app_scorer(
    session_match_id
  ) then
    raise exception 'You do not have permission to use App Scorer for this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Session lifecycle
  -- --------------------------------------------------------------------------

  if session_status not in ('Setup', 'Ready') then
    raise exception
      'Innings can only be started while the scoring session is in Setup or Ready.';
  end if;


  -- --------------------------------------------------------------------------
  -- Toss must be complete
  -- --------------------------------------------------------------------------

  if toss_winner_side_id is null
     or toss_decision is null then
    raise exception 'The toss must be recorded before starting the innings.';
  end if;


  -- --------------------------------------------------------------------------
  -- Exactly two match sides must exist
  -- --------------------------------------------------------------------------

  select ms.side_id
  into side_one_id
  from public.match_sides ms
  where ms.scoring_session_id = target_scoring_session_id
    and ms.side_number = 1;

  if side_one_id is null then
    raise exception 'Match side 1 is missing.';
  end if;

  select ms.side_id
  into side_two_id
  from public.match_sides ms
  where ms.scoring_session_id = target_scoring_session_id
    and ms.side_number = 2;

  if side_two_id is null then
    raise exception 'Match side 2 is missing.';
  end if;

  if (
    select count(*)
    from public.match_sides ms
    where ms.scoring_session_id = target_scoring_session_id
  ) <> 2 then
    raise exception 'App Scorer requires exactly two match sides.';
  end if;

  if toss_winner_side_id <> side_one_id
     and toss_winner_side_id <> side_two_id then
    raise exception 'Toss winner does not belong to this scoring session.';
  end if;


  -- --------------------------------------------------------------------------
  -- Derive innings-one batting and bowling sides from toss
  -- --------------------------------------------------------------------------

  if toss_decision = 'Bat' then
    batting_side_id := toss_winner_side_id;

    if toss_winner_side_id = side_one_id then
      bowling_side_id := side_two_id;
    else
      bowling_side_id := side_one_id;
    end if;

  elsif toss_decision = 'Bowl' then
    bowling_side_id := toss_winner_side_id;

    if toss_winner_side_id = side_one_id then
      batting_side_id := side_two_id;
    else
      batting_side_id := side_one_id;
    end if;

  else
    raise exception 'Unsupported toss decision.';
  end if;


  -- --------------------------------------------------------------------------
  -- Prevent a duplicate innings-one start
  -- --------------------------------------------------------------------------

  select si.innings_id
  into existing_innings_id
  from public.scoring_innings si
  where si.scoring_session_id = target_scoring_session_id
    and si.innings_number = 1;

  if existing_innings_id is not null then
    raise exception 'Innings one has already been created for this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Validate striker
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

  if striker_side_id <> batting_side_id then
    raise exception 'Opening striker must belong to the batting side.';
  end if;

  if striker_role <> 'PLAYING' then
    raise exception 'Opening striker must be a playing participant.';
  end if;

  if striker_status = 'REMOVED' then
    raise exception 'Opening striker has been removed from this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Validate non-striker
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

  if non_striker_side_id <> batting_side_id then
    raise exception 'Opening non-striker must belong to the batting side.';
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

  if bowler_side_id <> bowling_side_id then
    raise exception 'Opening bowler must belong to the bowling side.';
  end if;

  if bowler_role <> 'PLAYING' then
    raise exception 'Opening bowler must be a playing participant.';
  end if;

  if bowler_status = 'REMOVED' then
    raise exception 'Opening bowler has been removed from this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Create innings one directly as InProgress
  --
  -- No INNINGS_STARTED engine event is written. The innings row is the durable
  -- lifecycle record; the first DELIVERY will be the first engine event.
  -- --------------------------------------------------------------------------

  insert into public.scoring_innings (
    scoring_session_id,
    innings_number,
    batting_side_id,
    bowling_side_id,
    status,
    scheduled_balls,
    target_runs,
    started_at
  )
  values (
    target_scoring_session_id,
    1,
    batting_side_id,
    bowling_side_id,
    'InProgress',
    target_scheduled_balls,
    null,
    started_timestamp
  )
  returning innings_id
  into new_innings_id;


  -- --------------------------------------------------------------------------
  -- Match-day reality
  --
  -- Only participants who are definitely participating at this point are
  -- promoted to PARTICIPATED. Other selected players remain AVAILABLE until
  -- their actual participation is established.
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
  -- Session enters live scoring
  -- --------------------------------------------------------------------------

  update public.scoring_sessions
  set
    status = 'InProgress',
    started_at = coalesce(started_at, started_timestamp),
    active_scorer_id = current_user_id
  where scoring_session_id = target_scoring_session_id;


  return new_innings_id;
end;
$$;


-- ============================================================================
-- Permissions
-- ============================================================================

revoke all on function public.start_app_scorer_innings(
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) from public;

revoke all on function public.start_app_scorer_innings(
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) from anon;

grant execute on function public.start_app_scorer_innings(
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) to authenticated;