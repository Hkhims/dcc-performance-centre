-- ============================================================================
-- DCC App Scorer — Over completion and immutable undo
-- ============================================================================

create or replace function public.record_app_scorer_over_ended(
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
  over_payload jsonb;
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

  if target_event_id is null or target_scoring_session_id is null
     or target_innings_id is null or target_sequence_key is null
     or target_sequence_key <= 0 or target_occurred_at is null then
    raise exception 'A valid event, session, innings, sequence and timestamp are required.';
  end if;

  select ss.match_id, ss.status, ss.active_scorer_id
  into session_match_id, session_status, session_active_scorer_id
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then raise exception 'Scoring session not found.'; end if;
  if not public.can_use_app_scorer(session_match_id) then
    raise exception 'You do not have permission to use App Scorer for this match.';
  end if;
  if session_status <> 'InProgress' then
    raise exception 'The scoring session is not InProgress.';
  end if;
  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can end an over.';
  end if;

  select si.scoring_session_id, si.status
  into innings_session_id, innings_status
  from public.scoring_innings si
  where si.innings_id = target_innings_id
  for update;

  if not found then raise exception 'Innings not found.'; end if;
  if innings_session_id <> target_scoring_session_id then
    raise exception 'Innings does not belong to this scoring session.';
  end if;
  if innings_status <> 'InProgress' then
    raise exception 'The innings is not InProgress.';
  end if;

  over_payload := jsonb_build_object(
    'id', target_event_id::text,
    'type', 'OVER_ENDED'
  );

  select se.scoring_session_id, se.innings_id, se.sequence_key,
         se.event_type, se.payload
  into existing_session_id, existing_innings_id, existing_sequence_key,
       existing_event_type, existing_payload
  from public.scoring_events se
  where se.event_id = target_event_id;

  if found then
    if existing_session_id = target_scoring_session_id
       and existing_innings_id = target_innings_id
       and existing_sequence_key = target_sequence_key
       and existing_event_type = 'OVER_ENDED'
       and existing_payload = over_payload then
      return target_event_id;
    end if;
    raise exception 'Event ID has already been used for a different scoring event.';
  end if;

  insert into public.scoring_events (
    event_id, scoring_session_id, innings_id, sequence_key, event_type,
    payload, event_status, occurred_at, client_created_at, recorded_by, device_id
  ) values (
    target_event_id, target_scoring_session_id, target_innings_id,
    target_sequence_key, 'OVER_ENDED', over_payload, 'Active',
    target_occurred_at, target_client_created_at, current_user_id, target_device_id
  );

  return target_event_id;
end;
$$;

revoke all on function public.record_app_scorer_over_ended(
  uuid, uuid, uuid, bigint, timestamptz, timestamptz, uuid
) from public;
revoke all on function public.record_app_scorer_over_ended(
  uuid, uuid, uuid, bigint, timestamptz, timestamptz, uuid
) from anon;
grant execute on function public.record_app_scorer_over_ended(
  uuid, uuid, uuid, bigint, timestamptz, timestamptz, uuid
) to authenticated;


create or replace function public.undo_app_scorer_last_ball(
  target_correction_group_id uuid,
  target_scoring_session_id uuid,
  target_innings_id uuid,
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
  next_sequence bigint;
  latest_action_id uuid;
  latest_action_type text;
  delivery_event_id uuid;
  over_void_id uuid;
  void_payload jsonb;
begin
  current_user_id := auth.uid();
  if current_user_id is null then raise exception 'Authentication required.'; end if;

  if target_correction_group_id is null or target_scoring_session_id is null
     or target_innings_id is null or target_occurred_at is null then
    raise exception 'A correction ID, session, innings and timestamp are required.';
  end if;

  select ss.match_id, ss.status, ss.active_scorer_id
  into session_match_id, session_status, session_active_scorer_id
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then raise exception 'Scoring session not found.'; end if;
  if not public.can_use_app_scorer(session_match_id) then
    raise exception 'You do not have permission to use App Scorer for this match.';
  end if;
  if session_status <> 'InProgress' then raise exception 'The scoring session is not InProgress.'; end if;
  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can undo a delivery.';
  end if;

  select si.scoring_session_id, si.status
  into innings_session_id, innings_status
  from public.scoring_innings si
  where si.innings_id = target_innings_id
  for update;

  if not found then raise exception 'Innings not found.'; end if;
  if innings_session_id <> target_scoring_session_id then
    raise exception 'Innings does not belong to this scoring session.';
  end if;
  if innings_status <> 'InProgress' then raise exception 'The innings is not InProgress.'; end if;

  -- A retry of an already completed, authorised undo is safe.
  if exists (
    select 1 from public.scoring_events se
    where se.event_id = target_correction_group_id
      and se.scoring_session_id = target_scoring_session_id
      and se.innings_id = target_innings_id
      and se.event_type = 'EVENT_VOIDED'
  ) then
    return target_correction_group_id;
  end if;

  select coalesce(max(se.sequence_key), 0) + 1
  into next_sequence
  from public.scoring_events se
  where se.scoring_session_id = target_scoring_session_id;

  -- Find the latest non-correction action. If it is OVER_ENDED, void it too.
  select se.event_id, se.event_type
  into latest_action_id, latest_action_type
  from public.scoring_events se
  where se.scoring_session_id = target_scoring_session_id
    and se.innings_id = target_innings_id
    and se.event_type not in ('EVENT_VOIDED', 'EVENT_REPLACED')
    and not exists (
      select 1
      from public.scoring_events correction
      where correction.scoring_session_id = target_scoring_session_id
        and correction.innings_id = target_innings_id
        and correction.event_type = 'EVENT_VOIDED'
        and correction.payload ->> 'targetEventId' = se.event_id::text
    )
  order by se.sequence_key desc
  limit 1;

  if latest_action_id is null then
    raise exception 'There is no delivery to undo.';
  end if;

  if latest_action_type = 'OVER_ENDED' then
    over_void_id := gen_random_uuid();
    void_payload := jsonb_build_object(
      'id', over_void_id::text,
      'type', 'EVENT_VOIDED',
      'targetEventId', latest_action_id::text
    );

    insert into public.scoring_events (
      event_id, scoring_session_id, innings_id, sequence_key, event_type,
      payload, event_status, occurred_at, client_created_at, recorded_by, device_id
    ) values (
      over_void_id, target_scoring_session_id, target_innings_id,
      next_sequence, 'EVENT_VOIDED', void_payload, 'Active',
      target_occurred_at, target_client_created_at, current_user_id, target_device_id
    );

    next_sequence := next_sequence + 1;
  elsif latest_action_type <> 'DELIVERY' then
    raise exception 'The latest scoring action is not a delivery that can be undone.';
  end if;

  select se.event_id
  into delivery_event_id
  from public.scoring_events se
  where se.scoring_session_id = target_scoring_session_id
    and se.innings_id = target_innings_id
    and se.event_type = 'DELIVERY'
    and not exists (
      select 1
      from public.scoring_events correction
      where correction.scoring_session_id = target_scoring_session_id
        and correction.innings_id = target_innings_id
        and correction.event_type = 'EVENT_VOIDED'
        and correction.payload ->> 'targetEventId' = se.event_id::text
    )
  order by se.sequence_key desc
  limit 1;

  if delivery_event_id is null then
    raise exception 'There is no delivery to undo.';
  end if;

  void_payload := jsonb_build_object(
    'id', target_correction_group_id::text,
    'type', 'EVENT_VOIDED',
    'targetEventId', delivery_event_id::text
  );

  insert into public.scoring_events (
    event_id, scoring_session_id, innings_id, sequence_key, event_type,
    payload, event_status, occurred_at, client_created_at, recorded_by, device_id
  ) values (
    target_correction_group_id, target_scoring_session_id, target_innings_id,
    next_sequence, 'EVENT_VOIDED', void_payload, 'Active',
    target_occurred_at, target_client_created_at, current_user_id, target_device_id
  );

  return target_correction_group_id;
end;
$$;

revoke all on function public.undo_app_scorer_last_ball(
  uuid, uuid, uuid, timestamptz, timestamptz, uuid
) from public;
revoke all on function public.undo_app_scorer_last_ball(
  uuid, uuid, uuid, timestamptz, timestamptz, uuid
) from anon;
grant execute on function public.undo_app_scorer_last_ball(
  uuid, uuid, uuid, timestamptz, timestamptz, uuid
) to authenticated;
