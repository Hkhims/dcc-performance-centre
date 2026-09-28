-- ============================================================
-- DCC Portal / App
-- App Scorer persistence foundation
--
-- Purpose:
--   Establish the durable persistence layer for the DCC App
--   Scorer without changing NV Play import/publication behaviour,
--   canonical match publication, official statistics, live scores,
--   notifications, or scorer UI.
--
-- Core principles:
--   * public.matches remains the single canonical match identity.
--   * One authoritative scoring session exists per canonical match.
--   * Team Selection records intention; match participants record
--     match-day scoring context and, after review, reality.
--   * DCC players keep their canonical public.players identity.
--   * Opposition and Guest/trialist players do NOT enter
--     public.players.
--   * The scoring event ledger stores cricket facts; aggregate score,
--     wickets, overs, batting/bowling figures, partnerships, FOW and
--     chase state are derived.
--   * Event IDs are client-generatable UUIDs for offline idempotency.
--   * Event order is explicit and independent of server receipt time.
--   * Persisted corrections are auditable via supersession/reversal.
--
-- Important V1 boundary:
--   The current ad-hoc fixture workflow creates complete canonical
--   Friendly and Warm-up fixtures. Internal DCC-v-DCC fixture
--   creation still requires its dedicated two-sided workflow.
--   Therefore scorer sessions are enabled here for Friendly/Warm-up
--   matches only. The schema already supports INTERNAL match sides
--   and GUEST participants so Internal can be enabled deliberately
--   when that fixture workflow is added.
--
-- This migration deliberately does NOT:
--   * build the cricket state engine;
--   * build scorer UI;
--   * modify NV Play;
--   * modify canonical publication;
--   * modify official season statistics;
--   * build live-score projections;
--   * build scorer notifications;
--   * grant scorer authority to create canonical DCC players.
-- ============================================================


-- ============================================================
-- Scoring sessions
-- ============================================================

create table public.scoring_sessions (
  scoring_session_id uuid
    primary key
    default gen_random_uuid(),

  match_id text
    not null
    references public.matches(match_id),

  status text
    not null
    default 'Setup',

  toss_winner_side_id uuid,
  toss_decision text,

  active_scorer_id uuid
    references auth.users(id),

  active_device_id uuid,

  started_at timestamp with time zone,
  final_review_at timestamp with time zone,
  completed_at timestamp with time zone,

  created_by uuid
    not null
    references auth.users(id),

  created_at timestamp with time zone
    not null
    default now(),

  updated_at timestamp with time zone
    not null
    default now(),

  constraint scoring_sessions_match_unique
    unique (match_id),

  constraint scoring_sessions_status_check
    check (
      status in (
        'Setup',
        'Ready',
        'InProgress',
        'FinalReview',
        'Completed',
        'Abandoned'
      )
    ),

  constraint scoring_sessions_toss_decision_check
    check (
      toss_decision is null
      or toss_decision in ('Bat', 'Bowl')
    ),

  constraint scoring_sessions_toss_pair_check
    check (
      (toss_winner_side_id is null and toss_decision is null)
      or
      (toss_winner_side_id is not null and toss_decision is not null)
    ),

  constraint scoring_sessions_completion_state_check
    check (
      (status = 'Completed' and completed_at is not null)
      or
      (status <> 'Completed')
    )
);

create index scoring_sessions_status_idx
on public.scoring_sessions (status);

create index scoring_sessions_active_scorer_idx
on public.scoring_sessions (active_scorer_id)
where active_scorer_id is not null;


-- ============================================================
-- Match sides
--
-- Operational scorer representation of the two cricketing sides.
-- This is intentionally symmetric and is separate from the
-- DCC-centric canonical match_team_entries representation.
-- ============================================================

