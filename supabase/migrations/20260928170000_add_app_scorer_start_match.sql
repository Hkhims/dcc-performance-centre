-- ============================================================
-- DCC Portal / App
-- App Scorer Start Match foundation
--
-- Purpose:
--   Create or obtain the durable App Scorer setup context for an
--   eligible Friendly or Warm-up fixture.
--
-- Principles:
--   * public.matches remains the canonical match identity.
--   * One scoring session exists per canonical match.
--   * Start Match creates setup context; it does NOT start innings.
--   * Published Team Selection records intention.
--   * Only Published Playing players are copied into the initial
--     DCC match-participant pool.
--   * Reserves are not assumed to participate.
--   * Copied participants begin as AVAILABLE, not PARTICIPATED.
--   * Opposition players are added later during match-day setup.
--   * Toss, opening players and innings creation happen later.
--   * The operation is idempotent for an already-created session.
-- ============================================================


create or replace function public.start_app_scorer_match(
  target_match_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  normalised_match_id text;

  target_match_status text;
  target_stats_category text;
  target_is_internal boolean;
  target_official_season_eligible boolean;

  dcc_team_id text;
  dcc_team_name text;
  opponent_name text;

  dcc_entry_count integer;

  published_selection_id bigint;

  existing_session_id uuid;
  new_session_id uuid;

  dcc_side_id uuid;
  opposition_side_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;


  normalised_match_id := nullif(btrim(target_match_id), '');

  if normalised_match_id is null then
    raise exception 'Match ID is required.';
  end if;


  -- Lock the canonical fixture while scorer setup is established.
  --
  -- This also ensures that the match really exists before any scorer
  -- persistence is created.
  select
    m.status,
    m.stats_category,
    m.is_internal_dcc_match,
    m.official_season_eligible
  into
    target_match_status,
    target_stats_category,
    target_is_internal,
    target_official_season_eligible
  from public.matches m
  where m.match_id = normalised_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;


  -- Keep the V1 scorer boundary explicit here as well as in
  -- can_use_app_scorer().
  if target_match_status <> 'Scheduled' then
    raise exception
      'App Scorer can only be started for a scheduled match.';
  end if;

  if coalesce(target_is_internal, false) = true then
    raise exception
      'Internal matches are not yet enabled for App Scorer.';
  end if;

  if target_stats_category not in ('Friendly', 'Warm-up') then
    raise exception
      'App Scorer is only available for Friendly and Warm-up matches.';
  end if;

  if coalesce(target_official_season_eligible, false) = true then
    raise exception
      'Official-season matches cannot use App Scorer.';
  end if;


  if not public.can_use_app_scorer(normalised_match_id) then
    raise exception
      'You do not have permission to start App Scorer for this match.';
  end if;


  -- Idempotency:
  -- If setup has already been created for this canonical match,
  -- return the existing authoritative scoring session.
  --
  -- Permission and match eligibility are deliberately checked first.
  select ss.scoring_session_id
  into existing_session_id
  from public.scoring_sessions ss
  where ss.match_id = normalised_match_id
  limit 1;

  if existing_session_id is not null then
    return existing_session_id;
  end if;


  -- Migration 1 currently enables the scorer only for the ordinary
  -- DCC-v-opposition Friendly/Warm-up workflow. Exactly one DCC
  -- match_team_entry must therefore exist.
  select count(*)
  into dcc_entry_count
  from public.match_team_entries mte
  where mte.match_id = normalised_match_id;

  if dcc_entry_count <> 1 then
    raise exception
      'App Scorer currently requires exactly one DCC team entry for the match.';
  end if;


  select
    mte.team_id,
    t.team_name,
    nullif(btrim(mte.opponent_display_name), '')
  into
    dcc_team_id,
    dcc_team_name,
    opponent_name
  from public.match_team_entries mte
  join public.teams t
    on t.team_id = mte.team_id
  where mte.match_id = normalised_match_id
  limit 1;

  if dcc_team_id is null then
    raise exception 'DCC team could not be determined for this match.';
  end if;

  if dcc_team_name is null
     or btrim(dcc_team_name) = '' then
    raise exception 'DCC team name is missing.';
  end if;

  if opponent_name is null then
    raise exception 'Opponent name is missing.';
  end if;


  -- Start Match uses the published Playing Team as its initial
  -- intention snapshot. Draft selections are never copied.
  select ms.selection_id
  into published_selection_id
  from public.match_selections ms
  where ms.match_id = normalised_match_id
    and ms.team_id = dcc_team_id
    and ms.status = 'Published'
  limit 1;

  if published_selection_id is null then
    raise exception
      'A Published Team Selection is required before App Scorer can be started.';
  end if;


  insert into public.scoring_sessions (
    match_id,
    status,
    active_scorer_id,
    created_by
  )
  values (
    normalised_match_id,
    'Setup',
    current_user_id,
    current_user_id
  )
  returning scoring_session_id
  into new_session_id;


  insert into public.match_sides (
    scoring_session_id,
    side_number,
    side_type,
    canonical_team_id,
    display_name
  )
  values (
    new_session_id,
    1,
    'DCC_TEAM',
    dcc_team_id,
    dcc_team_name
  )
  returning side_id
  into dcc_side_id;


  insert into public.match_sides (
    scoring_session_id,
    side_number,
    side_type,
    canonical_team_id,
    display_name
  )
  values (
    new_session_id,
    2,
    'EXTERNAL',
    null,
    opponent_name
  )
  returning side_id
  into opposition_side_id;


  -- Team Selection records intention.
  --
  -- These rows establish the initial match-day participant pool only.
  -- They are NOT evidence that the players actually participated.
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
  select
    new_session_id,
    dcc_side_id,
    'DCC',
    p.player_id,
    p.player_name,
    'PLAYING',
    'AVAILABLE',
    current_user_id
  from public.match_selection_players msp
  join public.players p
    on p.player_id = msp.player_id
  where msp.selection_id = published_selection_id
    and msp.selection_role = 'Playing'
  order by
    msp.selection_order nulls last,
    p.player_id;


  -- A Published selection should already guarantee at least one
  -- Playing player. Keep a defensive assertion here because scorer
  -- setup should never exist with an empty DCC participant pool.
  if not exists (
    select 1
    from public.match_participants mp
    where mp.scoring_session_id = new_session_id
      and mp.side_id = dcc_side_id
      and mp.participant_type = 'DCC'
      and mp.participant_role = 'PLAYING'
  ) then
    raise exception
      'Published Team Selection contains no Playing players.';
  end if;


  return new_session_id;
end;
$$;


-- ============================================================
-- Function permissions
-- ============================================================

revoke all
on function public.start_app_scorer_match(text)
from public;

revoke all
on function public.start_app_scorer_match(text)
from anon;

grant execute
on function public.start_app_scorer_match(text)
to authenticated;
