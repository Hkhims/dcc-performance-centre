-- =========================================================
-- NV Play importer backend privileges
-- =========================================================

-- Read canonical DCC reference/mapping data.
grant select
on public.players,
   public.teams,
   public.competitions,
   public.seasons,
   public.player_external_identities,
   public.external_team_mappings,
   public.external_competition_mappings
to service_role;


-- Importer-owned ingestion/workflow tables.
grant select, insert, update, delete
on public.external_matches,
   public.external_match_teams,
   public.external_match_snapshots,
   public.match_imports
to service_role;


-- Importer may need to inspect corrections when processing
-- later upstream revisions, but it must not create/edit them.
grant select
on public.match_import_corrections
to service_role;


-- Importer/backend creates system notifications.
grant select, insert
on public.notifications
to service_role;


-- Identity-backed bigint tables use generated identity sequences.
grant usage, select
on all sequences in schema public
to service_role;


-- Ensure the backend can invoke the review notification action.
grant execute
on function public.notify_match_import_review(bigint)
to service_role;