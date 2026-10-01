-- ============================================================================
-- DCC App Scorer — neutral match completion foundation
--
-- App Scorer results are deliberately side-neutral. A result references the
-- two operational match_sides rather than assuming one side is DCC and the
-- other is an opposition side. This therefore works equally for:
--
--   DCC vs external opposition
--   DCC team vs DCC team
--   Internal side vs internal side
--
-- Cricket totals remain derived from the immutable scoring-event ledger by
-- the TypeScript cricket engine. This table persists the completed result;
-- it is not a second cricket rules engine.
-- ============================================================================


-- ============================================================================
-- Persisted neutral match result
-- ============================================================================

create table public.app_scorer_match_results (
  scoring_session_id uuid
    primary key
    references public.scoring_sessions(scoring_session_id)
    on delete cascade,

  result_type text
    not null,

  winner_side_id uuid
    references public.match_sides(side_id),

  loser_side_id uuid
    references public.match_sides(side_id),

  win_method text,

  run_margin integer,

  wicket_margin integer,

  abandonment_reason text,

  created_at timestamp with time zone
    not null
    default now(),

  updated_at timestamp with time zone
    not null
    default now(),

  constraint app_scorer_match_results_type_check
    check (
      result_type in (
        'WIN',
        'TIE',
        'ABANDONED'
      )
    ),

  constraint app_scorer_match_results_method_check
    check (
      win_method is null
      or win_method in (
        'RUNS',
        'CHASE'
      )
    ),

  constraint app_scorer_match_results_distinct_sides_check
    check (
      winner_side_id is null
      or loser_side_id is null
      or winner_side_id <> loser_side_id
    ),

  constraint app_scorer_match_results_shape_check
    check (
      (
        result_type = 'WIN'
        and winner_side_id is not null
        and loser_side_id is not null
        and (
          (
            win_method = 'RUNS'
            and run_margin is not null
            and run_margin > 0
            and wicket_margin is null
          )
          or
          (
            win_method = 'CHASE'
            and wicket_margin is not null
            and wicket_margin between 1 and 10
            and run_margin is null
          )
        )
        and abandonment_reason is null
      )
      or
      (
        result_type = 'TIE'
        and winner_side_id is null
        and loser_side_id is null
        and win_method is null
        and run_margin is null
        and wicket_margin is null
        and abandonment_reason is null
      )
      or
      (
        result_type = 'ABANDONED'
        and winner_side_id is null
        and loser_side_id is null
        and win_method is null
        and run_margin is null
        and wicket_margin is null
        and nullif(btrim(abandonment_reason), '') is not null
      )
    )
);


create index app_scorer_match_results_winner_side_idx
on public.app_scorer_match_results (winner_side_id)
where winner_side_id is not null;


-- ============================================================================
-- Result side/session integrity
--
-- The foreign keys above prove that winner/loser sides exist. They do not by
-- themselves prove that those sides belong to this scoring session.
-- ============================================================================

create or replace function public.validate_app_scorer_match_result_sides()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.winner_side_id is not null
     and not exists (
       select 1
       from public.match_sides ms
       where ms.side_id = new.winner_side_id
         and ms.scoring_session_id = new.scoring_session_id
     ) then
    raise exception
      'Winner side must belong to the same scoring session.';
  end if;

  if new.loser_side_id is not null
     and not exists (
       select 1
       from public.match_sides ms
       where ms.side_id = new.loser_side_id
         and ms.scoring_session_id = new.scoring_session_id
     ) then
    raise exception
      'Loser side must belong to the same scoring session.';
  end if;

  return new;
end;
$$;


create trigger validate_app_scorer_match_result_sides_trigger
before insert or update of
  scoring_session_id,
  winner_side_id,
  loser_side_id
on public.app_scorer_match_results
for each row
execute function public.validate_app_scorer_match_result_sides();


-- ============================================================================
-- Row-level security
--
-- Match-result writes will go through the controlled completion RPC rather
-- than direct client writes.
-- ============================================================================

alter table public.app_scorer_match_results
enable row level security;


create policy app_scorer_match_results_authenticated_read
on public.app_scorer_match_results
for select
to authenticated
using (true);

-- ============================================================================
-- Atomic second-innings completion → FinalReview
--
-- Ending innings one completes only that innings.
-- Ending innings two completes the innings and moves the scoring session into
-- FinalReview in the same database transaction.
-- ============================================================================