create table public.match_sides (
  side_id uuid
    primary key
    default gen_random_uuid(),

  scoring_session_id uuid
    not null
    references public.scoring_sessions(scoring_session_id)
    on delete cascade,

  side_number smallint
    not null,

  side_type text
    not null,

  canonical_team_id text
    references public.teams(team_id),

  display_name text
    not null,

  created_at timestamp with time zone
    not null
    default now(),

  constraint match_sides_session_number_unique
    unique (scoring_session_id, side_number),

  constraint match_sides_number_check
    check (side_number in (1, 2)),

  constraint match_sides_type_check
    check (
      side_type in (
        'DCC_TEAM',
        'EXTERNAL',
        'INTERNAL'
      )
    ),

  constraint match_sides_display_name_check
    check (nullif(trim(display_name), '') is not null),

  constraint match_sides_canonical_team_check
    check (
      (side_type = 'DCC_TEAM' and canonical_team_id is not null)
      or
      (side_type in ('EXTERNAL', 'INTERNAL'))
    )
);

create index match_sides_session_idx
on public.match_sides (scoring_session_id);

create index match_sides_canonical_team_idx
on public.match_sides (canonical_team_id)
where canonical_team_id is not null;


-- The toss winner must be a real match side. A trigger added below
-- also enforces that it belongs to the same scoring session.
alter table public.scoring_sessions
add constraint scoring_sessions_toss_winner_side_fk
foreign key (toss_winner_side_id)
references public.match_sides(side_id);


-- ============================================================
-- Match participants
--
-- DCC:
--   Canonical DCC player. dcc_player_id is required.
--
-- EXTERNAL:
--   Opposition player. Match-scoped in Migration 1 and deliberately
--   not inserted into public.players.
--
-- GUEST:
--   Trialist/new club participant used especially by future Internal
--   matches. Match-scoped only and deliberately not inserted into
--   public.players. Only Super Admin player-management workflows may
--   create canonical DCC players.
--
-- participant_role distinguishes ordinary playing participants from
-- fielding-only substitutes.
--
-- participation_status separates "available to this scoring session"
-- from "confirmed to have participated".
-- ============================================================

create table public.match_participants (
  match_participant_id uuid
    primary key
    default gen_random_uuid(),

  scoring_session_id uuid
    not null
    references public.scoring_sessions(scoring_session_id)
    on delete cascade,

  side_id uuid
    not null
    references public.match_sides(side_id)
    on delete cascade,

  participant_type text
    not null,

  dcc_player_id text
    references public.players(player_id),

  display_name text
    not null,

  participant_role text
    not null
    default 'PLAYING',

  participation_status text
    not null
    default 'AVAILABLE',

  created_by uuid
    not null
    references auth.users(id),

  created_at timestamp with time zone
    not null
    default now(),

  updated_at timestamp with time zone
    not null
    default now(),

  constraint match_participants_type_check
    check (
      participant_type in (
        'DCC',
        'EXTERNAL',
        'GUEST'
      )
    ),

  constraint match_participants_identity_check
    check (
      (participant_type = 'DCC' and dcc_player_id is not null)
      or
      (participant_type in ('EXTERNAL', 'GUEST')
        and dcc_player_id is null)
    ),

  constraint match_participants_display_name_check
    check (nullif(trim(display_name), '') is not null),

  constraint match_participants_role_check
    check (
      participant_role in (
        'PLAYING',
        'FIELDING_SUBSTITUTE'
      )
    ),

  constraint match_participants_status_check
    check (
      participation_status in (
        'AVAILABLE',
        'PARTICIPATED',
        'REMOVED'
      )
    )
);

create unique index match_participants_one_dcc_player_per_session
on public.match_participants (
  scoring_session_id,
  dcc_player_id
)
where dcc_player_id is not null;

create index match_participants_session_side_idx
on public.match_participants (
  scoring_session_id,
  side_id
);

create index match_participants_dcc_player_idx
on public.match_participants (dcc_player_id)
where dcc_player_id is not null;


-- ============================================================
-- Scoring innings
--
-- An innings is durable match structure. Aggregate cricket totals
-- are deliberately NOT authoritative columns here.
--
-- scheduled_balls stores legal-ball capacity (e.g. 20 overs = 120)
-- rather than decimal/cricket overs notation.
--
-- target_runs stores the current authoritative target where a chase
-- exists. Any target revision must also be represented historically
-- in the scoring event ledger.
-- ============================================================

