-- DCC App Scorer: editable match-day squads + duplicate protection.

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
  current_user_id uuid := auth.uid();
  target_match_id text;
  target_session_status text;
  target_active_scorer_id uuid;
  opposition_side_id uuid;
  active_count integer;
  normalised_name text;
  existing_id uuid;
  existing_status text;
  new_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required.'; end if;

  normalised_name := lower(regexp_replace(btrim(coalesce(target_display_name, '')), '\s+', ' ', 'g'));
  if normalised_name = '' then raise exception 'Opposition player name is required.'; end if;

  select ss.match_id, ss.status, ss.active_scorer_id
    into target_match_id, target_session_status, target_active_scorer_id
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then raise exception 'Scoring session not found.'; end if;
  if not public.can_use_app_scorer(target_match_id) then
    raise exception 'You do not have permission to manage App Scorer for this match.';
  end if;
  if target_session_status not in ('Setup','Ready','InProgress') then
    raise exception 'Opposition players can only be changed during setup or live scoring.';
  end if;
  if target_session_status = 'InProgress'
     and target_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can add an opposition player during live scoring.';
  end if;

  select ms.side_id into opposition_side_id
  from public.match_sides ms
  where ms.scoring_session_id = target_scoring_session_id
    and ms.side_type = 'EXTERNAL'
  limit 1;
  if opposition_side_id is null then raise exception 'External opposition side not found.'; end if;

  select mp.match_participant_id, mp.participation_status
    into existing_id, existing_status
  from public.match_participants mp
  where mp.scoring_session_id = target_scoring_session_id
    and mp.side_id = opposition_side_id
    and mp.participant_role = 'PLAYING'
    and lower(regexp_replace(btrim(mp.display_name), '\s+', ' ', 'g')) = normalised_name
  limit 1;

  if existing_id is not null then
    if existing_status = 'REMOVED' then
      select count(*) into active_count
      from public.match_participants mp
      where mp.scoring_session_id = target_scoring_session_id
        and mp.side_id = opposition_side_id
        and mp.participant_role = 'PLAYING'
        and mp.participation_status <> 'REMOVED';
      if active_count >= 15 then raise exception 'The opposition match-day squad already has the maximum 15 players.'; end if;

      update public.match_participants
      set participation_status = 'AVAILABLE'
      where match_participant_id = existing_id;
      return existing_id;
    end if;

    raise exception '% is already in the opposition match-day squad.', btrim(target_display_name);
  end if;

  select count(*) into active_count
  from public.match_participants mp
  where mp.scoring_session_id = target_scoring_session_id
    and mp.side_id = opposition_side_id
    and mp.participant_role = 'PLAYING'
    and mp.participation_status <> 'REMOVED';

  if active_count >= 15 then raise exception 'The opposition match-day squad already has the maximum 15 players.'; end if;

  insert into public.match_participants (
    scoring_session_id, side_id, participant_type, dcc_player_id,
    display_name, participant_role, participation_status, created_by
  ) values (
    target_scoring_session_id, opposition_side_id, 'EXTERNAL', null,
    regexp_replace(btrim(target_display_name), '\s+', ' ', 'g'),
    'PLAYING', 'AVAILABLE', current_user_id
  )
  returning match_participant_id into new_id;

  return new_id;
end;
$$;

revoke all on function public.add_app_scorer_opposition_player(uuid,text) from public;
revoke all on function public.add_app_scorer_opposition_player(uuid,text) from anon;
grant execute on function public.add_app_scorer_opposition_player(uuid,text) to authenticated;


