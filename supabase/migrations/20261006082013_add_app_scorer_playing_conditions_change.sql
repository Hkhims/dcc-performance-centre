-- ============================================================================
-- DCC App Scorer — playing conditions changes
--
-- Allows the active scorer to revise the scheduled overs/balls for an innings
-- while preserving the change in the immutable scoring-event ledger.
--
-- The ledger event and scoring_innings.scheduled_balls update are committed
-- atomically so replay and persisted innings configuration cannot disagree.
-- ============================================================================

create or replace function public.record_app_scorer_playing_conditions_changed(
  target_event_id uuid,
  target_scoring_session_id uuid,
  target_innings_id uuid,
  target_sequence_key bigint,
  target_scheduled_legal_balls integer,
  target_current_legal_balls integer,
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
  innings_status text;
  current_scheduled_balls integer;

  playing_conditions_payload jsonb;

  existing_session_id uuid;
  existing_innings_id uuid;
  existing_sequence_key bigint;
  existing_event_type text;
  existing_payload jsonb;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_event_id is null
     or target_scoring_session_id is null
     or target_innings_id is null
     or target_sequence_key is null
     or target_sequence_key <= 0
     or target_scheduled_legal_balls is null
     or target_scheduled_legal_balls <= 0
     or target_occurred_at is null then
    raise exception
      'A valid event, session, innings, sequence, scheduled ball limit and timestamp are required.';
  end if;

  -- V1 exposes scheduled limits as whole overs only.
  if target_scheduled_legal_balls % 6 <> 0 then
    raise exception 'The scheduled ball limit must represent a whole number of overs.';
  end if;

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
    raise exception 'The scoring session is not InProgress.';
  end if;

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can change the playing conditions.';
  end if;

  select
    si.scoring_session_id,
    si.status,
    si.scheduled_balls
  into
    innings_session_id,
    innings_status,
    current_scheduled_balls
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
    raise exception 'The innings is not InProgress.';
  end if;

  playing_conditions_payload := jsonb_build_object(
    'id', target_event_id::text,
    'type', 'PLAYING_CONDITIONS_CHANGED',
    'scheduledLegalBalls', target_scheduled_legal_balls
  );

  -- An exact retry of a successfully persisted request is idempotent.
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
       and existing_event_type = 'PLAYING_CONDITIONS_CHANGED'
       and existing_payload = playing_conditions_payload then
      return target_event_id;
    end if;

    raise exception
      'The supplied event ID already exists with different scoring-event data.';
  end if;

  if current_scheduled_balls is not null
     and current_scheduled_balls = target_scheduled_legal_balls then
    raise exception 'The innings already has that scheduled ball limit.';
  end if;

  if target_current_legal_balls is null
     or target_current_legal_balls < 0 then
    raise exception 'A valid current legal-ball count is required.';
  end if;

  if target_scheduled_legal_balls < target_current_legal_balls then
    raise exception
      'The revised scheduled limit cannot be below the number of legal balls already bowled.';
  end if;

  -- Sequence keys remain unique within an innings.
  if exists (
    select 1
    from public.scoring_events se
    where se.innings_id = target_innings_id
      and se.sequence_key = target_sequence_key
  ) then
    raise exception 'The supplied sequence key is already in use for this innings.';
  end if;

  insert into public.scoring_events (
    event_id,
    scoring_session_id,
    innings_id,
    sequence_key,
    event_type,
    payload,
    occurred_at,
    client_created_at,
    device_id,
    created_by
  )
  values (
    target_event_id,
    target_scoring_session_id,
    target_innings_id,
    target_sequence_key,
    'PLAYING_CONDITIONS_CHANGED',
    playing_conditions_payload,
    target_occurred_at,
    target_client_created_at,
    target_device_id,
    current_user_id
  );

  update public.scoring_innings
  set
    scheduled_balls = target_scheduled_legal_balls,
    updated_at = now()
  where innings_id = target_innings_id;

  return target_event_id;
end;
$$;

revoke all
on function public.record_app_scorer_playing_conditions_changed(
  uuid,
  uuid,
  uuid,
  bigint,
  integer,
  integer,
  timestamptz,
  timestamptz,
  uuid
)
from public;

grant execute
on function public.record_app_scorer_playing_conditions_changed(
  uuid,
  uuid,
  uuid,
  bigint,
  integer,
  integer,
  timestamptz,
  timestamptz,
  uuid
)
to authenticated;