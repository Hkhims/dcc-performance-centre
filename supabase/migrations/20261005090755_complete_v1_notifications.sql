-- ============================================================================
-- DCC Portal — Complete V1 notifications
-- ============================================================================
--
-- Adds the three outstanding locked V1 notification events:
--
--   1. MatchStarted
--      Created when an App Scorer session first transitions to InProgress.
--
--   2. MatchResultPublished
--      Created when an App Scorer session transitions to Completed.
--
--   3. AvailabilityReminder
--      Created once an Open availability poll has been open for at least
--      24 hours, for audience members who still have no availability response.
--
-- TeamSelectionPublished already exists and is intentionally left unchanged.
--
-- Lifecycle notifications are driven from durable scoring-session transitions
-- rather than duplicated inside the large App Scorer RPCs.
--
-- Database uniqueness provides the final idempotency barrier.
-- ============================================================================


-- ============================================================================
-- 1. Idempotency indexes
-- ============================================================================

create unique index if not exists notifications_match_started_unique
on public.notifications (user_id, entity_id)
where notification_type = 'MatchStarted'
  and entity_type = 'Match'
  and entity_id is not null;


create unique index if not exists notifications_match_result_published_unique
on public.notifications (user_id, entity_id)
where notification_type = 'MatchResultPublished'
  and entity_type = 'Match'
  and entity_id is not null;


-- Availability reminders belong to a specific availability poll rather than
-- merely to a match. This matters because availability is modelled per poll.
create unique index if not exists notifications_availability_reminder_unique
on public.notifications (user_id, entity_id)
where notification_type = 'AvailabilityReminder'
  and entity_type = 'MatchAvailabilityPoll'
  and entity_id is not null;


-- ============================================================================
-- 2. Match lifecycle notification helper
-- ============================================================================

create or replace function public.create_app_scorer_match_lifecycle_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_label_value text;
  dcc_team_id text;
  team_name_value text;
begin
  -- --------------------------------------------------------------------------
  -- Only the two locked lifecycle transitions are relevant.
  -- --------------------------------------------------------------------------
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('InProgress', 'Completed') then
    return new;
  end if;

  -- Match Start is specifically the first durable transition into InProgress.
  if new.status = 'InProgress'
     and old.status not in ('Setup', 'Ready') then
    return new;
  end if;

  -- Result publication is the successful transition into Completed.
  if new.status = 'Completed'
     and old.status <> 'FinalReview' then
    return new;
  end if;


  -- --------------------------------------------------------------------------
  -- Resolve canonical match context.
  -- --------------------------------------------------------------------------
  select m.fixture_label
  into fixture_label_value
  from public.matches m
  where m.match_id = new.match_id;

  if not found then
    raise exception
      'Cannot create App Scorer notification: match % was not found.',
      new.match_id;
  end if;


  -- App Scorer V1 supports one DCC side against an external opponent.
  select mte.team_id
  into dcc_team_id
  from public.match_team_entries mte
  where mte.match_id = new.match_id
    and mte.team_id is not null
  limit 1;

  if dcc_team_id is null then
    raise exception
      'Cannot create App Scorer notification: DCC team was not found for match %.',
      new.match_id;
  end if;


  select t.team_name
  into team_name_value
  from public.teams t
  where t.team_id = dcc_team_id;

  if not found then
    raise exception
      'Cannot create App Scorer notification: DCC team % was not found.',
      dcc_team_id;
  end if;


  if fixture_label_value is null
     or btrim(fixture_label_value) = '' then
    fixture_label_value := team_name_value || ' fixture';
  end if;


  -- --------------------------------------------------------------------------
  -- Recipients
  --
  -- Reuse the established TeamSelectionPublished audience model:
  --   * current active members of the relevant DCC team;
  --   * Playing / Reserve players explicitly selected for this match;
  --   * only players with an Active Portal account.
  -- --------------------------------------------------------------------------
  if new.status = 'InProgress' then

    with recipient_players as (
      select distinct tpm.player_id
      from public.team_player_memberships tpm
      join public.players p
        on p.player_id = tpm.player_id
      where tpm.team_id = dcc_team_id
        and tpm.active = true
        and p.active = true

      union

      select distinct msp.player_id
      from public.match_selections ms
      join public.match_selection_players msp
        on msp.selection_id = ms.selection_id
      join public.players p
        on p.player_id = msp.player_id
      where ms.match_id = new.match_id
        and ms.team_id = dcc_team_id
        and ms.status = 'Published'
        and msp.selection_role in ('Playing', 'Reserve')
        and p.active = true
    ),
    recipient_users as (
      select distinct up.user_id
      from recipient_players rp
      join public.user_profiles up
        on up.player_id = rp.player_id
      where up.status = 'Active'
    )
    insert into public.notifications (
      user_id,
      notification_type,
      entity_type,
      entity_id,
      title,
      message
    )
    select
      ru.user_id,
      'MatchStarted',
      'Match',
      new.match_id,
      'Match Started',
      fixture_label_value || ' has started.'
    from recipient_users ru
    on conflict do nothing;


  elsif new.status = 'Completed' then

    with recipient_players as (
      select distinct tpm.player_id
      from public.team_player_memberships tpm
      join public.players p
        on p.player_id = tpm.player_id
      where tpm.team_id = dcc_team_id
        and tpm.active = true
        and p.active = true

      union

      select distinct msp.player_id
      from public.match_selections ms
      join public.match_selection_players msp
        on msp.selection_id = ms.selection_id
      join public.players p
        on p.player_id = msp.player_id
      where ms.match_id = new.match_id
        and ms.team_id = dcc_team_id
        and ms.status = 'Published'
        and msp.selection_role in ('Playing', 'Reserve')
        and p.active = true
    ),
    recipient_users as (
      select distinct up.user_id
      from recipient_players rp
      join public.user_profiles up
        on up.player_id = rp.player_id
      where up.status = 'Active'
    )
    insert into public.notifications (
      user_id,
      notification_type,
      entity_type,
      entity_id,
      title,
      message
    )
    select
      ru.user_id,
      'MatchResultPublished',
      'Match',
      new.match_id,
      'Match Result Published',
      'The result for ' || fixture_label_value || ' has been published.'
    from recipient_users ru
    on conflict do nothing;

  end if;

  return new;
