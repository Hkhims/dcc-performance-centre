-- ============================================================================
-- DCC App Scorer — Delivery boundary persistence and Enhanced Delivery data
-- ============================================================================
--
-- Purpose
-- -------
-- 1. Bring persisted DELIVERY events into line with the current cricket-engine
--    contract by persisting explicit physical boundary semantics.
--
-- 2. Add an optional, non-authoritative Enhanced Delivery layer for observable
--    cricket detail such as line, length, shot, contact, wagon-wheel location,
--    extras detail and fielding events.
--
-- Architecture
-- ------------
-- scoring_events remains the immutable operational source of truth for cricket
-- state. Enhanced Delivery data MUST NOT determine runs, wickets, legality,
-- strike, legal-ball count or innings state.
--
-- A delivery may have no enrichment at all and must still be a completely valid
-- cricket delivery.
--
-- Enrichment belongs to a specific immutable DELIVERY event version. If that
-- delivery is later voided or replaced, its historical enrichment is retained.
-- Read/projection code is responsible for ignoring enrichment belonging to
-- deliveries that are no longer effective.
--
-- Direct authenticated writes are deliberately not granted. Controlled RPCs
-- enforce match authority, active-scorer ownership and cross-table integrity.
-- ============================================================================


-- ============================================================================
-- 1. Enhanced Delivery parent row
-- ============================================================================

create table public.app_scorer_delivery_enrichments (
  enrichment_id uuid
    primary key
    default gen_random_uuid(),

  delivery_event_id uuid
    not null
    references public.scoring_events(event_id),

  scoring_session_id uuid
    not null
    references public.scoring_sessions(scoring_session_id)
    on delete cascade,

  innings_id uuid
    not null
    references public.scoring_innings(innings_id)
    on delete cascade,

  delivery_line text,
  delivery_length text,

  shot_type text,
  shot_intent text,
  contact_type text,

  destination_x numeric,
  destination_y numeric,

  no_ball_reason text,
  wide_direction text,

  scorer_note text,

  provenance text
    not null
    default 'SCORER_RECORDED',

  created_by uuid
    not null
    references auth.users(id),

  updated_by uuid
    not null
    references auth.users(id),

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint app_scorer_delivery_enrichments_delivery_unique
    unique (delivery_event_id),

  constraint app_scorer_delivery_enrichments_line_check
    check (
      delivery_line is null
      or delivery_line in (
        'WIDE_OUTSIDE_OFF',
        'OUTSIDE_OFF',
        'OFF_STUMP',
        'MIDDLE_STUMP',
        'LEG_STUMP',
        'OUTSIDE_LEG'
      )
    ),

  constraint app_scorer_delivery_enrichments_length_check
    check (
      delivery_length is null
      or delivery_length in (
        'YORKER',
        'FULL',
        'GOOD_LENGTH',
        'BACK_OF_LENGTH',
        'SHORT',
        'FULL_TOSS'
      )
    ),

  constraint app_scorer_delivery_enrichments_shot_type_check
    check (
      shot_type is null
      or shot_type in (
        'NO_SHOT',
        'LEAVE',
        'DEFENCE',
        'DRIVE',
        'PUNCH',
        'CUT',
        'PULL',
        'HOOK',
        'FLICK_CLIP',
        'GLANCE',
        'SWEEP',
        'REVERSE_SWEEP',
        'SLOG',
        'SLOG_SWEEP',
        'RAMP_SCOOP',
        'OTHER'
      )
    ),

  constraint app_scorer_delivery_enrichments_shot_intent_check
    check (
      shot_intent is null
      or shot_intent in (
        'GROUNDED',
        'LOFTED'
      )
    ),

  constraint app_scorer_delivery_enrichments_contact_check
    check (
      contact_type is null
      or contact_type in (
        'CLEAN',
        'EDGED',
        'INSIDE_EDGE',
        'MISTIMED',
        'BEATEN',
        'TOP_EDGE'
      )
    ),

  constraint app_scorer_delivery_enrichments_destination_x_check
    check (
      destination_x is null
      or (
        destination_x >= 0
        and destination_x <= 1
      )
    ),

  constraint app_scorer_delivery_enrichments_destination_y_check
    check (
      destination_y is null
      or (
        destination_y >= 0
        and destination_y <= 1
      )
    ),

  constraint app_scorer_delivery_enrichments_destination_pair_check
    check (
      (destination_x is null and destination_y is null)
      or
      (destination_x is not null and destination_y is not null)
    ),

  constraint app_scorer_delivery_enrichments_no_ball_reason_check
    check (
      no_ball_reason is null
      or no_ball_reason in (
        'FRONT_FOOT',
        'HIGH_FULL_TOSS',
        'OTHER',
        'UNSPECIFIED'
      )
    ),

  constraint app_scorer_delivery_enrichments_wide_direction_check
    check (
      wide_direction is null
      or wide_direction in (
        'OFF_SIDE',
        'LEG_SIDE',
        'UNSPECIFIED'
      )
    ),

  constraint app_scorer_delivery_enrichments_note_check
    check (
      scorer_note is null
      or char_length(scorer_note) <= 250
    ),

  constraint app_scorer_delivery_enrichments_provenance_check
    check (
      provenance in (
        'SCORER_RECORDED',
        'TEAM_ADMIN_CORRECTED',
        'SYSTEM_DERIVED',
        'VIDEO_DERIVED'
      )
    )
);


