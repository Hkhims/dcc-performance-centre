create or replace function public.notify_match_import_review(
  target_match_import_id bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_import public.match_imports%rowtype;
  target_external_match public.external_matches%rowtype;

  recipient_count integer := 0;
  inserted_count integer := 0;

  notification_title text;
  notification_message text;
begin
  -- =======================================================
  -- Only trusted backend execution or Super Admin
  -- may trigger system notifications.
  -- =======================================================

  if coalesce(
    current_setting('request.jwt.claim.role', true),
    ''
  ) <> 'service_role'
  and not public.is_active_super_admin()
  then
    raise exception
      'You are not authorised to create match review notifications';
  end if;


  -- =======================================================
  -- Find import and external match
  -- =======================================================

  select *
  into target_import
  from public.match_imports
  where id = target_match_import_id;

  if not found then
    raise exception
      'Match import % does not exist',
      target_match_import_id;
  end if;


  select *
  into target_external_match
  from public.external_matches
  where id = target_import.external_match_id;

  if not found then
    raise exception
      'External match for import % does not exist',
      target_match_import_id;
  end if;


  -- =======================================================
  -- Build notification text
  -- =======================================================

  notification_title :=
    coalesce(
      nullif(
        trim(
          concat_ws(
            ' vs ',
            target_external_match.external_home_team_name,
            target_external_match.external_away_team_name
          )
        ),
        ''
      ),
      'DCC Match'
    )
    || ' — Review Required';


  notification_message :=
    case target_import.validation_status
      when 'Clean' then
        'This imported match is ready for review and approval.'
      when 'Review Required' then
        'This imported match contains an item that requires review.'
      when 'Blocked' then
        'This imported match is currently blocked and requires attention.'
      else
        'This imported match requires review.'
    end;


  -- =======================================================
  -- Count active Team Admin recipients
  -- across every DCC team attached to the match.
  -- =======================================================

  select count(distinct taa.user_id)
  into recipient_count
  from public.external_match_teams emt
  join public.team_admin_assignments taa
    on taa.team_id = emt.team_id
  join public.user_profiles up
    on up.user_id = taa.user_id
  where emt.external_match_id = target_import.external_match_id
    and taa.active = true
    and up.status = 'Active';


  -- =======================================================
  -- Normal path:
  -- notify every active Team Admin for the attached team(s).
  --
  -- Do not create another identical unread notification.
  -- =======================================================

  if recipient_count > 0 then

    insert into public.notifications (
      user_id,
      notification_type,
      entity_type,
      entity_id,
      title,
      message
    )
    select distinct
      taa.user_id,
      'Match Review Required',
      'match_import',
      target_match_import_id::text,
      notification_title,
      notification_message
    from public.external_match_teams emt
    join public.team_admin_assignments taa
      on taa.team_id = emt.team_id
    join public.user_profiles up
      on up.user_id = taa.user_id
    where emt.external_match_id = target_import.external_match_id
      and taa.active = true
      and up.status = 'Active'
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = taa.user_id
          and n.notification_type = 'Match Review Required'
          and n.entity_type = 'match_import'
          and n.entity_id = target_match_import_id::text
          and n.read_at is null
      );

    get diagnostics inserted_count = row_count;

    return inserted_count;
  end if;


  -- =======================================================
  -- Fallback:
  -- if no active Team Admin exists, notify all
  -- active Super Admins.
  -- =======================================================

  insert into public.notifications (
    user_id,
    notification_type,
    entity_type,
    entity_id,
    title,
    message
  )
  select
    up.user_id,
    'Match Review Required',
    'match_import',
    target_match_import_id::text,
    notification_title,
    notification_message
      || ' No active Team Admin is currently assigned to this match.'
  from public.user_profiles up
  where up.account_role = 'Super Admin'
    and up.status = 'Active'
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = up.user_id
        and n.notification_type = 'Match Review Required'
        and n.entity_type = 'match_import'
        and n.entity_id = target_match_import_id::text
        and n.read_at is null
    );

  get diagnostics inserted_count = row_count;

  return inserted_count;
end;
$$;


revoke all
on function public.notify_match_import_review(bigint)
from public;

grant execute
on function public.notify_match_import_review(bigint)
to authenticated;

grant execute
on function public.notify_match_import_review(bigint)
to service_role;