create or replace function public.add_app_scorer_dcc_player(
  target_scoring_session_id uuid,
  target_dcc_player_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_match_id text;
  target_session_status text;
  dcc_side_id uuid;
  active_count integer;
  player_name_value text;
  existing_id uuid;
  existing_status text;
  new_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required.'; end if;

  select ss.match_id, ss.status into target_match_id, target_session_status
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then raise exception 'Scoring session not found.'; end if;
  if not public.can_use_app_scorer(target_match_id) then
    raise exception 'You do not have permission to manage App Scorer for this match.';
  end if;
  if target_session_status not in ('Setup','Ready') then
    raise exception 'DCC match-day squad changes are only available before the innings starts.';
  end if;

  select p.player_name into player_name_value
  from public.players p
  where p.player_id = target_dcc_player_id and p.active = true;
  if player_name_value is null then raise exception 'Active DCC player not found.'; end if;

  select ms.side_id into dcc_side_id
  from public.match_sides ms
  where ms.scoring_session_id = target_scoring_session_id
    and ms.side_type = 'DCC_TEAM'
  limit 1;
  if dcc_side_id is null then raise exception 'DCC match side not found.'; end if;

  select mp.match_participant_id, mp.participation_status
    into existing_id, existing_status
  from public.match_participants mp
  where mp.scoring_session_id = target_scoring_session_id
    and mp.side_id = dcc_side_id
    and mp.dcc_player_id = target_dcc_player_id
  limit 1;

  if existing_id is not null then
    if existing_status = 'REMOVED' then
      select count(*) into active_count
      from public.match_participants mp
      where mp.scoring_session_id = target_scoring_session_id
        and mp.side_id = dcc_side_id
        and mp.participant_role = 'PLAYING'
        and mp.participation_status <> 'REMOVED';
      if active_count >= 15 then raise exception 'The DCC match-day squad already has the maximum 15 players.'; end if;

      update public.match_participants
      set participation_status = 'AVAILABLE', participant_role = 'PLAYING'
      where match_participant_id = existing_id;
      return existing_id;
    end if;

    raise exception '% is already in the DCC match-day squad.', player_name_value;
  end if;

  select count(*) into active_count
  from public.match_participants mp
  where mp.scoring_session_id = target_scoring_session_id
    and mp.side_id = dcc_side_id
    and mp.participant_role = 'PLAYING'
    and mp.participation_status <> 'REMOVED';
  if active_count >= 15 then raise exception 'The DCC match-day squad already has the maximum 15 players.'; end if;

  insert into public.match_participants (
    scoring_session_id, side_id, participant_type, dcc_player_id,
    display_name, participant_role, participation_status, created_by
  ) values (
    target_scoring_session_id, dcc_side_id, 'DCC', target_dcc_player_id,
    player_name_value, 'PLAYING', 'AVAILABLE', current_user_id
  )
  returning match_participant_id into new_id;

  return new_id;
end;
$$;

revoke all on function public.add_app_scorer_dcc_player(uuid,text) from public;
revoke all on function public.add_app_scorer_dcc_player(uuid,text) from anon;
grant execute on function public.add_app_scorer_dcc_player(uuid,text) to authenticated;


create or replace function public.set_app_scorer_opposition_participant_status(
  target_scoring_session_id uuid,
  target_match_participant_id uuid,
  target_participation_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_match_id text;
  target_session_status text;
  target_side_type text;
begin
  if current_user_id is null then raise exception 'Authentication required.'; end if;
  if target_participation_status not in ('AVAILABLE','REMOVED') then
    raise exception 'Invalid participation status.';
  end if;

  select ss.match_id, ss.status into target_match_id, target_session_status
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then raise exception 'Scoring session not found.'; end if;
  if not public.can_use_app_scorer(target_match_id) then
    raise exception 'You do not have permission to manage App Scorer for this match.';
  end if;
  if target_session_status not in ('Setup','Ready') then
    raise exception 'Opposition squad removals are only available before the innings starts.';
  end if;

  select ms.side_type into target_side_type
  from public.match_participants mp
  join public.match_sides ms on ms.side_id = mp.side_id
  where mp.match_participant_id = target_match_participant_id
    and mp.scoring_session_id = target_scoring_session_id
    and mp.participant_type = 'EXTERNAL';

  if target_side_type is distinct from 'EXTERNAL' then
    raise exception 'Opposition participant not found for this scoring session.';
  end if;

  update public.match_participants
  set participation_status = target_participation_status
  where match_participant_id = target_match_participant_id;
end;
$$;

revoke all on function public.set_app_scorer_opposition_participant_status(uuid,uuid,text) from public;
revoke all on function public.set_app_scorer_opposition_participant_status(uuid,uuid,text) from anon;
grant execute on function public.set_app_scorer_opposition_participant_status(uuid,uuid,text) to authenticated;