create index app_scorer_delivery_enrichments_session_innings_idx
on public.app_scorer_delivery_enrichments (
  scoring_session_id,
  innings_id
);


-- ============================================================================
-- 2. Enhanced Delivery fielding events
-- ============================================================================
--
-- Fielding observations are one-to-many because one delivery may legitimately
-- contain more than one fielding event, for example a misfield followed by an
-- overthrow.
--
-- A fielder is optional. "Unknown" must remain genuinely unknown rather than
-- being represented by a fake match participant.
-- ============================================================================

create table public.app_scorer_delivery_fielding_events (
  fielding_event_id uuid
    primary key
    default gen_random_uuid(),

  enrichment_id uuid
    not null
    references public.app_scorer_delivery_enrichments(enrichment_id)
    on delete cascade,

  delivery_event_id uuid
    not null
    references public.scoring_events(event_id),

  scoring_session_id uuid
    not null
    references public.scoring_sessions(scoring_session_id)
    on delete cascade,

  innings_id uuid
    not null
    references public.scoring_innings(innings_id)
    on delete cascade,

  sequence_number integer
    not null,

  event_type text
    not null,

  fielder_participant_id uuid
    references public.match_participants(match_participant_id),

  additional_runs_attributed integer,

  provenance text
    not null
    default 'SCORER_RECORDED',

  created_by uuid
    not null
    references auth.users(id),

  created_at timestamptz
    not null
    default now(),

  constraint app_scorer_delivery_fielding_events_sequence_unique
    unique (enrichment_id, sequence_number),

  constraint app_scorer_delivery_fielding_events_sequence_check
    check (sequence_number > 0),

  constraint app_scorer_delivery_fielding_events_type_check
    check (
      event_type in (
        'MISFIELD',
        'DROPPED_CATCH',
        'OVERTHROW',
        'MISSED_RUN_OUT',
        'DIRECT_HIT',
        'STUMPING_CHANCE_MISSED'
      )
    ),

  constraint app_scorer_delivery_fielding_events_runs_check
    check (
      additional_runs_attributed is null
      or additional_runs_attributed >= 0
    ),

  constraint app_scorer_delivery_fielding_events_provenance_check
    check (
      provenance in (
        'SCORER_RECORDED',
        'TEAM_ADMIN_CORRECTED',
        'SYSTEM_DERIVED',
        'VIDEO_DERIVED'
      )
    )
);


create index app_scorer_delivery_fielding_events_delivery_idx
on public.app_scorer_delivery_fielding_events (
  delivery_event_id,
  sequence_number
);


create index app_scorer_delivery_fielding_events_fielder_idx
on public.app_scorer_delivery_fielding_events (
  fielder_participant_id
)
where fielder_participant_id is not null;


-- ============================================================================
-- 3. Updated-at trigger
-- ============================================================================

create trigger app_scorer_delivery_enrichments_set_updated_at
before update
on public.app_scorer_delivery_enrichments
for each row
execute function public.set_scorer_updated_at();


-- ============================================================================
-- 4. Cross-table integrity
-- ============================================================================

create or replace function public.validate_app_scorer_delivery_enrichment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_session_id uuid;
  source_innings_id uuid;
  source_event_type text;