create or replace function public.record_app_scorer_innings_ended(
  target_event_id uuid,
  target_scoring_session_id uuid,
  target_innings_id uuid,
  target_sequence_key bigint,
  target_reason text,
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
  innings_number_value smallint;
  first_innings_status text;
  innings_payload jsonb;
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
     or target_reason is null
     or target_occurred_at is null then
    raise exception 'A valid event, session, innings, sequence, reason and timestamp are required.';
  end if;

  if target_reason not in (
    'TARGET_REACHED',
    'BALL_LIMIT_REACHED',
    'ALL_OUT',
    'DECLARED',
    'MANUAL'
  ) then
    raise exception 'Invalid innings end reason.';
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

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can end an innings.';
  end if;

  select
    si.scoring_session_id,
    si.status,
    si.innings_number
  into
    innings_session_id,
    innings_status,
    innings_number_value
  from public.scoring_innings si
  where si.innings_id = target_innings_id
  for update;

  if not found then
    raise exception 'Innings not found.';
  end if;

  if innings_session_id <> target_scoring_session_id then
    raise exception 'Innings does not belong to this scoring session.';
  end if;

  innings_payload := jsonb_build_object(
    'id', target_event_id::text,
    'type', 'INNINGS_ENDED',
    'reason', target_reason
  );

  -- Check for an exact retry before enforcing the current lifecycle state.
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
       and existing_event_type = 'INNINGS_ENDED'
       and existing_payload = innings_payload then

      if innings_number_value = 2
         and session_status not in ('FinalReview', 'Completed') then
        raise exception 'Second innings ended without reaching final review.';
      end if;

      return target_event_id;
    end if;

    raise exception 'Event ID has already been used for a different scoring event.';
  end if;

  if session_status <> 'InProgress' then
    raise exception 'The scoring session is not InProgress.';
  end if;

  if innings_status <> 'InProgress' then
    raise exception 'The innings is not InProgress.';
  end if;

  if innings_number_value = 2 then
    select si.status
    into first_innings_status
    from public.scoring_innings si
    where si.scoring_session_id = target_scoring_session_id
      and si.innings_number = 1;

    if not found or first_innings_status <> 'Completed' then
      raise exception 'First innings must be completed before ending the second innings.';
    end if;
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
    'INNINGS_ENDED',
    innings_payload,
    'Active',
    target_occurred_at,
    target_client_created_at,
    current_user_id,
    target_device_id
  );

  update public.scoring_innings
  set
    status = 'Completed',
    ended_at = target_occurred_at,
    end_reason = target_reason,
    updated_at = now()
  where innings_id = target_innings_id;

  if innings_number_value = 2 then
    update public.scoring_sessions
    set
      status = 'FinalReview',
      final_review_at = target_occurred_at,
      updated_at = now()
    where scoring_session_id = target_scoring_session_id;
  end if;

  return target_event_id;
end;
$$;


-- ============================================================================
-- Complete match
--
-- The TypeScript cricket engine derives the canonical result from replayed
-- innings. This RPC persists that neutral result and seals a scoring session
-- that has already reached FinalReview.
-- ============================================================================

create or replace function public.complete_app_scorer_match(
  target_scoring_session_id uuid,
  target_result_type text,
  target_winner_side_id uuid default null,
  target_loser_side_id uuid default null,
  target_win_method text default null,
  target_run_margin integer default null,
  target_wicket_margin integer default null,
  target_abandonment_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  session_match_id text;
  session_status text;
  session_active_scorer_id uuid;
  existing_result public.app_scorer_match_results%rowtype;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_scoring_session_id is null
     or target_result_type is null then
    raise exception 'A scoring session and result type are required.';
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

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can complete the match.';
  end if;

  -- Exact retries are idempotent.
  if session_status = 'Completed' then
    select *
    into existing_result
    from public.app_scorer_match_results
    where scoring_session_id = target_scoring_session_id;

    if not found then
      raise exception
        'Completed scoring session does not have a persisted result.';
    end if;

    if existing_result.result_type = target_result_type
       and existing_result.winner_side_id
         is not distinct from target_winner_side_id
       and existing_result.loser_side_id
         is not distinct from target_loser_side_id
       and existing_result.win_method
         is not distinct from target_win_method
       and existing_result.run_margin
         is not distinct from target_run_margin
       and existing_result.wicket_margin
         is not distinct from target_wicket_margin
       and existing_result.abandonment_reason
         is not distinct from target_abandonment_reason then
      return;
    end if;

    raise exception
      'Scoring session is already completed with a different result.';
  end if;

  if session_status <> 'FinalReview' then
    raise exception
      'The scoring session must be in FinalReview before completion.';
  end if;

  insert into public.app_scorer_match_results (
    scoring_session_id,
    result_type,
    winner_side_id,
    loser_side_id,
    win_method,
    run_margin,
    wicket_margin,
    abandonment_reason
  ) values (
    target_scoring_session_id,
    target_result_type,
    target_winner_side_id,
    target_loser_side_id,
    target_win_method,
    target_run_margin,
    target_wicket_margin,
    target_abandonment_reason
  );

  update public.scoring_sessions
  set
    status = 'Completed',
    completed_at = now(),
    updated_at = now()
  where scoring_session_id = target_scoring_session_id;

  update public.matches
  set
    status = 'Completed'
  where match_id = session_match_id;
end;
$$;


revoke all on function public.complete_app_scorer_match(
  uuid, text, uuid, uuid, text, integer, integer, text
) from public;

revoke all on function public.complete_app_scorer_match(
  uuid, text, uuid, uuid, text, integer, integer, text
) from anon;

grant execute on function public.complete_app_scorer_match(
  uuid, text, uuid, uuid, text, integer, integer, text
) to authenticated;