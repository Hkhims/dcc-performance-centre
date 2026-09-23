-- DCC NV Play nightly scheduler (installation only).
-- During April–September, 21:00 UTC is 22:00 UK time (BST).
-- Cron jobs are deliberately NOT activated in this migration.
-- The shared Edge Function secret is retrieved from Supabase Vault.

create schema if not exists dcc_internal;

create table if not exists dcc_internal.nvplay_scheduler_runs (
  id bigint generated always as identity primary key,
  season integer not null,
  status text not null default 'importing'
    check (status in ('importing', 'parsing', 'completed', 'failed', 'stalled')),
  importer_request_id bigint,
  parser_request_id bigint,
  importer_result jsonb,
  parser_result jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  importer_finished_at timestamptz,
  finished_at timestamptz
);

-- Keep stalled runs in the lockout until manually investigated.
create unique index if not exists nvplay_scheduler_one_active_run
  on dcc_internal.nvplay_scheduler_runs ((true))
  where status in ('importing', 'parsing', 'stalled');

revoke all on schema dcc_internal from public, anon, authenticated;
revoke all on all tables in schema dcc_internal from public, anon, authenticated;

create or replace function dcc_internal.scheduler_secret()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_value text;
begin
  select ds.decrypted_secret
    into strict secret_value
  from vault.decrypted_secrets as ds
  where ds.name = 'dcc_import_scheduler_secret';

  if secret_value is null or secret_value = '' then
    raise exception 'DCC scheduler secret is not configured';
  end if;
  return secret_value;
exception
  when no_data_found then
    raise exception 'DCC scheduler secret is not configured';
  when too_many_rows then
    raise exception 'DCC scheduler secret name is duplicated';
end;
$$;

-- One run at a time, including any run stalled awaiting investigation.
create or replace function dcc_internal.start_nvplay_run()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_run_id bigint;
  request_id bigint;
  secret_value text;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(20260923, 1) then
    return;
  end if;

  if extract(month from now() at time zone 'UTC') not between 4 and 9 then
    return;
  end if;

  if exists (
    select 1
    from dcc_internal.nvplay_scheduler_runs
    where status in ('importing', 'parsing', 'stalled')
  ) then
    return;
  end if;

  secret_value := dcc_internal.scheduler_secret();

  insert into dcc_internal.nvplay_scheduler_runs (season)
  values (extract(year from now() at time zone 'UTC')::integer)
  returning id into new_run_id;

  request_id := net.http_post(
    url := 'https://cwcssonsrgorvblgzzzy.supabase.co/functions/v1/nvplay-importer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dcc-scheduler-secret', secret_value
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );

  update dcc_internal.nvplay_scheduler_runs
  set importer_request_id = request_id
  where id = new_run_id;
end;
$$;

-- Called by a separate completion-check cron job after testing.
-- The importer must finish successfully before the parser is invoked.
create or replace function dcc_internal.check_nvplay_run()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_run record;
  http_result record;
  result_body jsonb;
  request_id bigint;
  secret_value text;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(20260923, 2) then
    return;
  end if;

  select *
    into active_run
  from dcc_internal.nvplay_scheduler_runs
  where status in ('importing', 'parsing')
  order by id
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  -- Do not release the one-run lockout if the HTTP request may still be active.
  if now() - coalesce(active_run.importer_finished_at, active_run.started_at)
     > interval '30 minutes' then
    update dcc_internal.nvplay_scheduler_runs
    set status = 'stalled',
        error_message = 'HTTP response timeout; manual investigation required',
        finished_at = now()
    where id = active_run.id;
    return;
  end if;

  if active_run.status = 'importing' then
    select *
      into http_result
    from net._http_response
    where id = active_run.importer_request_id;

    if not found then
      return;
    end if;

    begin
      result_body := http_result.content::jsonb;
    exception when others then
      result_body := '{}'::jsonb;
    end;

    -- Fail closed if the importer response is malformed, incomplete, or partial.
    if http_result.status_code is distinct from 200
       or result_body->>'success' is distinct from 'true'
       or result_body->>'season' is distinct from active_run.season::text
       or not (
         case
           when jsonb_typeof(result_body->'scorecardFailures') = 'number'
             then result_body->>'scorecardFailures' = '0'
           else false
         end
       )
       or not (
         case
           when jsonb_typeof(result_body->'snapshotFailures') = 'array'
             then jsonb_array_length(result_body->'snapshotFailures') = 0
           else false
         end
       ) then
      update dcc_internal.nvplay_scheduler_runs
      set status = 'failed',
          importer_result = result_body,
          error_message = 'Importer reported an unsuccessful or incomplete response',
          importer_finished_at = now(),
          finished_at = now()
      where id = active_run.id;
      return;
    end if;

    secret_value := dcc_internal.scheduler_secret();
    request_id := net.http_post(
      url := 'https://cwcssonsrgorvblgzzzy.supabase.co/functions/v1/nvplay-parser',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-dcc-scheduler-secret', secret_value
      ),
      body := jsonb_build_object('season', active_run.season),
      timeout_milliseconds := 300000
    );

    update dcc_internal.nvplay_scheduler_runs
    set status = 'parsing',
        importer_result = result_body,
        importer_finished_at = now(),
        parser_request_id = request_id
    where id = active_run.id;
    return;
  end if;

  if active_run.status = 'parsing' then
    select *
      into http_result
    from net._http_response
    where id = active_run.parser_request_id;

    if not found then
      return;
    end if;

    begin
      result_body := http_result.content::jsonb;
    exception when others then
      result_body := '{}'::jsonb;
    end;

    if http_result.status_code = 200
       and result_body->>'success' = 'true'
       and result_body->>'season' = active_run.season::text
       and (
         case
           when jsonb_typeof(result_body->'failures') = 'array'
             then jsonb_array_length(result_body->'failures') = 0
           else false
         end
       ) then
      update dcc_internal.nvplay_scheduler_runs
      set status = 'completed',
          parser_result = result_body,
          finished_at = now()
      where id = active_run.id;
    else
      update dcc_internal.nvplay_scheduler_runs
      set status = 'failed',
          parser_result = result_body,
          error_message = 'Parser reported an unsuccessful or incomplete response',
          finished_at = now()
      where id = active_run.id;
    end if;
  end if;
end;
$$;

-- Keep the internal functions inaccessible to public API roles.
revoke all on function dcc_internal.scheduler_secret() from public, anon, authenticated;
revoke all on function dcc_internal.start_nvplay_run() from public, anon, authenticated;
revoke all on function dcc_internal.check_nvplay_run() from public, anon, authenticated;

-- Deliberately no cron.schedule calls here: activate only after manual QA.
