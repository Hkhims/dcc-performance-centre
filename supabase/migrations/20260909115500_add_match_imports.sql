create table public.match_imports (
  id bigint generated always as identity primary key,

  external_match_id bigint not null
    references public.external_matches(id)
    on update cascade
    on delete restrict,

  snapshot_id bigint not null
    references public.external_match_snapshots(id)
    on update cascade
    on delete restrict,

  parsed_payload jsonb not null,

  validation_status text not null default 'Blocked'
    check (
      validation_status in (
        'Clean',
        'Review Required',
        'Blocked'
      )
    ),

  import_status text not null default 'Imported'
    check (
      import_status in (
        'Imported',
        'Needs Review',
        'Approved',
        'Rejected',
        'Superseded'
      )
    ),

  imported_at timestamptz not null default now(),

  reviewed_by uuid
    references auth.users(id)
    on delete set null,

  reviewed_at timestamptz,

  approved_by uuid
    references auth.users(id)
    on delete set null,

  approved_at timestamptz,

  review_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint match_imports_snapshot_id_key
    unique (snapshot_id)
);

create index match_imports_external_match_id_idx
  on public.match_imports(external_match_id);

create index match_imports_import_status_idx
  on public.match_imports(import_status);

create index match_imports_validation_status_idx
  on public.match_imports(validation_status);

alter table public.match_imports
  enable row level security;

create policy "Super Admins can view match imports"
on public.match_imports
for select
to authenticated
using (public.is_active_super_admin());

create policy "Super Admins can create match imports"
on public.match_imports
for insert
to authenticated
with check (public.is_active_super_admin());

create policy "Super Admins can update match imports"
on public.match_imports
for update
to authenticated
using (public.is_active_super_admin())
with check (public.is_active_super_admin());

create or replace function public.set_match_import_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_match_import_updated_at
before update on public.match_imports
for each row
execute function public.set_match_import_updated_at();