create table public.scoring_innings (
  innings_id uuid
    primary key
    default gen_random_uuid(),

  scoring_session_id uuid
    not null
    references public.scoring_sessions(scoring_session_id)
    on delete cascade,

  innings_number smallint
    not null,

  batting_side_id uuid
    not null
    references public.match_sides(side_id),

  bowling_side_id uuid
    not null
    references public.match_sides(side_id),

  status text
    not null
    default 'Ready',

  scheduled_balls integer,
  target_runs integer,

  started_at timestamp with time zone,
  ended_at timestamp with time zone,

  end_reason text,

  created_at timestamp with time zone
    not null
    default now(),

  updated_at timestamp with time zone
    not null
    default now(),

  constraint scoring_innings_session_number_unique
    unique (scoring_session_id, innings_number),

  constraint scoring_innings_number_check
    check (innings_number in (1, 2)),

  constraint scoring_innings_sides_check
    check (batting_side_id <> bowling_side_id),

  constraint scoring_innings_status_check
    check (
      status in (
        'Ready',
        'InProgress',
        'Completed',
        'Abandoned'
      )
    ),

  constraint scoring_innings_scheduled_balls_check
    check (
      scheduled_balls is null
      or scheduled_balls > 0
    ),

  constraint scoring_innings_target_runs_check
    check (
      target_runs is null
      or target_runs > 0
    ),

  constraint scoring_innings_end_reason_check
    check (
      end_reason is null
      or end_reason in (
        'All Out',
        'Overs Complete',
        'Target Reached',
        'Declared',
        'Retired/Closed',
        'Abandoned',
        'Manual Closure'
      )
    ),

  constraint scoring_innings_time_state_check
    check (
      (status = 'Ready')
      or
      (status = 'InProgress' and started_at is not null)
      or
      (status in ('Completed', 'Abandoned')
        and started_at is not null
        and ended_at is not null)
    )
);

create index scoring_innings_session_status_idx
on public.scoring_innings (
  scoring_session_id,
  status
);


-- ============================================================
-- Scoring events
--
-- The event ledger is the operational source of truth for App
-- Scorer cricket.
--
-- event_id may be generated on-device before network access. The
-- primary key therefore supplies idempotency during retry/sync.
--
-- sequence_key is logical cricket-event order and MUST NOT be
-- inferred from server_created_at.
--
-- payload stores event-specific cricket facts. Aggregate totals are
-- derived by the cricket engine and are not authoritative here.
-- ============================================================

create table public.scoring_events (
  event_id uuid
    primary key,

  scoring_session_id uuid
    not null
    references public.scoring_sessions(scoring_session_id)
    on delete cascade,

  innings_id uuid
    references public.scoring_innings(innings_id)
    on delete cascade,

  sequence_key bigint
    not null,

  event_type text
    not null,

  payload jsonb
    not null
    default '{}'::jsonb,

  event_status text
    not null
    default 'Active',

  occurred_at timestamp with time zone
    not null,

  client_created_at timestamp with time zone,

  server_created_at timestamp with time zone
    not null
    default now(),

  recorded_by uuid
    not null
    references auth.users(id),

  device_id uuid,

  supersedes_event_id uuid
    references public.scoring_events(event_id),

  reversed_at timestamp with time zone,

  reversed_by uuid
    references auth.users(id),

  constraint scoring_events_session_sequence_unique
    unique (scoring_session_id, sequence_key),

  constraint scoring_events_sequence_check
    check (sequence_key > 0),

  constraint scoring_events_type_check
    check (
      event_type in (
        'DELIVERY',
        'INNINGS_STARTED',
        'INNINGS_ENDED',
        'BATTER_RETIRED',
        'BATTER_RETURNED',
        'BREAK_STARTED',
        'BREAK_ENDED',
        'PLAYING_CONDITIONS_CHANGED',
        'TARGET_REVISED',
        'WICKETKEEPER_CHANGED',
        'PENALTY_RUNS',
        'SCORER_HANDOVER',
        'MATCH_ABANDONED',
        'MATCH_COMPLETED'
      )
    ),

  constraint scoring_events_payload_object_check
    check (jsonb_typeof(payload) = 'object'),

  constraint scoring_events_status_check
    check (
      event_status in (
        'Active',
        'Superseded',
        'Reversed'
      )
    ),

  constraint scoring_events_reversal_state_check
    check (
      (event_status = 'Reversed'
        and reversed_at is not null
        and reversed_by is not null)
      or
      (event_status <> 'Reversed')
    ),

  constraint scoring_events_no_self_supersession_check
    check (
      supersedes_event_id is null
      or supersedes_event_id <> event_id
    )
);

