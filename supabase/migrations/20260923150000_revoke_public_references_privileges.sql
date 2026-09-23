-- Prevent anonymous and authenticated users from creating
-- foreign-key constraints referencing these cricket tables.
-- Existing foreign keys are unaffected.

REVOKE REFERENCES ON TABLE
  public.approved_match_scorecards,
  public.external_match_teams,
  public.external_matches,
  public.match_import_corrections,
  public.match_imports,
  public.match_team_entries,
  public.matches,
  public.player_match_performances
FROM anon, authenticated;