begin
  select
    se.scoring_session_id,
    se.innings_id,
    se.event_type
  into
    source_session_id,
    source_innings_id,
    source_event_type
  from public.scoring_events se
  where se.event_id = new.delivery_event_id;

  if not found then
    raise exception 'Delivery event not found.';
  end if;

  if source_event_type <> 'DELIVERY' then
    raise exception 'Enhanced Delivery data may only reference a DELIVERY event.';
  end if;

  if source_session_id <> new.scoring_session_id then
    raise exception 'Delivery event does not belong to this scoring session.';
  end if;

  if source_innings_id is distinct from new.innings_id then
    raise exception 'Delivery event does not belong to this innings.';
  end if;

  if not exists (
    select 1
    from public.scoring_innings si
    where si.innings_id = new.innings_id
      and si.scoring_session_id = new.scoring_session_id
  ) then
    raise exception 'Enrichment innings does not belong to this scoring session.';
  end if;

  return new;
end;
$$;


create trigger validate_app_scorer_delivery_enrichment_trigger
before insert or update of
  delivery_event_id,
  scoring_session_id,
  innings_id
on public.app_scorer_delivery_enrichments
for each row
execute function public.validate_app_scorer_delivery_enrichment();


create or replace function public.validate_app_scorer_delivery_fielding_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_delivery_event_id uuid;
  parent_scoring_session_id uuid;
  parent_innings_id uuid;
begin
  select
    enrichment.delivery_event_id,
    enrichment.scoring_session_id,
    enrichment.innings_id
  into
    parent_delivery_event_id,
    parent_scoring_session_id,
    parent_innings_id
  from public.app_scorer_delivery_enrichments enrichment
  where enrichment.enrichment_id = new.enrichment_id;

  if not found then
    raise exception 'Enhanced Delivery parent row not found.';
  end if;

  if parent_delivery_event_id <> new.delivery_event_id then
    raise exception 'Fielding event delivery does not match its Enhanced Delivery parent.';
  end if;

  if parent_scoring_session_id <> new.scoring_session_id then
    raise exception 'Fielding event scoring session does not match its Enhanced Delivery parent.';
  end if;

  if parent_innings_id <> new.innings_id then
    raise exception 'Fielding event innings does not match its Enhanced Delivery parent.';
  end if;

  if new.fielder_participant_id is not null
     and not exists (
       select 1
       from public.match_participants mp
       where mp.match_participant_id = new.fielder_participant_id
         and mp.scoring_session_id = new.scoring_session_id
     ) then
    raise exception 'Fielder does not belong to this scoring session.';
  end if;

  return new;
end;
$$;


create trigger validate_app_scorer_delivery_fielding_event_trigger
before insert or update of
  enrichment_id,
  delivery_event_id,
  scoring_session_id,
  innings_id,
  fielder_participant_id
on public.app_scorer_delivery_fielding_events
for each row
execute function public.validate_app_scorer_delivery_fielding_event();


-- ============================================================================
-- 5. Row Level Security
-- ============================================================================

alter table public.app_scorer_delivery_enrichments
enable row level security;

alter table public.app_scorer_delivery_fielding_events
enable row level security;


create policy
  "Match managers can read delivery enrichments"
on public.app_scorer_delivery_enrichments
for select
to authenticated
using (
  exists (
    select 1
    from public.scoring_sessions ss
    where ss.scoring_session_id =
      app_scorer_delivery_enrichments.scoring_session_id
      and public.can_manage_match(ss.match_id)
  )
);


create policy
  "Match managers can read delivery fielding events"
on public.app_scorer_delivery_fielding_events
for select
to authenticated
using (
  exists (
    select 1
    from public.scoring_sessions ss
    where ss.scoring_session_id =
      app_scorer_delivery_fielding_events.scoring_session_id
      and public.can_manage_match(ss.match_id)
  )
);


-- ============================================================================
-- 6. Table permissions
-- ============================================================================
--
-- As with the core scorer ledger, authenticated users may read authorised rows
-- but may not directly mutate Enhanced Delivery persistence.
-- ============================================================================

revoke all
on table public.app_scorer_delivery_enrichments
from public, anon, authenticated;

revoke all
on table public.app_scorer_delivery_fielding_events
from public, anon, authenticated;


grant select
on table public.app_scorer_delivery_enrichments
to authenticated;

grant select
on table public.app_scorer_delivery_fielding_events
to authenticated;


-- ============================================================================
-- 7. Controlled Enhanced Delivery persistence RPC
-- ============================================================================
--
-- This RPC creates or updates the optional one-per-delivery enrichment row.
--
-- Core scoring facts cannot be changed here.
-- Fielding observations will be persisted through their own controlled RPC in
-- a subsequent application-facing layer.
-- ============================================================================