create index scoring_events_session_sequence_idx
on public.scoring_events (
  scoring_session_id,
  sequence_key
);

create index scoring_events_innings_sequence_idx
on public.scoring_events (
  innings_id,
  sequence_key
)
where innings_id is not null;

create index scoring_events_active_session_idx
on public.scoring_events (
  scoring_session_id,
  sequence_key
)
where event_status = 'Active';

create index scoring_events_unsuperseded_idx
on public.scoring_events (supersedes_event_id)
where supersedes_event_id is not null;


-- ============================================================
-- Cross-table integrity helpers
--
-- Foreign keys prove that referenced rows exist, but they do not by
-- themselves prove that a side/participant/innings belongs to the
-- same scoring session. These triggers close that gap.
-- ============================================================

create or replace function public.validate_scoring_session_toss_side()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.toss_winner_side_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.match_sides
    where match_sides.side_id = new.toss_winner_side_id
      and match_sides.scoring_session_id =
        new.scoring_session_id
  ) then
    raise exception
      'Toss winner must belong to the same scoring session.';
  end if;

  return new;
end;
$$;

create trigger validate_scoring_session_toss_side_trigger
before insert or update of toss_winner_side_id, scoring_session_id
on public.scoring_sessions
for each row
execute function public.validate_scoring_session_toss_side();


create or replace function public.validate_match_participant_side()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.match_sides
    where match_sides.side_id = new.side_id
      and match_sides.scoring_session_id =
        new.scoring_session_id
  ) then
    raise exception
      'Participant side must belong to the same scoring session.';
  end if;

  return new;
end;
$$;

create trigger validate_match_participant_side_trigger
before insert or update of side_id, scoring_session_id
on public.match_participants
for each row
execute function public.validate_match_participant_side();


create or replace function public.validate_scoring_innings_sides()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.match_sides
    where match_sides.side_id = new.batting_side_id
      and match_sides.scoring_session_id =
        new.scoring_session_id
  ) then
    raise exception
      'Batting side must belong to the same scoring session.';
  end if;

  if not exists (
    select 1
    from public.match_sides
    where match_sides.side_id = new.bowling_side_id
      and match_sides.scoring_session_id =
        new.scoring_session_id
  ) then
    raise exception
      'Bowling side must belong to the same scoring session.';
  end if;

  return new;
end;
$$;

create trigger validate_scoring_innings_sides_trigger
before insert or update of
  batting_side_id,
  bowling_side_id,
  scoring_session_id
on public.scoring_innings
for each row
execute function public.validate_scoring_innings_sides();


create or replace function public.validate_scoring_event_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.innings_id is not null
    and not exists (
      select 1
      from public.scoring_innings
      where scoring_innings.innings_id = new.innings_id
        and scoring_innings.scoring_session_id =
          new.scoring_session_id
    )
  then
    raise exception
      'Event innings must belong to the same scoring session.';
  end if;

  if new.supersedes_event_id is not null
    and not exists (
      select 1
      from public.scoring_events
      where scoring_events.event_id =
          new.supersedes_event_id
        and scoring_events.scoring_session_id =
          new.scoring_session_id
    )
  then
    raise exception
      'Superseded event must belong to the same scoring session.';
  end if;

  return new;
end;
$$;

create trigger validate_scoring_event_scope_trigger
before insert or update of
  scoring_session_id,
  innings_id,
  supersedes_event_id
on public.scoring_events
for each row
execute function public.validate_scoring_event_scope();


-- ============================================================
-- Updated-at helper
-- ============================================================

create or replace function public.set_scorer_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scoring_sessions_set_updated_at
before update
on public.scoring_sessions
for each row
execute function public.set_scorer_updated_at();

create trigger match_participants_set_updated_at
before update
on public.match_participants
for each row
execute function public.set_scorer_updated_at();

create trigger scoring_innings_set_updated_at
before update
on public.scoring_innings
for each row
execute function public.set_scorer_updated_at();


