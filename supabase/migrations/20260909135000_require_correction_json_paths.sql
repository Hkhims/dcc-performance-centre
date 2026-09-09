create or replace function public.create_match_import_correction(
  target_match_import_id bigint,
  target_entity_type text,
  target_entity_key text,
  target_field_name text,
  target_json_path text[],
  target_original_value jsonb,
  target_corrected_value jsonb,
  target_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_correction_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_match_import(target_match_import_id) then
    raise exception 'You are not authorised to manage this match import';
  end if;

  if nullif(trim(target_entity_type), '') is null then
    raise exception 'entity_type is required';
  end if;

  if nullif(trim(target_entity_key), '') is null then
    raise exception 'entity_key is required';
  end if;

  if nullif(trim(target_field_name), '') is null then
    raise exception 'field_name is required';
  end if;

  if target_json_path is null
     or cardinality(target_json_path) = 0 then
    raise exception 'json_path is required';
  end if;

  if target_corrected_value is null then
    raise exception 'corrected_value is required';
  end if;

  if nullif(trim(target_reason), '') is null then
    raise exception 'A correction reason is required';
  end if;

  insert into public.match_import_corrections (
    match_import_id,
    entity_type,
    entity_key,
    field_name,
    json_path,
    original_value,
    corrected_value,
    reason,
    status,
    created_by
  )
  values (
    target_match_import_id,
    trim(target_entity_type),
    trim(target_entity_key),
    trim(target_field_name),
    target_json_path,
    target_original_value,
    target_corrected_value,
    trim(target_reason),
    'Active',
    auth.uid()
  )
  returning id into new_correction_id;

  update public.match_imports
  set
    import_status = 'Needs Review',
    validation_status = 'Review Required',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = target_match_import_id;

  return new_correction_id;
end;
$$;


create or replace function public.supersede_match_import_correction(
  target_correction_id bigint,
  target_corrected_value jsonb,
  target_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_correction public.match_import_corrections%rowtype;
  new_correction_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into existing_correction
  from public.match_import_corrections
  where id = target_correction_id;

  if not found then
    raise exception 'Correction % does not exist', target_correction_id;
  end if;

  if not public.can_manage_match_import(existing_correction.match_import_id) then
    raise exception 'You are not authorised to manage this match import';
  end if;

  if existing_correction.status <> 'Active' then
    raise exception 'Only an active correction can be superseded';
  end if;

  if existing_correction.json_path is null
     or cardinality(existing_correction.json_path) = 0 then
    raise exception 'Existing correction does not have a valid json_path';
  end if;

  if target_corrected_value is null then
    raise exception 'corrected_value is required';
  end if;

  if nullif(trim(target_reason), '') is null then
    raise exception 'A correction reason is required';
  end if;

  insert into public.match_import_corrections (
    match_import_id,
    entity_type,
    entity_key,
    field_name,
    json_path,
    original_value,
    corrected_value,
    reason,
    status,
    created_by
  )
  values (
    existing_correction.match_import_id,
    existing_correction.entity_type,
    existing_correction.entity_key,
    existing_correction.field_name,
    existing_correction.json_path,
    existing_correction.corrected_value,
    target_corrected_value,
    trim(target_reason),
    'Active',
    auth.uid()
  )
  returning id into new_correction_id;

  update public.match_import_corrections
  set
    status = 'Superseded',
    superseded_by = new_correction_id,
    superseded_at = now()
  where id = target_correction_id;

  update public.match_imports
  set
    import_status = 'Needs Review',
    validation_status = 'Review Required',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = existing_correction.match_import_id;

  return new_correction_id;
end;
$$;


-- Remove the old create function signature so clients cannot bypass json_path.

drop function if exists public.create_match_import_correction(
  bigint,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text
);


revoke all
on function public.create_match_import_correction(
  bigint,
  text,
  text,
  text,
  text[],
  jsonb,
  jsonb,
  text
)
from public;

grant execute
on function public.create_match_import_correction(
  bigint,
  text,
  text,
  text,
  text[],
  jsonb,
  jsonb,
  text
)
to authenticated;


revoke all
on function public.supersede_match_import_correction(
  bigint,
  jsonb,
  text
)
from public;

grant execute
on function public.supersede_match_import_correction(
  bigint,
  jsonb,
  text
)
to authenticated;