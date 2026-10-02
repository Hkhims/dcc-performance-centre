create or replace function public.abandon_app_scorer_match(
  target_scoring_session_id uuid,
  target_abandonment_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  session_match_id text;
  session_status text;
  session_active_scorer_id uuid;
  cleaned_reason text;
  existing_result public.app_scorer_match_results%rowtype;
begin
  current_user_id := auth.uid();
  cleaned_reason := nullif(trim(target_abandonment_reason), '');

  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_scoring_session_id is null then
    raise exception 'A scoring session is required.';
  end if;

  if cleaned_reason is null then
    raise exception 'An abandonment reason is required.';
  end if;

  select
    ss.match_id,
    ss.status,
    ss.active_scorer_id
  into
    session_match_id,
    session_status,
    session_active_scorer_id
  from public.scoring_sessions ss
  where ss.scoring_session_id = target_scoring_session_id
  for update;

  if not found then
    raise exception 'Scoring session not found.';
  end if;

  if not public.can_use_app_scorer(session_match_id) then
    raise exception
      'You do not have permission to use App Scorer for this match.';
  end if;

  if session_active_scorer_id is distinct from current_user_id then
    raise exception 'Only the active scorer can abandon the match.';
  end if;

  -- Exact retries are idempotent.
  if session_status = 'Abandoned' then
    select *
    into existing_result
    from public.app_scorer_match_results
    where scoring_session_id = target_scoring_session_id;

    if not found then
      raise exception
        'Abandoned scoring session does not have a persisted result.';
    end if;

    if existing_result.result_type = 'ABANDONED'
       and existing_result.abandonment_reason = cleaned_reason then
      return;
    end if;

    raise exception
      'Scoring session is already abandoned with a different result.';
  end if;

  if session_status not in ('Ready', 'InProgress', 'FinalReview') then
    raise exception
      'This scoring session cannot be abandoned from its current status.';
  end if;

  insert into public.app_scorer_match_results (
    scoring_session_id,
    result_type,
    winner_side_id,
    loser_side_id,
    win_method,
    run_margin,
    wicket_margin,
    abandonment_reason
  ) values (
    target_scoring_session_id,
    'ABANDONED',
    null,
    null,
    null,
    null,
    null,
    cleaned_reason
  );

  update public.scoring_sessions
  set
    status = 'Abandoned',
    completed_at = now(),
    updated_at = now()
  where scoring_session_id = target_scoring_session_id;

  update public.matches
  set status = 'Abandoned'
  where match_id = session_match_id;
end;
$$;

revoke all on function public.abandon_app_scorer_match(
  uuid, text
) from public;

revoke all on function public.abandon_app_scorer_match(
  uuid, text
) from anon;

grant execute on function public.abandon_app_scorer_match(
  uuid, text
) to authenticated;