end;
$$;


revoke all
on function public.create_app_scorer_match_lifecycle_notifications()
from public, anon, authenticated;


drop trigger if exists
  create_app_scorer_match_lifecycle_notifications_trigger
on public.scoring_sessions;


create trigger create_app_scorer_match_lifecycle_notifications_trigger
after update of status
on public.scoring_sessions
for each row
when (old.status is distinct from new.status)
execute function public.create_app_scorer_match_lifecycle_notifications();


-- ============================================================================
-- 3. Availability reminder worker
-- ============================================================================
--
-- The worker is deliberately idempotent.
--
-- Eligibility:
--   * poll is still Open;
--   * original opened_at is at least 24 hours old;
--   * player belongs to the snapshotted poll audience;
--   * player is still active;
--   * player has no response row (derived Not Responded);
--   * player has an Active Portal account.
--
-- Reopening does not create a new reminder cycle because opened_at is not
-- reset and the unique index allows only one reminder per user per poll.
-- ============================================================================

create or replace function public.create_due_availability_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  with due_recipients as (
    select distinct
      map.poll_id,
      map.match_id,
      up.user_id,
      m.fixture_label
    from public.match_availability_polls map
    join public.match_availability_audience maa
      on maa.poll_id = map.poll_id
    join public.players p
      on p.player_id = maa.player_id
     and p.active = true
    join public.user_profiles up
      on up.player_id = maa.player_id
     and up.status = 'Active'
    join public.matches m
      on m.match_id = map.match_id
    left join public.match_availability ma
      on ma.poll_id = map.poll_id
     and ma.player_id = maa.player_id
    where map.status = 'Open'
      and map.opened_at <= now() - interval '24 hours'
      and ma.player_id is null
  ),
  inserted as (
    insert into public.notifications (
      user_id,
      notification_type,
      entity_type,
      entity_id,
      title,
      message
    )
    select
      dr.user_id,
      'AvailabilityReminder',
      'MatchAvailabilityPoll',
      dr.poll_id::text,
      'Availability Reminder',
      'Please respond to your availability for '
        || coalesce(
             nullif(btrim(dr.fixture_label), ''),
             'your upcoming fixture'
           )
        || '.'
    from due_recipients dr
    on conflict do nothing
    returning id
  )
  select count(*)
  into inserted_count
  from inserted;

  return inserted_count;
end;
$$;


revoke all
on function public.create_due_availability_reminders()
from public, anon, authenticated;


-- ============================================================================
-- 4. Schedule availability-reminder processing
-- ============================================================================
--
-- pg_cron is already part of the DCC database infrastructure.
-- Hourly execution is sufficient for the V1 "24 hours after opening" rule:
-- reminders will be created on the first hourly run after the 24-hour point.
-- ============================================================================

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'dcc-availability-reminders-v1';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'dcc-availability-reminders-v1',
    '0 * * * *',
    'select public.create_due_availability_reminders();'
  );
end;
$$;