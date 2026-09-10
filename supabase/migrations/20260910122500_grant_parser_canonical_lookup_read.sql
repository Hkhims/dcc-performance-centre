-- Allow the trusted NV Play parser backend to perform read-only
-- canonical match reconciliation.
--
-- The parser must be able to look up an existing canonical DCC match
-- by team + date + competition before generating a new match_id.
-- This is intentionally SELECT-only: the parser still cannot write
-- directly to canonical match/statistics tables. Canonical publication
-- remains exclusively behind the approval workflow.

grant select
on public.matches,
   public.match_team_entries
to service_role;
