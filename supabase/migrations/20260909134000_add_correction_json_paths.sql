alter table public.match_import_corrections
add column json_path text[];

create index match_import_corrections_json_path_idx
on public.match_import_corrections
using gin (json_path);