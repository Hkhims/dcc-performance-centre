-- Add an audited rejection action for NV Play match imports.
--
-- Rejection is deliberately separate from approval:
--   * it never alters canonical DCC match/statistics tables;
--   * it requires an authenticated Captain/Super Admin with authority
--     over the relevant DCC team;
--   * it requires a human review reason;
--   * only the latest pending import may be rejected;
--   * an existing approved canonical match remains authoritative if a
--     later Changed Upstream import is rejected.

create or replace function public.reject_match_import(
  target_match_import_id bigint,
  target_review_notes text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_import public.match_imports%rowtype;
  target_external_match public.external_matches%rowtype;

  latest_match_import_id bigint;
  cleaned_review_notes text;
begin
  -- =======================================================
  -- Authentication
  -- =======================================================

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;


  -- =======================================================
  -- Rejection reason is mandatory
  -- =======================================================

  cleaned_review_notes := nullif(trim(target_review_notes), '');

  if cleaned_review_notes is null then
    raise exception 'A rejection reason is required';
  end if;


  -- =======================================================
  -- Lock and validate target import
  -- =======================================================

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


  -- =======================================================
  -- Authority
  -- =======================================================

  if not public.can_manage_match_import(target_match_import_id) then
    raise exception
      'You are not authorised to manage this match import';
  end if;


  -- =======================================================
  -- Only pending imports can be rejected
  --
  -- Blocked is a validation_status, not an import_status.
  -- A Blocked import therefore remains rejectable while its
  -- import_status is Needs Review.
  -- =======================================================

  if target_import.import_status not in (
    'Imported',
    'Needs Review'
  ) then
    raise exception
      'Match import with status % cannot be rejected',
      target_import.import_status;
  end if;


  -- =======================================================
  -- Lock the external match
  --
  -- This serialises the decision against other review actions
  -- affecting the same external match.
  -- =======================================================

  select *
  into target_external_match
  from public.external_matches
  where id = target_import.external_match_id
  for update;

  if not found then
    raise exception
      'External match % does not exist',
      target_import.external_match_id;
  end if;


  -- =======================================================
  -- Stale-import protection
  --
  -- Only the newest import for an external match may be
  -- rejected. Older versions remain available for audit/history
  -- but must never be acted upon as the current review candidate.
  -- =======================================================

  select mi.id
  into latest_match_import_id
  from public.match_imports mi
  where mi.external_match_id = target_import.external_match_id
  order by
    mi.created_at desc,
    mi.id desc
  limit 1;

  if latest_match_import_id is distinct from target_match_import_id then
    raise exception
      'Only the latest import for this external match can be rejected';
  end if;


  -- =======================================================
  -- Mark the import rejected
  --
  -- Rejection records the reviewer and reason but does not
  -- touch canonical match/statistics data.
  -- =======================================================

  update public.match_imports
  set
    import_status = 'Rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_notes = cleaned_review_notes
  where id = target_match_import_id;


  -- =======================================================
  -- Restore the correct external-match state
  --
  -- If a canonical match already exists, a previously approved
  -- DCC version remains authoritative. This commonly occurs when
  -- NV Play changes upstream after publication and the reviewer
  -- rejects the changed version.
  --
  -- If no canonical match exists, the external match itself is
  -- considered rejected.
  -- =======================================================

  update public.external_matches
  set
    import_status =
      case
        when target_external_match.canonical_match_id is not null
          then 'Approved'
        else 'Rejected'
      end
  where id = target_import.external_match_id;


  return 'Rejected';
end;
$$;


-- =========================================================
-- Function permissions
-- =========================================================

revoke all
on function public.reject_match_import(
  bigint,
  text
)
from public;

grant execute
on function public.reject_match_import(
  bigint,
  text
)
to authenticated;