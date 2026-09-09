drop index if exists public.external_matches_team_id_idx;

alter table public.external_matches
drop column team_id;