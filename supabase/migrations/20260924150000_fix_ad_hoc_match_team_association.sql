-- ============================================================
-- Fix ad-hoc DCC match creation
--
-- Friendly / Warm-up creation must create a complete canonical
-- scheduled fixture, including its DCC team association.
--
-- Internal DCC-v-DCC matches deliberately remain outside this
-- RPC because they require two DCC team entries and will use a
-- dedicated creation workflow.
-- ============================================================


-- ------------------------------------------------------------
-- Replace the original function contract.
--
-- PostgreSQL cannot change an existing function's input
-- signature with CREATE OR REPLACE, so remove the old overload
-- before creating the corrected team-aware version.
-- ------------------------------------------------------------

drop function if exists public.create_ad_hoc_dcc_match(
  integer,
  date,
  timestamp with time zone,
  text,
  text,
  text,
  text
);


create or replace function public.create_ad_hoc_dcc_match(
  target_team_id text,
  target_season integer,
  target_match_date date,
  target_start_datetime timestamp with time zone,
  target_fixture_label text,
  target_stats_category text,
  target_opponent_display_name text,
  target_venue_name text default null,
  target_home_away text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_match_id text;
  new_source_match_id text;

  clean_team_id text;
  clean_fixture_label text;
  clean_stats_category text;
  clean_opponent_display_name text;
  clean_venue_name text;
  clean_home_away text;

  resolved_competition_id text;
  resolved_competition_type text;
  resolved_competition_name text;
begin
  -- ----------------------------------------------------------
  -- Authentication / authority
  -- ----------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_create_ad_hoc_dcc_match() then
    raise exception
      'You are not authorised to create an ad-hoc DCC match';
  end if;


  -- ----------------------------------------------------------
  -- Validate DCC team
  -- ----------------------------------------------------------

  clean_team_id :=
    nullif(trim(target_team_id), '');

  if clean_team_id is null then
    raise exception 'A DCC team is required';
  end if;

  perform 1
  from public.teams
  where team_id = clean_team_id;

  if not found then
    raise exception
      'DCC team % does not exist',
      clean_team_id;
  end if;


  -- ----------------------------------------------------------
  -- Validate season
  -- ----------------------------------------------------------

  if target_season is null then
    raise exception 'A season is required';
  end if;

  perform 1
  from public.seasons
  where season = target_season;

  if not found then
    raise exception
      'Season % does not exist',
      target_season;
  end if;


  -- ----------------------------------------------------------
  -- Validate fixture date / time
  -- ----------------------------------------------------------

  if target_match_date is null then
    raise exception 'A match date is required';
  end if;

  if target_start_datetime is not null
     and (target_start_datetime at time zone 'Europe/London')::date
       <> target_match_date then
    raise exception
      'Match date must match the supplied start date';
  end if;


  -- ----------------------------------------------------------
  -- Validate fixture label
  -- ----------------------------------------------------------

  clean_fixture_label :=
    nullif(trim(target_fixture_label), '');

  if clean_fixture_label is null then
    raise exception 'A fixture label is required';
  end if;


  -- ----------------------------------------------------------
  -- Validate category
  --
  -- This function is deliberately restricted to Friendly and
  -- Warm-up fixtures.
  --
  -- Official Season fixtures come from the authorised NCU /
  -- NV Play path.
  --
  -- Internal DCC-v-DCC matches require two DCC team entries
  -- and will use a separate dedicated function.
  -- ----------------------------------------------------------

  clean_stats_category :=
    nullif(trim(target_stats_category), '');

  if clean_stats_category is null then
    raise exception 'A match category is required';
  end if;

  if clean_stats_category not in (
    'Friendly',
    'Warm-up'
  ) then
    raise exception
      'Ad-hoc team matches must be Friendly or Warm-up';
  end if;


  -- ----------------------------------------------------------
  -- Validate opponent
  -- ----------------------------------------------------------

  clean_opponent_display_name :=
    nullif(trim(target_opponent_display_name), '');

  if clean_opponent_display_name is null then
    raise exception 'An opponent name is required';
  end if;


  -- ----------------------------------------------------------
  -- Validate optional venue / home-away information
  -- ----------------------------------------------------------

  clean_venue_name :=
    nullif(trim(target_venue_name), '');

  clean_home_away :=
    nullif(trim(target_home_away), '');

  if clean_home_away is not null
     and clean_home_away not in (
       'Home',
       'Away',
       'Neutral'
     ) then
    raise exception
      'Home/away value must be Home, Away or Neutral';
  end if;


  -- ----------------------------------------------------------
  -- Resolve the season-specific non-competitive competition.
  --
  -- competitions.competition_type uses:
  --   Friendly
  --   Warm-up Match
  --
  -- matches.stats_category uses:
  --   Friendly
  --   Warm-up
  -- ----------------------------------------------------------

  if clean_stats_category = 'Friendly' then
    resolved_competition_type := 'Friendly';
    resolved_competition_name := 'Friendly';
  else
    resolved_competition_type := 'Warm-up Match';
    resolved_competition_name := 'Warm-up Match';
  end if;

  select competition_id
  into resolved_competition_id
  from public.competitions
  where season = target_season
    and competition_type = resolved_competition_type
  order by competition_id
  limit 1;


  -- ----------------------------------------------------------
  -- Create the season-specific competition record if this is
  -- the first ad-hoc match of that category for the season.
  --
  -- Generate a collision-resistant text identifier rather than
  -- relying on the historical C01/C02/etc naming convention.
  -- ----------------------------------------------------------

  if resolved_competition_id is null then
    resolved_competition_id :=
      'ADHOC-' ||
      target_season::text ||
      '-' ||
      upper(replace(resolved_competition_type, ' ', '-')) ||
      '-' ||
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    insert into public.competitions (
      competition_id,
      season,
      competition_name,
      competition_type
    )
    values (
      resolved_competition_id,
      target_season,
      resolved_competition_name,
      resolved_competition_type
    )
    on conflict (season, competition_name)
    do nothing;

    select competition_id
    into resolved_competition_id
    from public.competitions
    where season = target_season
      and competition_name = resolved_competition_name
    limit 1;
  end if;

  if resolved_competition_id is null then
    raise exception
      'Unable to resolve the competition for this ad-hoc match';
  end if;


  -- ----------------------------------------------------------
  -- Generate canonical identifiers
  -- ----------------------------------------------------------

  new_match_id :=
    gen_random_uuid()::text;

  new_source_match_id :=
    'dcc-app-' || new_match_id;


  -- ----------------------------------------------------------
  -- Create canonical scheduled match
  -- ----------------------------------------------------------

  insert into public.matches (
    match_id,
    season,
    match_date,
    start_datetime,
    fixture_label,
    status,
    is_internal_dcc_match,
    stats_category,
    official_season_eligible,
    venue_name,
    home_away,
    created_by,
    updated_at
  )
  values (
    new_match_id,
    target_season,
    target_match_date,
    target_start_datetime,
    clean_fixture_label,
    'Scheduled',
    false,
    clean_stats_category,
    false,
    clean_venue_name,
    clean_home_away,
    auth.uid(),
    now()
  );


  -- ----------------------------------------------------------
  -- Associate the canonical match with the DCC playing team.
  --
  -- opponent_id remains null because an ad-hoc external
  -- opponent does not need to exist in the canonical opponents
  -- directory merely to create a Friendly/Warm-up fixture.
  -- ----------------------------------------------------------

  insert into public.match_team_entries (
    source_match_id,
    match_id,
    team_id,
    competition_id,
    opponent_id,
    opponent_display_name
  )
  values (
    new_source_match_id,
    new_match_id,
    clean_team_id,
    resolved_competition_id,
    null,
    clean_opponent_display_name
  );


  -- ----------------------------------------------------------
  -- Give the creator match-specific administrative authority.
  -- ----------------------------------------------------------

  insert into public.match_admin_assignments (
    match_id,
    user_id,
    active,
    assigned_at,
    assigned_by
  )
  values (
    new_match_id,
    auth.uid(),
    true,
    now(),
    auth.uid()
  );


  return new_match_id;
end;
$function$;


-- ------------------------------------------------------------
-- Function privileges
-- ------------------------------------------------------------

revoke all on function public.create_ad_hoc_dcc_match(
  text,
  integer,
  date,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  text
)
from public;

revoke all on function public.create_ad_hoc_dcc_match(
  text,
  integer,
  date,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  text
)
from anon;

grant execute on function public.create_ad_hoc_dcc_match(
  text,
  integer,
  date,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  text
)
to authenticated;