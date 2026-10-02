create or replace function public.record_app_scorer_break_started(
  target_event_id uuid,
  target_scoring_session_id uuid,
  target_innings_id uuid,
  target_sequence_key bigint,
  target_reason text,
  target_note text default null,
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

  cleaned_note text;
  break_payload jsonb;

  existing_session_id uuid;
  existing_innings_id uuid;
  existing_sequence_key bigint;
  existing_event_type text;
  existing_payload jsonb;

  latest_break_event_type text;
begin
  current_user_id := auth.uid();
  cleaned_note := nullif(trim(target_note), '');

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_event_id is null
     or target_scoring_session_id is null
     or target_innings_id is null
     or target_sequence_key is null
     or target_sequence_key <= 0
     or target_occurred_at is null then
    raise exception
      'A valid event, session, innings, sequence and timestamp are required.';
  end if;

  if target_reason not in (
    'RAIN',
    'BAD_LIGHT',
    'INJURY',
    'DRINKS',
    'GROUND_CONDITIONS',
    'OTHER'
  ) then
    raise exception 'Invalid break reason.';
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
    raise exception
      'You do not have permission to use App Scorer for this match.';
  end if;

  if session_status <> 'InProgress' then
    raise exception 'The scoring session is not InProgress.';
  end if;

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can start a break.';
  end if;

  select
    si.scoring_session_id,
    si.status
  into
    innings_session_id,
    innings_status
  from public.scoring_innings si
  where si.innings_id = target_innings_id
  for update;

  if not found then
    raise exception 'Innings not found.';
  end if;

  if innings_session_id <> target_scoring_session_id then
    raise exception
      'Innings does not belong to this scoring session.';
  end if;

  if innings_status <> 'InProgress' then
    raise exception 'The innings is not InProgress.';
  end if;

  break_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'id', target_event_id::text,
      'type', 'BREAK_STARTED',
      'reason', target_reason,
      'note', cleaned_note
    )
  );

  -- Exact event retry is idempotent.
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
       and existing_event_type = 'BREAK_STARTED'
       and existing_payload = break_payload then
      return target_event_id;
    end if;

    raise exception
      'Event ID has already been used for a different scoring event.';
  end if;

  -- Determine the current persisted break state from the latest
  -- effective break event in this innings.
  select se.event_type
  into latest_break_event_type
  from public.scoring_events se
  where se.innings_id = target_innings_id
    and se.event_status = 'Active'
    and se.event_type in ('BREAK_STARTED', 'BREAK_ENDED')
  order by se.sequence_key desc
  limit 1;

  if latest_break_event_type = 'BREAK_STARTED' then
    raise exception 'A break is already in progress.';
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
    recorded_by,
    client_created_at,
    device_id
  ) values (
    target_event_id,
    target_scoring_session_id,
    target_innings_id,
    target_sequence_key,
    'BREAK_STARTED',
    break_payload,
    'Active',
    target_occurred_at,
    current_user_id,
    target_client_created_at,
    target_device_id
  );

  return target_event_id;
end;
$$;


create or replace function public.record_app_scorer_break_ended(
  target_event_id uuid,
  target_scoring_session_id uuid,
  target_innings_id uuid,
  target_sequence_key bigint,
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

  break_payload jsonb;

  existing_session_id uuid;
  existing_innings_id uuid;
  existing_sequence_key bigint;
  existing_event_type text;
  existing_payload jsonb;

  latest_break_event_type text;
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
     or target_occurred_at is null then
    raise exception
      'A valid event, session, innings, sequence and timestamp are required.';
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
    raise exception
      'You do not have permission to use App Scorer for this match.';
  end if;

  if session_status <> 'InProgress' then
    raise exception 'The scoring session is not InProgress.';
  end if;

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can end a break.';
  end if;

  select
    si.scoring_session_id,
    si.status
  into
    innings_session_id,
    innings_status
  from public.scoring_innings si
  where si.innings_id = target_innings_id
  for update;

  if not found then
    raise exception 'Innings not found.';
  end if;

  if innings_session_id <> target_scoring_session_id then
    raise exception
      'Innings does not belong to this scoring session.';
  end if;

  if innings_status <> 'InProgress' then
    raise exception 'The innings is not InProgress.';
  end if;

  break_payload := jsonb_build_object(
    'id', target_event_id::text,
    'type', 'BREAK_ENDED'
  );

  -- Exact event retry is idempotent.
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
       and existing_event_type = 'BREAK_ENDED'
       and existing_payload = break_payload then
      return target_event_id;
    end if;

    raise exception
      'Event ID has already been used for a different scoring event.';
  end if;

  select se.event_type
  into latest_break_event_type
  from public.scoring_events se
  where se.innings_id = target_innings_id
    and se.event_status = 'Active'
    and se.event_type in ('BREAK_STARTED', 'BREAK_ENDED')
  order by se.sequence_key desc
  limit 1;

  if latest_break_event_type is distinct from 'BREAK_STARTED' then
    raise exception 'There is no active break to end.';
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
    recorded_by,
    client_created_at,
    device_id
  ) values (
    target_event_id,
    target_scoring_session_id,
    target_innings_id,
    target_sequence_key,
    'BREAK_ENDED',
    break_payload,
    'Active',
    target_occurred_at,
    current_user_id,
    target_client_created_at,
    target_device_id
  );

  return target_event_id;
end;
$$;


revoke all on function public.record_app_scorer_break_started(
  uuid, uuid, uuid, bigint, text, text, timestamptz, timestamptz, uuid
) from public;

revoke all on function public.record_app_scorer_break_started(
  uuid, uuid, uuid, bigint, text, text, timestamptz, timestamptz, uuid
) from anon;

grant execute on function public.record_app_scorer_break_started(
  uuid, uuid, uuid, bigint, text, text, timestamptz, timestamptz, uuid
) to authenticated;


revoke all on function public.record_app_scorer_break_ended(
  uuid, uuid, uuid, bigint, timestamptz, timestamptz, uuid
) from public;

revoke all on function public.record_app_scorer_break_ended(
  uuid, uuid, uuid, bigint, timestamptz, timestamptz, uuid
) from anon;

grant execute on function public.record_app_scorer_break_ended(
  uuid, uuid, uuid, bigint, timestamptz, timestamptz, uuid
) to authenticated;