-- ============================================================================
-- DCC App Scorer — Durable opening configuration
-- ============================================================================
--
-- Purpose:
--   Preserve the opening striker, non-striker and bowler selected when an
--   innings starts so a zero-delivery innings can be safely reconstructed
--   after navigation, refresh or reconnect.
--
-- Architecture:
--   These columns are immutable innings-setup facts, not current scoreboard
--   state. Once deliveries exist, current striker/non-striker/bowler remain
--   derived by replaying the scoring event ledger through the cricket engine.
--
--   No INNINGS_STARTED cricket-engine event is introduced. The first persisted
--   cricket-engine event remains the first DELIVERY.
-- ============================================================================

alter table public.scoring_innings
add column opening_striker_participant_id uuid
  references public.match_participants(match_participant_id),
add column opening_non_striker_participant_id uuid
  references public.match_participants(match_participant_id),
add column opening_bowler_participant_id uuid
  references public.match_participants(match_participant_id);

alter table public.scoring_innings
add constraint scoring_innings_opening_participants_pair_check
check (
  (
    opening_striker_participant_id is null
    and opening_non_striker_participant_id is null
    and opening_bowler_participant_id is null
  )
  or
  (
    opening_striker_participant_id is not null
    and opening_non_striker_participant_id is not null
    and opening_bowler_participant_id is not null
    and opening_striker_participant_id
      <> opening_non_striker_participant_id
  )
);

create or replace function public.validate_scoring_innings_opening_participants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.opening_striker_participant_id is null
     and new.opening_non_striker_participant_id is null
     and new.opening_bowler_participant_id is null then
    return new;
  end if;

  if new.opening_striker_participant_id is null
     or new.opening_non_striker_participant_id is null
     or new.opening_bowler_participant_id is null then
    raise exception
      'Opening striker, non-striker and bowler must be supplied together.';
  end if;

  if new.opening_striker_participant_id
     = new.opening_non_striker_participant_id then
    raise exception
      'Opening striker and non-striker must be different participants.';
  end if;

  if not exists (
    select 1
    from public.match_participants mp
    where mp.match_participant_id =
      new.opening_striker_participant_id
      and mp.scoring_session_id = new.scoring_session_id
      and mp.side_id = new.batting_side_id
      and mp.participant_role = 'PLAYING'
      and mp.participation_status <> 'REMOVED'
  ) then
    raise exception
      'Opening striker must be an eligible playing participant on the batting side.';
  end if;

  if not exists (
    select 1
    from public.match_participants mp
    where mp.match_participant_id =
      new.opening_non_striker_participant_id
      and mp.scoring_session_id = new.scoring_session_id
      and mp.side_id = new.batting_side_id
      and mp.participant_role = 'PLAYING'
      and mp.participation_status <> 'REMOVED'
  ) then
    raise exception
      'Opening non-striker must be an eligible playing participant on the batting side.';
  end if;

  if not exists (
    select 1
    from public.match_participants mp
    where mp.match_participant_id =
      new.opening_bowler_participant_id
      and mp.scoring_session_id = new.scoring_session_id
      and mp.side_id = new.bowling_side_id
      and mp.participant_role = 'PLAYING'
      and mp.participation_status <> 'REMOVED'
  ) then
    raise exception
      'Opening bowler must be an eligible playing participant on the bowling side.';
  end if;

  return new;
end;
$$;

create trigger validate_scoring_innings_opening_participants_trigger
before insert or update of
  scoring_session_id,
  batting_side_id,
  bowling_side_id,
  opening_striker_participant_id,
  opening_non_striker_participant_id,
  opening_bowler_participant_id
on public.scoring_innings
for each row
execute function public.validate_scoring_innings_opening_participants();

revoke all
on function public.validate_scoring_innings_opening_participants()
from public, anon, authenticated;

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
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

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

  if target_striker_participant_id =
     target_non_striker_participant_id then
    raise exception
      'Striker and non-striker must be different participants.';
  end if;

  if target_scheduled_balls is not null
     and target_scheduled_balls <= 0 then
    raise exception 'Scheduled balls must be greater than zero.';
  end if;

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

  if not public.can_use_app_scorer(session_match_id) then
    raise exception
      'You do not have permission to use App Scorer for this match.';
  end if;

  if session_status not in ('Setup', 'Ready') then
    raise exception
      'Innings can only be started while the scoring session is in Setup or Ready.';
  end if;

  if toss_winner_side_id is null
     or toss_decision is null then
    raise exception
      'The toss must be recorded before starting the innings.';
  end if;

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
    raise exception
      'Toss winner does not belong to this scoring session.';
  end if;

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

  select si.innings_id
  into existing_innings_id
  from public.scoring_innings si
  where si.scoring_session_id = target_scoring_session_id
    and si.innings_number = 1;

  if existing_innings_id is not null then
    raise exception
      'Innings one has already been created for this match.';
  end if;

  select mp.side_id, mp.participant_role, mp.participation_status
  into striker_side_id, striker_role, striker_status
  from public.match_participants mp
  where mp.match_participant_id = target_striker_participant_id
    and mp.scoring_session_id = target_scoring_session_id;

  if not found then
    raise exception
      'Opening striker does not belong to this scoring session.';
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

  select mp.side_id, mp.participant_role, mp.participation_status
  into non_striker_side_id, non_striker_role, non_striker_status
  from public.match_participants mp
  where mp.match_participant_id = target_non_striker_participant_id
    and mp.scoring_session_id = target_scoring_session_id;

  if not found then
    raise exception
      'Opening non-striker does not belong to this scoring session.';
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

  select mp.side_id, mp.participant_role, mp.participation_status
  into bowler_side_id, bowler_role, bowler_status
  from public.match_participants mp
  where mp.match_participant_id = target_bowler_participant_id
    and mp.scoring_session_id = target_scoring_session_id;

  if not found then
    raise exception
      'Opening bowler does not belong to this scoring session.';
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

  insert into public.scoring_innings (
    scoring_session_id,
    innings_number,
    batting_side_id,
    bowling_side_id,
    status,
    scheduled_balls,
    target_runs,
    started_at,
    opening_striker_participant_id,
    opening_non_striker_participant_id,
    opening_bowler_participant_id
  )
  values (
    target_scoring_session_id,
    1,
    batting_side_id,
    bowling_side_id,
    'InProgress',
    target_scheduled_balls,
    null,
    started_timestamp,
    target_striker_participant_id,
    target_non_striker_participant_id,
    target_bowler_participant_id
  )
  returning innings_id into new_innings_id;

  update public.match_participants
  set participation_status = 'PARTICIPATED'
  where scoring_session_id = target_scoring_session_id
    and match_participant_id in (
      target_striker_participant_id,
      target_non_striker_participant_id,
      target_bowler_participant_id
    );

  update public.scoring_sessions
  set
    status = 'InProgress',
    started_at = coalesce(started_at, started_timestamp),
    active_scorer_id = current_user_id
  where scoring_session_id = target_scoring_session_id;

  return new_innings_id;
end;
$$;

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