-- ============================================================
-- Scorer eligibility helper
--
-- The current complete ad-hoc fixture workflow supports Friendly
-- and Warm-up. Internal remains deliberately disabled here until
-- its dedicated two-DCC-side fixture workflow exists.
--
-- Official Season is always rejected.
-- ============================================================

create or replace function public.can_use_app_scorer(
  target_match_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.can_manage_match(target_match_id)
    and exists (
      select 1
      from public.matches
      where matches.match_id = trim(target_match_id)
        and matches.status = 'Scheduled'
        and coalesce(matches.is_internal_dcc_match, false) = false
        and matches.stats_category in (
          'Friendly',
          'Warm-up'
        )
        and coalesce(matches.official_season_eligible, false) = false
    );
$$;


-- ============================================================
-- Row Level Security
--
-- Migration 1 is persistence foundation only.
--
-- Direct client writes are deliberately NOT granted. Future scorer
-- RPCs will validate cricket state, match authority, active scorer
-- ownership and idempotency before mutating these tables.
--
-- Match managers may read scorer persistence for matches they manage.
-- ============================================================

alter table public.scoring_sessions
enable row level security;

alter table public.match_sides
enable row level security;

alter table public.match_participants
enable row level security;

alter table public.scoring_innings
enable row level security;

alter table public.scoring_events
enable row level security;


create policy
  "Match managers can read scoring sessions"
on public.scoring_sessions
for select
to authenticated
using (
  public.can_manage_match(match_id)
);


create policy
  "Match managers can read match sides"
on public.match_sides
for select
to authenticated
using (
  exists (
    select 1
    from public.scoring_sessions
    where scoring_sessions.scoring_session_id =
        match_sides.scoring_session_id
      and public.can_manage_match(scoring_sessions.match_id)
  )
);


create policy
  "Match managers can read match participants"
on public.match_participants
for select
to authenticated
using (
  exists (
    select 1
    from public.scoring_sessions
    where scoring_sessions.scoring_session_id =
        match_participants.scoring_session_id
      and public.can_manage_match(scoring_sessions.match_id)
  )
);


create policy
  "Match managers can read scoring innings"
on public.scoring_innings
for select
to authenticated
using (
  exists (
    select 1
    from public.scoring_sessions
    where scoring_sessions.scoring_session_id =
        scoring_innings.scoring_session_id
      and public.can_manage_match(scoring_sessions.match_id)
  )
);


create policy
  "Match managers can read scoring events"
on public.scoring_events
for select
to authenticated
using (
  exists (
    select 1
    from public.scoring_sessions
    where scoring_sessions.scoring_session_id =
        scoring_events.scoring_session_id
      and public.can_manage_match(scoring_sessions.match_id)
  )
);


-- ============================================================
-- Table permissions
--
-- No direct authenticated writes in Migration 1.
-- Future controlled RPCs will perform mutations.
-- ============================================================

revoke all
on table public.scoring_sessions
from public, anon, authenticated;

revoke all
on table public.match_sides
from public, anon, authenticated;

revoke all
on table public.match_participants
from public, anon, authenticated;

revoke all
on table public.scoring_innings
from public, anon, authenticated;

revoke all
on table public.scoring_events
from public, anon, authenticated;

grant select
on table public.scoring_sessions
to authenticated;

grant select
on table public.match_sides
to authenticated;

grant select
on table public.match_participants
to authenticated;

grant select
on table public.scoring_innings
to authenticated;

grant select
on table public.scoring_events
to authenticated;


-- ============================================================
-- Function permissions
-- ============================================================

revoke all
on function public.can_use_app_scorer(text)
from public;

grant execute
on function public.can_use_app_scorer(text)
to authenticated;


-- Trigger helpers are internal implementation details.
revoke all
on function public.validate_scoring_session_toss_side()
from public, anon, authenticated;

revoke all
on function public.validate_match_participant_side()
from public, anon, authenticated;

revoke all
on function public.validate_scoring_innings_sides()
from public, anon, authenticated;

revoke all
on function public.validate_scoring_event_scope()
from public, anon, authenticated;

revoke all
on function public.set_scorer_updated_at()
from public, anon, authenticated;


-- ============================================================
-- End of App Scorer persistence foundation.
-- ============================================================
