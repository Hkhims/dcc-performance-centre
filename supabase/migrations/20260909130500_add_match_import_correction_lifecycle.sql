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


create or replace function public.resolve_match_import_correction(
  target_correction_id bigint,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_correction public.match_import_corrections%rowtype;
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
    raise exception 'Only an active correction can be resolved';
  end if;

  if nullif(trim(target_reason), '') is null then
    raise exception 'A resolution reason is required';
  end if;

  update public.match_import_corrections
  set
    status = 'Resolved',
    reason = reason || E'\n\nResolution: ' || trim(target_reason)
  where id = target_correction_id;

  update public.match_imports
  set
    import_status = 'Needs Review',
    validation_status = 'Review Required',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = existing_correction.match_import_id;
end;
$$;


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


revoke all
on function public.resolve_match_import_correction(
  bigint,
  text
)
from public;

grant execute
on function public.resolve_match_import_correction(
  bigint,
  text
)
to authenticated;