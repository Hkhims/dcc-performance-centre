-- ============================================================
-- Add audited match-specific player reassignment.
--
-- Purpose:
--   Allow an authorised Team Admin / Super Admin to correct the
--   canonical DCC player attached to one imported performance
--   without changing the permanent NV Play identity mapping or
--   the immutable source identity stored in the parsed payload.
--
-- Example:
--   NV Play says Mahesh Nilewar played.
--   DCC confirms Himanshu Kashyap actually played under Mahesh's
--   NV Play identity for this match only.
--
-- The correction therefore changes only:
--
--   dcc_players[index].player_id
--
-- source_identity remains untouched so the original NV Play
-- identity is permanently preserved for audit purposes.
-- ============================================================


create or replace function public.reassign_match_import_player(
  target_match_import_id bigint,
  target_player_index integer,
  target_player_id text,
  target_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_import public.match_imports%rowtype;
  latest_import_id bigint;

  target_players jsonb;
  target_player jsonb;

  original_player_id text;
  target_team_id text;
  target_source_match_id text;

  replacement_player_name text;

  target_json_path text[];

  existing_active_correction
    public.match_import_corrections%rowtype;

  reviewed_player_id text;
  reviewed_source_match_id text;

  duplicate_found boolean := false;

  new_correction_id bigint;
begin
  -- ----------------------------------------------------------
  -- Authentication and import authority
  -- ----------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_match_import_id is null
     or target_match_import_id <= 0 then
    raise exception 'A valid match import id is required';
  end if;

  if target_player_index is null
     or target_player_index < 0 then
    raise exception 'A valid player index is required';
  end if;

  if nullif(trim(target_player_id), '') is null then
    raise exception 'A replacement player is required';
  end if;

  if nullif(trim(target_reason), '') is null then
    raise exception 'A reassignment reason is required';
  end if;

  select *
  into target_import
  from public.match_imports
  where id = target_match_import_id
  for update;

  if not found then
    raise exception
      'Match import % does not exist',
      target_match_import_id;
  end if;

  if not public.can_manage_match_import(
    target_match_import_id
  ) then
    raise exception
      'You are not authorised to manage this match import';
  end if;

  if target_import.import_status not in (
    'Imported',
    'Needs Review'
  ) then
    raise exception
      'Players cannot be reassigned for an import with status %',
      target_import.import_status;
  end if;

  select id
  into latest_import_id
  from public.match_imports
  where external_match_id =
    target_import.external_match_id
  order by created_at desc, id desc
  limit 1;

  if latest_import_id is distinct from
     target_match_import_id then
    raise exception
      'Only the latest import for this match can be corrected';
  end if;


  -- ----------------------------------------------------------
  -- Validate replacement canonical player
  -- ----------------------------------------------------------

  select player_name
  into replacement_player_name
  from public.players
  where player_id = trim(target_player_id)
    and active = true;

  if not found then
    raise exception
      'Replacement player % does not exist or is inactive',
      trim(target_player_id);
  end if;


  -- ----------------------------------------------------------
  -- Locate the imported player performance
  -- ----------------------------------------------------------

  if target_import.parsed_payload is null then
    raise exception
      'Match import does not contain parsed payload data';
  end if;

  target_players :=
    target_import.parsed_payload -> 'dcc_players';

  if target_players is null
     or jsonb_typeof(target_players) <> 'array' then
    raise exception
      'Match import does not contain a valid dcc_players array';
  end if;

  if target_player_index >=
     jsonb_array_length(target_players) then
    raise exception
      'Player index % does not exist in this match import',
      target_player_index;
  end if;

  target_player :=
    target_players -> target_player_index;

  if target_player is null
     or jsonb_typeof(target_player) <> 'object' then
    raise exception
      'Player index % does not contain a valid player performance',
      target_player_index;
  end if;

  original_player_id :=
    nullif(
      trim(
        target_player ->> 'player_id'
      ),
      ''
    );

  target_team_id :=
    nullif(
      trim(
        target_player ->> 'team_id'
      ),
      ''
    );

  target_source_match_id :=
    nullif(
      trim(
        target_player ->> 'source_match_id'
      ),
      ''
    );

  if original_player_id is null then
    raise exception
      'Imported player performance does not contain player_id';
  end if;

  if target_team_id is null then
    raise exception
      'Imported player performance does not contain team_id';
  end if;

  if target_source_match_id is null then
    raise exception
      'Imported player performance does not contain source_match_id';
  end if;

  target_json_path :=
    array[
      'dcc_players',
      target_player_index::text,
      'player_id'
    ];


  -- ----------------------------------------------------------
  -- Determine the currently reviewed identity.
  --
  -- There may already be an Active correction for this exact
  -- player_id path. If so, that corrected value is the current
  -- reviewed identity and a new reassignment must supersede it.
  -- ----------------------------------------------------------

  select *
  into existing_active_correction
  from public.match_import_corrections
  where match_import_id =
      target_match_import_id
    and status = 'Active'
    and json_path = target_json_path
  order by id desc
  limit 1
  for update;

  if found then
    if jsonb_typeof(
      existing_active_correction.corrected_value
    ) <> 'string' then
      raise exception
        'Existing player identity correction is invalid';
    end if;

    reviewed_player_id :=
      nullif(
        trim(
          existing_active_correction.corrected_value #>> '{}'
        ),
        ''
      );
  else
    reviewed_player_id :=
      original_player_id;
  end if;

  if reviewed_player_id is null then
    raise exception
      'Current reviewed player identity could not be resolved';
  end if;

  if reviewed_player_id =
     trim(target_player_id) then
    raise exception
      'Replacement player is already the reviewed player for this performance';
  end if;


  -- ----------------------------------------------------------
  -- Prevent duplicate canonical player performances.
  --
  -- Build the reviewed identity for every other dcc_players row
  -- by applying any Active correction to that row's player_id.
  --
  -- A replacement is invalid when it would cause the same
  -- canonical player to appear twice for the same source match.
  -- ----------------------------------------------------------

  select exists (
    select 1
    from jsonb_array_elements(
      target_players
    ) with ordinality as player_row(
      player_payload,
      ordinal
    )
    left join lateral (
      select
        correction.corrected_value
      from public.match_import_corrections
        as correction
      where correction.match_import_id =
          target_match_import_id
        and correction.status = 'Active'
        and correction.json_path =
          array[
            'dcc_players',
            (player_row.ordinal - 1)::text,
            'player_id'
          ]
      order by correction.id desc
      limit 1
    ) active_identity
      on true
    cross join lateral (
      select
        coalesce(
          case
            when jsonb_typeof(
              active_identity.corrected_value
            ) = 'string'
            then nullif(
              trim(
                active_identity.corrected_value #>> '{}'
              ),
              ''
            )
            else null
          end,
          nullif(
            trim(
              player_row.player_payload ->> 'player_id'
            ),
            ''
          )
        ) as player_id,

        nullif(
          trim(
            player_row.player_payload ->> 'source_match_id'
          ),
          ''
        ) as source_match_id
    ) reviewed_identity
    where
      (player_row.ordinal - 1) <>
        target_player_index
      and reviewed_identity.source_match_id =
        target_source_match_id
      and reviewed_identity.player_id =
        trim(target_player_id)
  )
  into duplicate_found;

  if duplicate_found then
    raise exception
      'Player % already has a performance for this DCC team in this match',
      replacement_player_name;
  end if;


  -- ----------------------------------------------------------
  -- Create or supersede the audited correction.
  --
  -- Use the existing generic correction functions so identity
  -- reassignment shares the same audit lifecycle as all other
  -- reviewed import corrections.
  -- ----------------------------------------------------------

  if existing_active_correction.id is not null then
    new_correction_id :=
      public.supersede_match_import_correction(
        existing_active_correction.id,
        to_jsonb(trim(target_player_id)),
        trim(target_reason)
      );
  else
    new_correction_id :=
      public.create_match_import_correction(
        target_match_import_id,
        'player_identity',
        original_player_id,
        'player_id',
        target_json_path,
        to_jsonb(original_player_id),
        to_jsonb(trim(target_player_id)),
        trim(target_reason)
      );
  end if;

  return new_correction_id;
end;
$$;


-- ============================================================
-- Resolve / undo a match-specific player reassignment.
--
-- This deliberately wraps the generic correction resolver so
-- callers cannot use this endpoint to resolve unrelated match
-- corrections.
-- ============================================================

create or replace function public.resolve_match_import_player_reassignment(
  target_correction_id bigint,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_correction
    public.match_import_corrections%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_correction_id is null
     or target_correction_id <= 0 then
    raise exception 'A valid correction id is required';
  end if;

  if nullif(trim(target_reason), '') is null then
    raise exception 'A resolution reason is required';
  end if;

  select *
  into target_correction
  from public.match_import_corrections
  where id = target_correction_id
  for update;

  if not found then
    raise exception
      'Correction % does not exist',
      target_correction_id;
  end if;

  if target_correction.status <> 'Active' then
    raise exception
      'Only an active player reassignment can be resolved';
  end if;

  if target_correction.entity_type <>
       'player_identity'
     or target_correction.field_name <>
       'player_id'
     or target_correction.json_path is null
     or cardinality(
       target_correction.json_path
     ) <> 3
     or target_correction.json_path[1] <>
       'dcc_players'
     or target_correction.json_path[3] <>
       'player_id' then
    raise exception
      'Correction % is not a player identity reassignment',
      target_correction_id;
  end if;

  perform
    public.resolve_match_import_correction(
      target_correction_id,
      trim(target_reason)
    );
end;
$$;


-- ============================================================
-- Permissions
-- ============================================================

revoke all
on function public.reassign_match_import_player(
  bigint,
  integer,
  text,
  text
)
from public;

grant execute
on function public.reassign_match_import_player(
  bigint,
  integer,
  text,
  text
)
to authenticated;


revoke all
on function public.resolve_match_import_player_reassignment(
  bigint,
  text
)
from public;

grant execute
on function public.resolve_match_import_player_reassignment(
  bigint,
  text
)
to authenticated;