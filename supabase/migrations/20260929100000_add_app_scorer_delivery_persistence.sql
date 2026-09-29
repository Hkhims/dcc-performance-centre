-- ============================================================================
-- DCC App Scorer — Delivery Persistence
-- ============================================================================
--
-- Purpose
-- -------
-- Persist real cricket-engine DELIVERY events into the durable scoring ledger.
--
-- This migration also aligns the database event vocabulary with the current
-- TypeScript cricket engine by adding:
--
--   OVER_ENDED
--   EVENT_VOIDED
--   EVENT_REPLACED
--
-- Architecture
-- ------------
-- scoring_events is the durable event ledger.
--
-- event_id is supplied by the scorer client/device and provides idempotency.
-- Re-sending the same event ID with the same event is safe.
--
-- sequence_key provides authoritative ordering within a scoring session.
--
-- The database validates structural and match-context correctness.
-- Cricket scoring consequences are calculated by the TypeScript engine.
-- ============================================================================


-- ============================================================================
-- 1. Align persisted event vocabulary with the cricket engine
-- ============================================================================

alter table public.scoring_events
  drop constraint scoring_events_type_check;

alter table public.scoring_events
  add constraint scoring_events_type_check
  check (
    event_type = any (
      array[
        'DELIVERY'::text,
        'INNINGS_STARTED'::text,
        'INNINGS_ENDED'::text,
        'OVER_ENDED'::text,
        'BATTER_RETIRED'::text,
        'BATTER_RETURNED'::text,
        'BREAK_STARTED'::text,
        'BREAK_ENDED'::text,
        'PLAYING_CONDITIONS_CHANGED'::text,
        'TARGET_REVISED'::text,
        'WICKETKEEPER_CHANGED'::text,
        'PENALTY_RUNS'::text,
        'SCORER_HANDOVER'::text,
        'EVENT_VOIDED'::text,
        'EVENT_REPLACED'::text,
        'MATCH_ABANDONED'::text,
        'MATCH_COMPLETED'::text
      ]
    )
  );


-- ============================================================================
-- 2. Persist one App Scorer delivery
-- ============================================================================

