-- Fix the App Scorer playing-conditions RPC to use the scoring_events
-- audit column recorded_by rather than the non-existent created_by column.

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
  existing_scheduled_balls integer;
  existing_session_id uuid;
  existing_innings_id uuid;
  existing_sequence_key bigint;
  existing_event_type text;
  existing_payload jsonb;
  conditions_payload jsonb;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if target_event_id is null
     or target_scoring_session_id is null
     or target_innings_id is null
     or target_sequence_key is null
     or target_scheduled_legal_balls is null
     or target_current_legal_balls is null
     or target_occurred_at is null then
    raise exception 'Playing-conditions event details are incomplete.';
  end if;

  if target_sequence_key <= 0 then
    raise exception 'Sequence key must be greater than zero.';
  end if;

  if target_scheduled_legal_balls <= 0
     or target_scheduled_legal_balls % 6 <> 0 then
    raise exception
      'The scheduled ball limit must represent a positive whole number of overs.';
  end if;

  if target_current_legal_balls < 0 then
    raise exception 'A valid current legal-ball count is required.';
  end if;

  if target_scheduled_legal_balls < target_current_legal_balls then
    raise exception
      'The revised scheduled limit cannot be below the number of legal balls already bowled.';
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
    raise exception 'You are not authorised to score this match.';
  end if;

  if session_status <> 'InProgress' then
    raise exception 'The scoring session is not InProgress.';
  end if;

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'You are not the active scorer for this match.';
  end if;

  select
    si.scoring_session_id,
    si.status,
    si.scheduled_balls
  into
    innings_session_id,
    innings_status,
    existing_scheduled_balls
  from public.scoring_innings si
  where si.innings_id = target_innings_id
  for update;

  if not found then
    raise exception 'Scoring innings not found.';
  end if;

  if innings_session_id <> target_scoring_session_id then
    raise exception
      'The innings does not belong to this scoring session.';
  end if;

  if innings_status <> 'InProgress' then
    raise exception 'The innings is not InProgress.';
  end if;

  conditions_payload := jsonb_build_object(
    'id', target_event_id::text,
    'type', 'PLAYING_CONDITIONS_CHANGED',
    'scheduledLegalBalls', target_scheduled_legal_balls
  );

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
       and existing_payload = conditions_payload then
      return target_event_id;
    end if;

    raise exception
      'Event ID has already been used for a different scoring event.';
  end if;

  if existing_scheduled_balls = target_scheduled_legal_balls then
    raise exception
      'The innings already has this scheduled ball limit.';
  end if;

  if exists (
    select 1
    from public.scoring_events se
    where se.scoring_session_id = target_scoring_session_id
      and se.innings_id = target_innings_id
      and se.sequence_key = target_sequence_key
  ) then
    raise exception
      'Sequence key has already been used for this innings.';
  end if;

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
  ) values (
    target_event_id,
    target_scoring_session_id,
    target_innings_id,
    target_sequence_key,
    'PLAYING_CONDITIONS_CHANGED',
    conditions_payload,
    'Active',
    target_occurred_at,
    target_client_created_at,
    current_user_id,
    target_device_id
  );

  update public.scoring_innings
  set
    scheduled_balls = target_scheduled_legal_balls,
    updated_at = now()
  where innings_id = target_innings_id;

  return target_event_id;
end;
$$;

revoke all on function public.record_app_scorer_playing_conditions_changed(
  uuid,
  uuid,
  uuid,
  bigint,
  integer,
  integer,
  timestamptz,
  timestamptz,
  uuid
) from public;

revoke all on function public.record_app_scorer_playing_conditions_changed(
  uuid,
  uuid,
  uuid,
  bigint,
  integer,
  integer,
  timestamptz,
  timestamptz,
  uuid
) from anon;

grant execute on function public.record_app_scorer_playing_conditions_changed(
  uuid,
  uuid,
  uuid,
  bigint,
  integer,
  integer,
  timestamptz,
  timestamptz,
  uuid
) to authenticated;