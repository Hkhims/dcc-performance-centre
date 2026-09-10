-- Harden match-import approval against duplicate and contradictory payloads.
--
-- Retains the existing match-date, external-team ownership, and player/team
-- consistency protections, while adding explicit preflight rejection for:
--   * duplicate team-entry source_match_id values;
--   * duplicate DCC team entries;
--   * duplicate player performances for one source match;
--   * one canonical player appearing for multiple DCC teams in one match.
--
-- These checks deliberately fail before canonical replacement begins so review
-- users receive clear errors instead of low-level uniqueness violations.

create or replace function public.approve_match_import(
  target_match_import_id bigint,
  target_review_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_import public.match_imports%rowtype;
  final_payload jsonb;
  correction_row record;

  payload_match jsonb;
  payload_stats jsonb;

  published_match_id text;
  payload_season integer;
  payload_match_date date;
  payload_fixture_label text;
  payload_match_status text;
  payload_is_internal boolean;

  payload_stats_category text;
  payload_official_eligible boolean;

  team_entry jsonb;
  player_entry jsonb;
  duplicate_row record;
begin
  -- =======================================================
  -- Authentication / authority
  -- =======================================================

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_import
  from public.match_imports
  where id = target_match_import_id
  for update;

  if not found then
    raise exception 'Match import % does not exist', target_match_import_id;
  end if;

  if not public.can_manage_match_import(target_match_import_id) then
    raise exception 'You are not authorised to manage this match import';
  end if;

  if target_import.validation_status = 'Blocked' then
    raise exception 'Blocked match imports cannot be approved';
  end if;

  if target_import.import_status in ('Rejected', 'Superseded') then
    raise exception
      'Match import with status % cannot be approved',
      target_import.import_status;
  end if;


  -- =======================================================
  -- Start with parsed importer payload
  -- =======================================================

  final_payload := target_import.parsed_payload;

  if final_payload is null then
    raise exception 'Match import does not contain parsed payload data';
  end if;


  -- =======================================================
  -- Apply active DCC corrections in audit order
  -- =======================================================

  for correction_row in
    select
      json_path,
      corrected_value
    from public.match_import_corrections
    where match_import_id = target_match_import_id
      and status = 'Active'
    order by id
  loop

    if correction_row.json_path is null
       or cardinality(correction_row.json_path) = 0 then
      raise exception 'Active correction has no valid json_path';
    end if;

    final_payload :=
      jsonb_set(
        final_payload,
        correction_row.json_path,
        correction_row.corrected_value,
        false
      );
  end loop;


  -- =======================================================
  -- Validate required top-level payload structure
  -- =======================================================

  if jsonb_typeof(final_payload -> 'match') <> 'object' then
    raise exception 'Payload match object is missing or invalid';
  end if;

  if jsonb_typeof(final_payload -> 'team_entries') <> 'array' then
    raise exception 'Payload team_entries array is missing or invalid';
  end if;

  if jsonb_array_length(final_payload -> 'team_entries') < 1 then
    raise exception 'Payload must contain at least one team entry';
  end if;

  if jsonb_typeof(final_payload -> 'dcc_players') <> 'array' then
    raise exception 'Payload dcc_players array is missing or invalid';
  end if;

  if jsonb_typeof(final_payload -> 'scorecard') <> 'object' then
    raise exception 'Payload scorecard object is missing or invalid';
  end if;

  if jsonb_typeof(final_payload -> 'stats') <> 'object' then
    raise exception 'Payload stats object is missing or invalid';
  end if;


  payload_match := final_payload -> 'match';
  payload_stats := final_payload -> 'stats';


  -- =======================================================
  -- Extract canonical match values
  -- =======================================================

  published_match_id :=
    nullif(trim(payload_match ->> 'match_id'), '');

  if published_match_id is null then
    raise exception 'match.match_id is required';
  end if;

  payload_season :=
    nullif(payload_match ->> 'season', '')::integer;

  if payload_season is null then
    raise exception 'match.season is required';
  end if;

  payload_match_date :=
    nullif(payload_match ->> 'match_date', '')::date;

  if payload_match_date is null then
    raise exception 'match.match_date is required';
  end if;

  payload_fixture_label :=
    nullif(trim(payload_match ->> 'fixture_label'), '');

  if payload_fixture_label is null then
    raise exception 'match.fixture_label is required';
  end if;

  payload_match_status :=
    coalesce(
      nullif(trim(payload_match ->> 'status'), ''),
      'Completed'
    );

  payload_is_internal :=
    coalesce(
      (payload_match ->> 'is_internal_dcc_match')::boolean,
      false
    );


  -- =======================================================
  -- Extract and enforce statistics classification
  -- =======================================================

  payload_stats_category :=
    nullif(trim(payload_stats ->> 'category'), '');

  if payload_stats_category is null then
    raise exception 'stats.category is required';
  end if;

  payload_official_eligible :=
    nullif(
      payload_stats ->> 'official_season_eligible',
      ''
    )::boolean;

  if payload_official_eligible is null then
    raise exception 'stats.official_season_eligible is required';
  end if;

  if payload_stats_category not in (
    'Official Season',
    'Friendly',
    'Warm-up',
    'Internal'
  ) then
    raise exception
      'Unsupported stats category: %',
      payload_stats_category;
  end if;

  -- Strict DCC rule:
  -- non-official matches must NEVER enter official season statistics.

  if payload_stats_category in (
    'Friendly',
    'Warm-up',
    'Internal'
  )
  and payload_official_eligible = true then
    raise exception
      'Non-official match category % cannot be official-season eligible',
      payload_stats_category;
  end if;


  -- =======================================================
  -- Preflight team ownership and player/team consistency
  -- =======================================================
  --
  -- A corrected or malformed payload must never be able to
  -- publish data for a DCC team that is not attached to the
  -- external match being approved.
  --
  -- Likewise, every player performance must belong to the
  -- exact team entry identified by BOTH source_match_id and
  -- team_id. The database has separate foreign keys for these
  -- fields, but those separate keys alone do not prove that
  -- they refer to the same team entry.
  -- =======================================================

  for team_entry in
    select value
    from jsonb_array_elements(final_payload -> 'team_entries')
  loop
    if nullif(trim(team_entry ->> 'source_match_id'), '') is null then
      raise exception 'Each team entry requires source_match_id';
    end if;

    if nullif(trim(team_entry ->> 'team_id'), '') is null then
      raise exception 'Each team entry requires team_id';
    end if;

    if nullif(trim(team_entry ->> 'competition_id'), '') is null then
      raise exception 'Each team entry requires competition_id';
    end if;

    if nullif(trim(team_entry ->> 'opponent_display_name'), '') is null then
      raise exception 'Each team entry requires opponent_display_name';
    end if;

    if not exists (
      select 1
      from public.external_match_teams emt
      where emt.external_match_id = target_import.external_match_id
        and emt.team_id = trim(team_entry ->> 'team_id')
    ) then
      raise exception
        'Team % is not attached to external match %',
        trim(team_entry ->> 'team_id'),
        target_import.external_match_id;
    end if;
  end loop;

  for player_entry in
    select value
    from jsonb_array_elements(final_payload -> 'dcc_players')
  loop
    if nullif(trim(player_entry ->> 'source_match_id'), '') is null then
      raise exception 'Each player performance requires source_match_id';
    end if;

    if nullif(trim(player_entry ->> 'player_id'), '') is null then
      raise exception 'Each player performance requires player_id';
    end if;

    if nullif(trim(player_entry ->> 'team_id'), '') is null then
      raise exception 'Each player performance requires team_id';
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(final_payload -> 'team_entries') te(value)
      where trim(te.value ->> 'source_match_id') =
            trim(player_entry ->> 'source_match_id')
        and trim(te.value ->> 'team_id') =
            trim(player_entry ->> 'team_id')
    ) then
      raise exception
        'Player % does not match a published team entry for source_match_id % and team %',
        trim(player_entry ->> 'player_id'),
        trim(player_entry ->> 'source_match_id'),
        trim(player_entry ->> 'team_id');
    end if;
  end loop;


  -- =======================================================
  -- Reject duplicate / contradictory payload records
  -- before canonical replacement begins
  -- =======================================================

  select
    nullif(trim(value ->> 'source_match_id'), '') as source_match_id,
    count(*) as row_count
  into duplicate_row
  from jsonb_array_elements(final_payload -> 'team_entries')
  group by nullif(trim(value ->> 'source_match_id'), '')
  having count(*) > 1
  limit 1;

  if found then
    raise exception
      'Duplicate team entry source_match_id % appears % times',
      duplicate_row.source_match_id,
      duplicate_row.row_count;
  end if;

  select
    nullif(trim(value ->> 'team_id'), '') as team_id,
    count(*) as row_count
  into duplicate_row
  from jsonb_array_elements(final_payload -> 'team_entries')
  group by nullif(trim(value ->> 'team_id'), '')
  having count(*) > 1
  limit 1;

  if found then
    raise exception
      'Duplicate team entry for team % appears % times',
      duplicate_row.team_id,
      duplicate_row.row_count;
  end if;

  select
    nullif(trim(value ->> 'source_match_id'), '') as source_match_id,
    nullif(trim(value ->> 'player_id'), '') as player_id,
    count(*) as row_count
  into duplicate_row
  from jsonb_array_elements(final_payload -> 'dcc_players')
  group by
    nullif(trim(value ->> 'source_match_id'), ''),
    nullif(trim(value ->> 'player_id'), '')
  having count(*) > 1
  limit 1;

  if found then
    raise exception
      'Duplicate player performance for player % and source_match_id % appears % times',
      duplicate_row.player_id,
      duplicate_row.source_match_id,
      duplicate_row.row_count;
  end if;

  select
    nullif(trim(value ->> 'player_id'), '') as player_id,
    count(distinct nullif(trim(value ->> 'team_id'), '')) as team_count
  into duplicate_row
  from jsonb_array_elements(final_payload -> 'dcc_players')
  group by nullif(trim(value ->> 'player_id'), '')
  having count(distinct nullif(trim(value ->> 'team_id'), '')) > 1
  limit 1;

  if found then
    raise exception
      'Player % cannot represent more than one DCC team in the same match',
      duplicate_row.player_id;
  end if;


  -- =======================================================
  -- Create/update canonical match
  -- =======================================================

  insert into public.matches (
    match_id,
    season,
    match_date,
    fixture_label,
    status,
    is_internal_dcc_match,
    stats_category,
    official_season_eligible
  )
  values (
    published_match_id,
    payload_season,
    payload_match_date,
    payload_fixture_label,
    payload_match_status,
    payload_is_internal,
    payload_stats_category,
    payload_official_eligible
  )
  on conflict (match_id)
  do update set
    season = excluded.season,
    match_date = excluded.match_date,
    fixture_label = excluded.fixture_label,
    status = excluded.status,
    is_internal_dcc_match = excluded.is_internal_dcc_match,
    stats_category = excluded.stats_category,
    official_season_eligible = excluded.official_season_eligible;


  -- =======================================================
  -- Revision-safe replacement
  --
  -- Deleting team entries also removes their player
  -- performances through the existing ON DELETE CASCADE.
  -- =======================================================

  delete from public.match_team_entries
  where match_id = published_match_id;


  -- =======================================================
  -- Publish all DCC team entries
  -- =======================================================

  for team_entry in
    select value
    from jsonb_array_elements(final_payload -> 'team_entries')
  loop

    if nullif(trim(team_entry ->> 'source_match_id'), '') is null then
      raise exception 'Each team entry requires source_match_id';
    end if;

    if nullif(trim(team_entry ->> 'team_id'), '') is null then
      raise exception 'Each team entry requires team_id';
    end if;

    if nullif(trim(team_entry ->> 'competition_id'), '') is null then
      raise exception 'Each team entry requires competition_id';
    end if;

    if nullif(trim(team_entry ->> 'opponent_display_name'), '') is null then
      raise exception 'Each team entry requires opponent_display_name';
    end if;

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
      trim(team_entry ->> 'source_match_id'),
      published_match_id,
      trim(team_entry ->> 'team_id'),
      trim(team_entry ->> 'competition_id'),
      nullif(trim(team_entry ->> 'opponent_id'), ''),
      trim(team_entry ->> 'opponent_display_name'),
      nullif(trim(team_entry ->> 'result'), ''),
      nullif(team_entry ->> 'scheduled_overs', '')::integer,
      nullif(team_entry ->> 'revised_overs', '')::integer,
      nullif(team_entry ->> 'dcc_score', '')::integer,
      nullif(team_entry ->> 'dcc_wickets', '')::integer,
      nullif(team_entry ->> 'dcc_balls', '')::integer,
      nullif(team_entry ->> 'opponent_score', '')::integer,
      nullif(team_entry ->> 'opponent_wickets', '')::integer,
      nullif(team_entry ->> 'opponent_balls', '')::integer,
      nullif(team_entry ->> 'match_notes', '')
    );
  end loop;


  -- =======================================================
  -- Publish canonical DCC player performances
  -- =======================================================

  for player_entry in
    select value
    from jsonb_array_elements(final_payload -> 'dcc_players')
  loop

    if nullif(trim(player_entry ->> 'source_match_id'), '') is null then
      raise exception 'Each player performance requires source_match_id';
    end if;

    if nullif(trim(player_entry ->> 'player_id'), '') is null then
      raise exception 'Each player performance requires player_id';
    end if;

    if nullif(trim(player_entry ->> 'team_id'), '') is null then
      raise exception 'Each player performance requires team_id';
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

      trim(player_entry ->> 'source_match_id'),
      trim(player_entry ->> 'player_id'),
      trim(player_entry ->> 'team_id'),

      coalesce((player_entry ->> 'batted')::boolean, false),
      nullif(player_entry ->> 'batting_position', '')::integer,
      nullif(player_entry ->> 'runs', '')::integer,
      nullif(player_entry ->> 'balls_faced', '')::integer,
      nullif(player_entry ->> 'fours', '')::integer,
      nullif(player_entry ->> 'sixes', '')::integer,
      nullif(player_entry ->> 'dismissal_type', ''),
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

      nullif(player_entry ->> 'performance_notes', '')
    );
  end loop;


  -- =======================================================
  -- Publish full two-innings scorecard
  -- =======================================================

  insert into public.approved_match_scorecards (
    match_id,
    scorecard
  )
  values (
    published_match_id,
    final_payload -> 'scorecard'
  )
  on conflict (match_id)
  do update set
    scorecard = excluded.scorecard;


  -- =======================================================
  -- Link external match to canonical match
  -- =======================================================

  update public.external_matches
  set
    canonical_match_id = published_match_id,
    import_status = 'Approved'
  where id = target_import.external_match_id;


  -- =======================================================
  -- Supersede any previous approved import version
  -- for this same external match
  -- =======================================================

  update public.match_imports
  set
    import_status = 'Superseded'
  where external_match_id = target_import.external_match_id
    and id <> target_match_import_id
    and import_status = 'Approved';


  -- =======================================================
  -- Mark this import approved
  -- =======================================================

  update public.match_imports
  set
    import_status = 'Approved',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    approved_by = auth.uid(),
    approved_at = now(),
    review_notes = nullif(trim(target_review_notes), '')
  where id = target_match_import_id;


  return published_match_id;
end;
$$;


revoke all
on function public.approve_match_import(
  bigint,
  text
)
from public;

grant execute
on function public.approve_match_import(
  bigint,
  text
)
to authenticated;