create or replace function public.record_app_scorer_delivery(
  target_event_id uuid,
  target_scoring_session_id uuid,
  target_innings_id uuid,
  target_sequence_key bigint,
  target_striker_participant_id uuid,
  target_non_striker_participant_id uuid,
  target_bowler_participant_id uuid,
  target_bat_runs integer,
  target_extras jsonb default null,
  target_running jsonb default null,
  target_wicket jsonb default null,
  target_occurred_at timestamptz default now(),
  target_client_created_at timestamptz default null,
  target_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  session_match_id text;
  session_status text;
  session_active_scorer_id uuid;

  innings_session_id uuid;
  innings_batting_side_id uuid;
  innings_bowling_side_id uuid;
  innings_status text;

  striker_side_id uuid;
  striker_role text;
  striker_status text;

  non_striker_side_id uuid;
  non_striker_role text;
  non_striker_status text;

  bowler_side_id uuid;
  bowler_role text;
  bowler_status text;

  delivery_payload jsonb;

  existing_session_id uuid;
  existing_innings_id uuid;
  existing_sequence_key bigint;
  existing_event_type text;
  existing_payload jsonb;
begin
  -- --------------------------------------------------------------------------
  -- Authentication
  -- --------------------------------------------------------------------------

  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;


  -- --------------------------------------------------------------------------
  -- Basic event validation
  -- --------------------------------------------------------------------------

  if target_event_id is null then
    raise exception 'Event ID is required.';
  end if;

  if target_scoring_session_id is null then
    raise exception 'Scoring session is required.';
  end if;

  if target_innings_id is null then
    raise exception 'Innings is required.';
  end if;

  if target_sequence_key is null
     or target_sequence_key <= 0 then
    raise exception 'Sequence key must be greater than zero.';
  end if;

  if target_striker_participant_id is null then
    raise exception 'Striker is required.';
  end if;

  if target_non_striker_participant_id is null then
    raise exception 'Non-striker is required.';
  end if;

  if target_bowler_participant_id is null then
    raise exception 'Bowler is required.';
  end if;

  if target_striker_participant_id = target_non_striker_participant_id then
    raise exception 'Striker and non-striker must be different participants.';
  end if;

  if target_bat_runs is null
     or target_bat_runs not in (0, 1, 2, 3, 4, 5, 6) then
    raise exception 'Bat runs must be between 0 and 6.';
  end if;

  if target_occurred_at is null then
    raise exception 'Occurred-at timestamp is required.';
  end if;

  if target_extras is not null
     and jsonb_typeof(target_extras) <> 'object' then
    raise exception 'Extras must be a JSON object.';
  end if;

  if target_running is not null
     and jsonb_typeof(target_running) <> 'object' then
    raise exception 'Running details must be a JSON object.';
  end if;

  if target_wicket is not null
     and jsonb_typeof(target_wicket) <> 'object' then
    raise exception 'Wicket details must be a JSON object.';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock and validate scoring session
  -- --------------------------------------------------------------------------

  select
    ss.match_id,
    ss.status,
    ss.active_scorer_id
  into
    session_match_id,
    session_status,
    session_active_scorer_id
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then
    raise exception 'Scoring session not found.';
  end if;

  if not public.can_use_app_scorer(session_match_id) then
    raise exception 'You do not have permission to use App Scorer for this match.';
  end if;

  if session_status <> 'InProgress' then
    raise exception 'Deliveries can only be recorded while the scoring session is InProgress.';
  end if;

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can record deliveries for this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock and validate innings
  -- --------------------------------------------------------------------------

  select
    si.scoring_session_id,
    si.batting_side_id,
    si.bowling_side_id,
    si.status
  into
    innings_session_id,
    innings_batting_side_id,
    innings_bowling_side_id,
    innings_status
  from public.scoring_innings si
  where si.innings_id = target_innings_id
  for update;

  if not found then
    raise exception 'Innings not found.';
  end if;

  if innings_session_id <> target_scoring_session_id then
    raise exception 'Innings does not belong to this scoring session.';
  end if;

  if innings_status <> 'InProgress' then
    raise exception 'Deliveries can only be recorded in an InProgress innings.';
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
    raise exception 'Striker does not belong to this scoring session.';
  end if;

  if striker_side_id <> innings_batting_side_id then
    raise exception 'Striker must belong to the batting side.';
  end if;

  if striker_role <> 'PLAYING' then
    raise exception 'Striker must be a playing participant.';
  end if;

  if striker_status = 'REMOVED' then
    raise exception 'Striker has been removed from this match.';
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
    raise exception 'Non-striker does not belong to this scoring session.';
  end if;

  if non_striker_side_id <> innings_batting_side_id then
    raise exception 'Non-striker must belong to the batting side.';
  end if;

  if non_striker_role <> 'PLAYING' then
    raise exception 'Non-striker must be a playing participant.';
  end if;

  if non_striker_status = 'REMOVED' then
    raise exception 'Non-striker has been removed from this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Validate bowler
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
    raise exception 'Bowler does not belong to this scoring session.';
  end if;

  if bowler_side_id <> innings_bowling_side_id then
    raise exception 'Bowler must belong to the bowling side.';
  end if;

  if bowler_role <> 'PLAYING' then
    raise exception 'Bowler must be a playing participant.';
  end if;

  if bowler_status = 'REMOVED' then
    raise exception 'Bowler has been removed from this match.';
  end if;


  -- --------------------------------------------------------------------------
  -- Build the exact TypeScript DeliveryEvent payload shape
  --
  -- UUID participant IDs are serialised as strings in JSON, matching
  -- ParticipantId = string in the cricket engine.
  -- --------------------------------------------------------------------------

  delivery_payload :=
    jsonb_build_object(
      'id', target_event_id::text,
      'type', 'DELIVERY',
      'strikerId', target_striker_participant_id::text,
      'nonStrikerId', target_non_striker_participant_id::text,
      'bowlerId', target_bowler_participant_id::text,
      'batRuns', target_bat_runs
    );

  if target_extras is not null then
    delivery_payload :=
      delivery_payload ||
      jsonb_build_object('extras', target_extras);
  end if;

  if target_running is not null then
    delivery_payload :=
      delivery_payload ||
      jsonb_build_object('running', target_running);
  end if;

  if target_wicket is not null then
    delivery_payload :=
      delivery_payload ||
      jsonb_build_object('wicket', target_wicket);
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotency
  --
  -- event_id is generated by the scorer client/device.
  --
  -- If exactly the same event is retried, return the existing event ID.
  -- If the same UUID is reused for different event content/context, reject it.
  -- --------------------------------------------------------------------------

  select
    se.scoring_session_id,
    se.innings_id,
    se.sequence_key,
    se.event_type,
    se.payload
  into
    existing_session_id,
    existing_innings_id,
    existing_sequence_key,
    existing_event_type,
    existing_payload
  from public.scoring_events se
  where se.event_id = target_event_id;

  if found then
    if existing_session_id = target_scoring_session_id
       and existing_innings_id = target_innings_id
       and existing_sequence_key = target_sequence_key
       and existing_event_type = 'DELIVERY'
       and existing_payload = delivery_payload then
      return target_event_id;
    end if;

    raise exception 'Event ID has already been used for a different scoring event.';
  end if;


  -- --------------------------------------------------------------------------
  -- Persist the delivery
  --
  -- The unique (scoring_session_id, sequence_key) constraint remains the final
  -- concurrency guard against two different events occupying the same sequence.
  -- --------------------------------------------------------------------------

  insert into public.scoring_events (
    event_id,
    scoring_session_id,
    innings_id,
    sequence_key,
    event_type,
    payload,
    event_status,
    occurred_at,
    client_created_at,
    recorded_by,
    device_id
  )
  values (
    target_event_id,
    target_scoring_session_id,
    target_innings_id,
    target_sequence_key,
    'DELIVERY',
    delivery_payload,
    'Active',
    target_occurred_at,
    target_client_created_at,
    current_user_id,
    target_device_id
  );


  -- --------------------------------------------------------------------------
  -- Match-day reality
  --
  -- A player named in an actual delivery has now unquestionably participated.
  -- --------------------------------------------------------------------------

  update public.match_participants
  set participation_status = 'PARTICIPATED'
  where scoring_session_id = target_scoring_session_id
    and match_participant_id in (
      target_striker_participant_id,
      target_non_striker_participant_id,
      target_bowler_participant_id
    )
    and participation_status <> 'REMOVED';


  return target_event_id;
end;
$$;


-- ============================================================================
-- Permissions
-- ============================================================================

revoke all on function public.record_app_scorer_delivery(
  uuid,
  uuid,
  uuid,
  bigint,
  uuid,
  uuid,
  uuid,
  integer,
  jsonb,
  jsonb,
  jsonb,
  timestamptz,
  timestamptz,
  uuid
) from public;

revoke all on function public.record_app_scorer_delivery(
  uuid,
  uuid,
  uuid,
  bigint,
  uuid,
  uuid,
  uuid,
  integer,
  jsonb,
  jsonb,
  jsonb,
  timestamptz,
  timestamptz,
  uuid
) from anon;

grant execute on function public.record_app_scorer_delivery(
  uuid,
  uuid,
  uuid,
  bigint,
  uuid,
  uuid,
  uuid,
  integer,
  jsonb,
  jsonb,
  jsonb,
  timestamptz,
  timestamptz,
  uuid
) to authenticated;