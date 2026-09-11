-- Prevent approval of stale match-import versions.
--
-- The Portal UI already disables review actions for older imports,
-- but database integrity must not depend on the UI.
--
-- This trigger blocks any transition to import_status = 'Approved'
-- unless the row is the latest import for its external match.

create or replace function public.prevent_stale_match_import_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_match_import_id bigint;
begin
  -- Only inspect rows that are transitioning into Approved.
  if new.import_status <> 'Approved'
     or old.import_status = 'Approved' then
    return new;
  end if;

  select mi.id
  into latest_match_import_id
  from public.match_imports mi
  where mi.external_match_id = new.external_match_id
  order by
    mi.created_at desc,
    mi.id desc
  limit 1;

  if latest_match_import_id is distinct from new.id then
    raise exception
      'Only the latest import for this external match can be approved';
  end if;

  return new;
end;
$$;


drop trigger if exists prevent_stale_match_import_approval
on public.match_imports;

create trigger prevent_stale_match_import_approval
before update of import_status
on public.match_imports
for each row
execute function public.prevent_stale_match_import_approval();