create or replace function public.save_app_scorer_delivery_enrichment(
  target_delivery_event_id uuid,
  target_scoring_session_id uuid,
  target_innings_id uuid,
  target_delivery_line text default null,
  target_delivery_length text default null,
  target_shot_type text default null,
  target_shot_intent text default null,
  target_contact_type text default null,
  target_destination_x numeric default null,
  target_destination_y numeric default null,
  target_no_ball_reason text default null,
  target_wide_direction text default null,
  target_scorer_note text default null
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

  source_session_id uuid;
  source_innings_id uuid;
  source_event_type text;

  result_enrichment_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_delivery_event_id is null then
    raise exception 'Delivery event is required.';
  end if;

  if target_scoring_session_id is null then
    raise exception 'Scoring session is required.';
  end if;

  if target_innings_id is null then
    raise exception 'Innings is required.';
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
    raise exception 'Enhanced Delivery data can only be recorded while the scoring session is InProgress.';
  end if;

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can record Enhanced Delivery data.';
  end if;

  select
    se.scoring_session_id,
    se.innings_id,
    se.event_type
  into
    source_session_id,
    source_innings_id,
    source_event_type
  from public.scoring_events se
  where se.event_id = target_delivery_event_id;

  if not found then
    raise exception 'Delivery event not found.';
  end if;

  if source_event_type <> 'DELIVERY' then
    raise exception 'Enhanced Delivery data may only reference a DELIVERY event.';
  end if;

  if source_session_id <> target_scoring_session_id then
    raise exception 'Delivery event does not belong to this scoring session.';
  end if;

  if source_innings_id is distinct from target_innings_id then
    raise exception 'Delivery event does not belong to this innings.';
  end if;

  insert into public.app_scorer_delivery_enrichments (
    delivery_event_id,
    scoring_session_id,
    innings_id,
    delivery_line,
    delivery_length,
    shot_type,
    shot_intent,
    contact_type,
    destination_x,
    destination_y,
    no_ball_reason,
    wide_direction,
    scorer_note,
    provenance,
    created_by,
    updated_by
  )
  values (
    target_delivery_event_id,
    target_scoring_session_id,
    target_innings_id,
    target_delivery_line,
    target_delivery_length,
    target_shot_type,
    target_shot_intent,
    target_contact_type,
    target_destination_x,
    target_destination_y,
    target_no_ball_reason,
    target_wide_direction,
    nullif(trim(target_scorer_note), ''),
    'SCORER_RECORDED',
    current_user_id,
    current_user_id
  )
  on conflict (delivery_event_id)
  do update
  set
    delivery_line = excluded.delivery_line,
    delivery_length = excluded.delivery_length,
    shot_type = excluded.shot_type,
    shot_intent = excluded.shot_intent,
    contact_type = excluded.contact_type,
    destination_x = excluded.destination_x,
    destination_y = excluded.destination_y,
    no_ball_reason = excluded.no_ball_reason,
    wide_direction = excluded.wide_direction,
    scorer_note = excluded.scorer_note,
    provenance = 'SCORER_RECORDED',
    updated_by = current_user_id,
    updated_at = now()
  returning enrichment_id
  into result_enrichment_id;

  return result_enrichment_id;
end;
$$;


-- ============================================================================
-- 8. Controlled fielding-event persistence RPC
-- ============================================================================

create or replace function public.add_app_scorer_delivery_fielding_event(
  target_fielding_event_id uuid,
  target_delivery_event_id uuid,
  target_scoring_session_id uuid,
  target_innings_id uuid,
  target_sequence_number integer,
  target_event_type text,
  target_fielder_participant_id uuid default null,
  target_additional_runs_attributed integer default null
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

  target_enrichment_id uuid;

  existing_delivery_event_id uuid;
  existing_scoring_session_id uuid;
  existing_innings_id uuid;
  existing_sequence_number integer;
  existing_event_type text;
  existing_fielder_participant_id uuid;
  existing_additional_runs_attributed integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_fielding_event_id is null then
    raise exception 'Fielding event ID is required.';
  end if;

  if target_delivery_event_id is null
     or target_scoring_session_id is null
     or target_innings_id is null then
    raise exception 'Delivery, scoring session and innings are required.';
  end if;

  if target_sequence_number is null
     or target_sequence_number <= 0 then
    raise exception 'Fielding event sequence number must be greater than zero.';
  end if;

  if target_event_type is null then
    raise exception 'Fielding event type is required.';
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
    raise exception 'Fielding events can only be recorded while the scoring session is InProgress.';
  end if;

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can record fielding events.';
  end if;

  select enrichment.enrichment_id
  into target_enrichment_id
  from public.app_scorer_delivery_enrichments enrichment
  where enrichment.delivery_event_id = target_delivery_event_id
    and enrichment.scoring_session_id = target_scoring_session_id
    and enrichment.innings_id = target_innings_id;

  if not found then
    raise exception 'Save the Enhanced Delivery row before adding fielding events.';
  end if;

  select
    fielding.delivery_event_id,
    fielding.scoring_session_id,
    fielding.innings_id,
    fielding.sequence_number,
    fielding.event_type,
    fielding.fielder_participant_id,
    fielding.additional_runs_attributed
  into
    existing_delivery_event_id,
    existing_scoring_session_id,
    existing_innings_id,
    existing_sequence_number,
    existing_event_type,
    existing_fielder_participant_id,
    existing_additional_runs_attributed
  from public.app_scorer_delivery_fielding_events fielding
  where fielding.fielding_event_id = target_fielding_event_id;

  if found then
    if existing_delivery_event_id = target_delivery_event_id
       and existing_scoring_session_id = target_scoring_session_id
       and existing_innings_id = target_innings_id
       and existing_sequence_number = target_sequence_number
       and existing_event_type = target_event_type
       and existing_fielder_participant_id
         is not distinct from target_fielder_participant_id
       and existing_additional_runs_attributed
         is not distinct from target_additional_runs_attributed then
      return target_fielding_event_id;
    end if;

    raise exception 'Fielding event ID has already been used for different fielding data.';
  end if;

  insert into public.app_scorer_delivery_fielding_events (
    fielding_event_id,
    enrichment_id,
    delivery_event_id,
    scoring_session_id,
    innings_id,
    sequence_number,
    event_type,
    fielder_participant_id,
    additional_runs_attributed,
    provenance,
    created_by
  )
  values (
    target_fielding_event_id,
    target_enrichment_id,
    target_delivery_event_id,
    target_scoring_session_id,
    target_innings_id,
    target_sequence_number,
    target_event_type,
    target_fielder_participant_id,
    target_additional_runs_attributed,
    'SCORER_RECORDED',
    current_user_id
  );

  return target_fielding_event_id;
end;
$$;


-- ============================================================================
-- 9. Explicit physical-boundary persistence
-- ============================================================================
--
-- PostgreSQL identifies overloaded functions by their argument signature.
-- The previous RPC has no boundary parameter, so remove it before installing
-- the new canonical signature.
-- ============================================================================

drop function public.record_app_scorer_delivery(
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
);


create function public.record_app_scorer_delivery(
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
  target_boundary text default null,
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
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

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

  if target_striker_participant_id =
     target_non_striker_participant_id then
    raise exception 'Striker and non-striker must be different participants.';
  end if;

  if target_bat_runs is null
     or target_bat_runs not in (0, 1, 2, 3, 4, 5, 6) then
    raise exception 'Bat runs must be between 0 and 6.';
  end if;

  if target_boundary is not null
     and target_boundary not in ('NONE', 'FOUR', 'SIX') then
    raise exception 'Boundary must be NONE, FOUR or SIX.';
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

  if target_boundary is not null then
    delivery_payload :=
      delivery_payload ||
      jsonb_build_object('boundary', target_boundary);
  end if;

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
-- 10. Function permissions
-- ============================================================================

revoke all
on function public.save_app_scorer_delivery_enrichment(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text
)
from public, anon;

grant execute
on function public.save_app_scorer_delivery_enrichment(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text
)
to authenticated;


revoke all
on function public.add_app_scorer_delivery_fielding_event(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  uuid,
  integer
)
from public, anon;

grant execute
on function public.add_app_scorer_delivery_fielding_event(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  uuid,
  integer
)
to authenticated;


revoke all
on function public.record_app_scorer_delivery(
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
  text,
  timestamptz,
  timestamptz,
  uuid
)
from public, anon;

grant execute
on function public.record_app_scorer_delivery(
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
  text,
  timestamptz,
  timestamptz,
  uuid
)
to authenticated;


-- Trigger helpers are internal implementation details.

revoke all
on function public.validate_app_scorer_delivery_enrichment()
from public, anon, authenticated;

revoke all
on function public.validate_app_scorer_delivery_fielding_event()
from public, anon, authenticated;


-- ============================================================================
-- End of Delivery boundary persistence and Enhanced Delivery foundation
-- ============================================================================