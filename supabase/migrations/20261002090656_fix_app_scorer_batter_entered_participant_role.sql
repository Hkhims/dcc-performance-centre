-- ============================================================================
-- DCC App Scorer — fix incoming-batter participant-role validation
-- ============================================================================

create or replace function public.record_app_scorer_batter_entered(
  target_event_id uuid,
  target_scoring_session_id uuid,
  target_innings_id uuid,
  target_sequence_key bigint,
  target_batter_participant_id uuid,
  target_end text,
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
  innings_status text;

  batter_side_id uuid;
  batter_role text;
  batter_status text;

  batter_payload jsonb;

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
     or target_batter_participant_id is null
     or target_occurred_at is null then
    raise exception 'A valid event, session, innings, sequence, batter and timestamp are required.';
  end if;

  if target_end not in ('STRIKER', 'NON_STRIKER') then
    raise exception 'Invalid batting end.';
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
    raise exception 'Only the active scorer can confirm an incoming batter.';
  end if;

  select
    si.scoring_session_id,
    si.batting_side_id,
    si.status
  into
    innings_session_id,
    innings_batting_side_id,
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
    raise exception 'The innings is not InProgress.';
  end if;

  select
    mp.side_id,
    mp.participant_role,
    mp.participation_status
  into
    batter_side_id,
    batter_role,
    batter_status
  from public.match_participants mp
  where mp.match_participant_id = target_batter_participant_id
    and mp.scoring_session_id = target_scoring_session_id;

  if not found then
    raise exception 'Incoming batter is not a participant in this scoring session.';
  end if;

  if batter_side_id <> innings_batting_side_id then
    raise exception 'Incoming batter does not belong to the batting side.';
  end if;

  if batter_role <> 'PLAYING' then
    raise exception 'Incoming batter must be a playing participant.';
  end if;

  if batter_status = 'REMOVED' then
    raise exception 'Removed participant cannot enter the innings.';
  end if;

  batter_payload := jsonb_build_object(
    'id', target_event_id::text,
    'type', 'BATTER_ENTERED',
    'batterId', target_batter_participant_id::text,
    'end', target_end
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
       and existing_event_type = 'BATTER_ENTERED'
       and existing_payload = batter_payload then
      return target_event_id;
    end if;

    raise exception 'Event ID has already been used for a different scoring event.';
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
  )
  values (
    target_event_id,
    target_scoring_session_id,
    target_innings_id,
    target_sequence_key,
    'BATTER_ENTERED',
    batter_payload,
    'Active',
    target_occurred_at,
    target_client_created_at,
    current_user_id,
    target_device_id
  );

  update public.match_participants
  set participation_status = 'PARTICIPATED'
  where scoring_session_id = target_scoring_session_id
    and match_participant_id = target_batter_participant_id
    and participation_status <> 'REMOVED';

  return target_event_id;
end;
$$;


revoke all on function public.record_app_scorer_batter_entered(
  uuid, uuid, uuid, bigint, uuid, text, timestamptz, timestamptz, uuid
) from public;

revoke all on function public.record_app_scorer_batter_entered(
  uuid, uuid, uuid, bigint, uuid, text, timestamptz, timestamptz, uuid
) from anon;

grant execute on function public.record_app_scorer_batter_entered(
  uuid, uuid, uuid, bigint, uuid, text, timestamptz, timestamptz, uuid
) to authenticated;