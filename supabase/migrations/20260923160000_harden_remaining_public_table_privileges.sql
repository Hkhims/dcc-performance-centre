-- Remove unnecessary privileges from the remaining public tables.
-- Anonymous and authenticated users do not need to truncate tables,
-- create database triggers or create foreign-key constraints.
-- Existing data, triggers, foreign keys and ordinary CRUD grants remain unchanged.

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.competitions,
  public.external_competition_mappings,
  public.external_match_snapshots,
  public.external_team_mappings,
  public.league_standings,
  public.match_stories,
  public.notifications,
  public.opponents,
  public.player_external_identities,
  public.player_profile_claims,
  public.player_profiles,
  public.players,
  public.seasons,
  public.team_admin_assignments,
  public.team_profiles,
  public.teams,
  public.user_profiles
FROM anon, authenticated;