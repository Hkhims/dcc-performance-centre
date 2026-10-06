create or replace function public.publish_app_scorer_match(
  target_scoring_session_id uuid,
  target_result_type text,
  target_winner_side_id uuid,
  target_loser_side_id uuid,
  target_win_method text,
  target_run_margin integer,
  target_wicket_margin integer,
  target_abandonment_reason text,
  target_team_entry jsonb,
  target_dcc_players jsonb,
  target_scorecard jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  target_session public.scoring_sessions%rowtype;
  team_entry jsonb;
  player_entry jsonb;
  published_match_id text;
  published_source_match_id text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_session
  from public.scoring_sessions
  where scoring_session_id = target_scoring_session_id
  for update;

  if not found then
    raise exception 'Scoring session not found';
  end if;

  if target_session.active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can publish this match';
  end if;

  published_match_id := target_session.match_id;

  if target_session.status = 'Completed' then
    return;
  end if;

  if target_session.status <> 'FinalReview' then
    raise exception 'Match must be in Final Review before publication';
  end if;

  if target_team_entry is null
     or jsonb_typeof(target_team_entry) <> 'object' then
    raise exception 'Canonical team entry is required';
  end if;

  if target_dcc_players is null
     or jsonb_typeof(target_dcc_players) <> 'array' then
    raise exception 'Canonical DCC player performances must be an array';
  end if;

  if target_scorecard is null
     or jsonb_typeof(target_scorecard) <> 'object' then
    raise exception 'Canonical scorecard is required';
  end if;

  if nullif(trim(target_team_entry ->> 'source_match_id'), '') is null then
    raise exception 'Canonical team entry requires source_match_id';
  end if;

  if nullif(trim(target_team_entry ->> 'match_id'), '') is null
     or trim(target_team_entry ->> 'match_id') <> published_match_id then
    raise exception 'Canonical team entry match_id does not match scorer session';
  end if;

  if nullif(trim(target_team_entry ->> 'team_id'), '') is null then
    raise exception 'Canonical team entry requires team_id';
  end if;

  if not exists (
    select 1
    from public.match_sides ms
    where ms.scoring_session_id = target_scoring_session_id
      and ms.canonical_team_id = trim(target_team_entry ->> 'team_id')
  ) then
    raise exception 'Canonical team entry team does not belong to scorer session';
  end if;

  published_source_match_id :=
    trim(target_team_entry ->> 'source_match_id');

  -- Replace the DCC-centric canonical match entry.
  -- Existing player performances are removed by the
  -- source_match_id foreign key ON DELETE CASCADE.
  delete from public.match_team_entries
  where match_id = published_match_id;

  insert into public.match_team_entries (
    source_match_id,
    match_id,
    team_id,
    competition_id,
    opponent_id,
    opponent_display_name,
    result,
    scheduled_overs,
    revised_overs,
    dcc_score,
    dcc_wickets,
    dcc_balls,
    opponent_score,
    opponent_wickets,
    opponent_balls,
    match_notes
  )
  values (
    published_source_match_id,
    published_match_id,
    trim(target_team_entry ->> 'team_id'),
    nullif(trim(target_team_entry ->> 'competition_id'), ''),
    nullif(trim(target_team_entry ->> 'opponent_id'), ''),
    trim(target_team_entry ->> 'opponent_display_name'),
    nullif(trim(target_team_entry ->> 'result'), ''),
    nullif(target_team_entry ->> 'scheduled_overs', '')::integer,
    nullif(target_team_entry ->> 'revised_overs', '')::integer,
    nullif(target_team_entry ->> 'dcc_score', '')::integer,
    nullif(target_team_entry ->> 'dcc_wickets', '')::integer,
    nullif(target_team_entry ->> 'dcc_balls', '')::integer,
    nullif(target_team_entry ->> 'opponent_score', '')::integer,
    nullif(target_team_entry ->> 'opponent_wickets', '')::integer,
    nullif(target_team_entry ->> 'opponent_balls', '')::integer,
    nullif(trim(target_team_entry ->> 'match_notes'), '')
  );

  for player_entry in
    select value
    from jsonb_array_elements(target_dcc_players)
  loop
    if nullif(trim(player_entry ->> 'player_id'), '') is null then
      raise exception 'Each player performance requires player_id';
    end if;

    if nullif(trim(player_entry ->> 'team_id'), '') is null then
      raise exception 'Each player performance requires team_id';
    end if;

    if trim(player_entry ->> 'team_id')
       <> trim(target_team_entry ->> 'team_id') then
      raise exception 'Player performance team does not match canonical team entry';
    end if;

    insert into public.player_match_performances (
      performance_id,
      source_match_id,
      player_id,
      team_id,

      batted,
      batting_position,
      runs,
      balls_faced,
      fours,
      sixes,
      dismissal_type,
      is_not_out,

      bowled,
      bowling_balls,
      maidens,
      runs_conceded,
      wickets,
      wides,
      no_balls,

      wickets_bowled,
      wickets_caught,
      wickets_lbw,
      wickets_stumped,
      wickets_caught_and_bowled,
      wickets_hit_wicket,

      catches,
      stumpings,
      run_outs,

      performance_notes
    )
    values (
      published_match_id
        || '-'
        || trim(player_entry ->> 'player_id')
        || '-'
        || trim(player_entry ->> 'team_id'),

      published_source_match_id,
      trim(player_entry ->> 'player_id'),
      trim(player_entry ->> 'team_id'),

      coalesce((player_entry ->> 'batted')::boolean, false),
      nullif(player_entry ->> 'batting_position', '')::integer,
      nullif(player_entry ->> 'runs', '')::integer,
      nullif(player_entry ->> 'balls_faced', '')::integer,
      nullif(player_entry ->> 'fours', '')::integer,
      nullif(player_entry ->> 'sixes', '')::integer,
      nullif(trim(player_entry ->> 'dismissal_type'), ''),
      nullif(player_entry ->> 'is_not_out', '')::boolean,

      coalesce((player_entry ->> 'bowled')::boolean, false),
      nullif(player_entry ->> 'bowling_balls', '')::integer,
      nullif(player_entry ->> 'maidens', '')::integer,
      nullif(player_entry ->> 'runs_conceded', '')::integer,
      nullif(player_entry ->> 'wickets', '')::integer,
      nullif(player_entry ->> 'wides', '')::integer,
      nullif(player_entry ->> 'no_balls', '')::integer,

      nullif(player_entry ->> 'wickets_bowled', '')::integer,
      nullif(player_entry ->> 'wickets_caught', '')::integer,
      nullif(player_entry ->> 'wickets_lbw', '')::integer,
      nullif(player_entry ->> 'wickets_stumped', '')::integer,
      nullif(player_entry ->> 'wickets_caught_and_bowled', '')::integer,
      nullif(player_entry ->> 'wickets_hit_wicket', '')::integer,

      nullif(player_entry ->> 'catches', '')::integer,
      nullif(player_entry ->> 'stumpings', '')::integer,
      nullif(player_entry ->> 'run_outs', '')::integer,

      nullif(trim(player_entry ->> 'performance_notes'), '')
    );
  end loop;

  insert into public.approved_match_scorecards (
    match_id,
    scorecard
  )
  values (
    published_match_id,
    target_scorecard
  )
  on conflict (match_id)
  do update set
    scorecard = excluded.scorecard;

  insert into public.app_scorer_match_results (
    scoring_session_id,
    result_type,
    winner_side_id,
    loser_side_id,
    win_method,
    run_margin,
    wicket_margin,
    abandonment_reason
  )
  values (
    target_scoring_session_id,
    target_result_type,
    target_winner_side_id,
    target_loser_side_id,
    target_win_method,
    target_run_margin,
    target_wicket_margin,
    nullif(trim(target_abandonment_reason), '')
  )
  on conflict (scoring_session_id)
  do update set
    result_type = excluded.result_type,
    winner_side_id = excluded.winner_side_id,
    loser_side_id = excluded.loser_side_id,
    win_method = excluded.win_method,
    run_margin = excluded.run_margin,
    wicket_margin = excluded.wicket_margin,
    abandonment_reason = excluded.abandonment_reason;

  update public.matches
  set status = 'Completed'
  where match_id = published_match_id;

  -- Keep this LAST.
  --
  -- The MatchResultPublished notification trigger observes this
  -- FinalReview -> Completed transition. Because the whole RPC is one
  -- transaction, the notification cannot exist without the canonical
  -- publication above succeeding as well.
  update public.scoring_sessions
  set
    status = 'Completed',
    completed_at = now(),
    updated_at = now()
  where scoring_session_id = target_scoring_session_id;
end;
$$;

revoke all
on function public.publish_app_scorer_match(
  uuid,
  text,
  uuid,
  uuid,
  text,
  integer,
  integer,
  text,
  jsonb,
  jsonb,
  jsonb
)
from public, anon;

grant execute
on function public.publish_app_scorer_match(
  uuid,
  text,
  uuid,
  uuid,
  text,
  integer,
  integer,
  text,
  jsonb,
  jsonb,
  jsonb
)
to authenticated;