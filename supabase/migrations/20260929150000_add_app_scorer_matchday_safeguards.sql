-- ============================================================================
-- DCC App Scorer — match-day squad safeguards
-- 8–15 players per side before innings start; opposition additions remain
-- match-scoped and may continue during live scoring up to the 15-player ceiling.
-- ============================================================================

create or replace function public.validate_app_scorer_squad_size_before_innings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  side_record record;
  active_player_count integer;
begin
  for side_record in
    select ms.side_id, ms.display_name
    from public.match_sides ms
    where ms.scoring_session_id = new.scoring_session_id
  loop
    select count(*)
    into active_player_count
    from public.match_participants mp
    where mp.scoring_session_id = new.scoring_session_id
      and mp.side_id = side_record.side_id
      and mp.participant_role = 'PLAYING'
      and mp.participation_status <> 'REMOVED';

    if active_player_count < 8 or active_player_count > 15 then
      raise exception
        '% must have between 8 and 15 match-day players before the innings can start. Current squad: %.',
        side_record.display_name,
        active_player_count;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_app_scorer_squad_size_before_innings
on public.scoring_innings;

create trigger validate_app_scorer_squad_size_before_innings
before insert on public.scoring_innings
for each row
execute function public.validate_app_scorer_squad_size_before_innings();


create or replace function public.add_app_scorer_opposition_player(
  target_scoring_session_id uuid,
  target_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  target_match_id text;
  target_session_status text;
  target_active_scorer_id uuid;
  opposition_side_id uuid;
  opposition_side_count integer;
  active_opposition_count integer;
  normalised_display_name text;
  new_participant_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_scoring_session_id is null then
    raise exception 'Scoring session ID is required.';
  end if;

  normalised_display_name :=
    nullif(btrim(coalesce(target_display_name, '')), '');

  if normalised_display_name is null then
    raise exception 'Opposition player name is required.';
  end if;

  select ss.match_id, ss.status, ss.active_scorer_id
  into target_match_id, target_session_status, target_active_scorer_id
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then
    raise exception 'Scoring session not found.';
  end if;

  if not public.can_use_app_scorer(target_match_id) then
    raise exception
      'You do not have permission to manage App Scorer for this match.';
  end if;

  if target_session_status not in ('Setup', 'Ready', 'InProgress') then
    raise exception
      'Opposition players can only be added during match setup or live scoring.';
  end if;

  if target_session_status = 'InProgress'
     and target_active_scorer_id is distinct from current_user_id then
    raise exception
      'Only the active scorer can add an opposition player during live scoring.';
  end if;

  select count(*)
  into opposition_side_count
  from public.match_sides ms
  where ms.scoring_session_id = target_scoring_session_id
    and ms.side_type = 'EXTERNAL';

  if opposition_side_count <> 1 then
    raise exception 'Exactly one external opposition side is required.';
  end if;

  select ms.side_id
  into opposition_side_id
  from public.match_sides ms
  where ms.scoring_session_id = target_scoring_session_id
    and ms.side_type = 'EXTERNAL'
  limit 1;

  select count(*)
  into active_opposition_count
  from public.match_participants mp
  where mp.scoring_session_id = target_scoring_session_id
    and mp.side_id = opposition_side_id
    and mp.participant_role = 'PLAYING'
    and mp.participation_status <> 'REMOVED';

  if active_opposition_count >= 15 then
    raise exception
      'The opposition match-day squad already has the maximum 15 players.';
  end if;

  insert into public.match_participants (
    scoring_session_id,
    side_id,
    participant_type,
    dcc_player_id,
    display_name,
    participant_role,
    participation_status,
    created_by
  )
  values (
    target_scoring_session_id,
    opposition_side_id,
    'EXTERNAL',
    null,
    normalised_display_name,
    'PLAYING',
    'AVAILABLE',
    current_user_id
  )
  returning match_participant_id into new_participant_id;

  return new_participant_id;
end;
$$;

revoke all
on function public.add_app_scorer_opposition_player(uuid, text)
from public;

revoke all
on function public.add_app_scorer_opposition_player(uuid, text)
from anon;

grant execute
on function public.add_app_scorer_opposition_player(uuid, text)
to authenticated;
