create table public.match_import_corrections (
  id bigint generated always as identity primary key,

  match_import_id bigint not null
    references public.match_imports(id)
    on update cascade
    on delete restrict,

  entity_type text not null,
  entity_key text not null,
  field_name text not null,

  original_value jsonb,
  corrected_value jsonb not null,

  reason text not null,

  status text not null default 'Active'
    check (
      status in (
        'Active',
        'Resolved',
        'Superseded'
      )
    ),

  created_by uuid not null
    references auth.users(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  superseded_by bigint
    references public.match_import_corrections(id)
    on delete set null,

  superseded_at timestamptz
);

create index match_import_corrections_match_import_id_idx
  on public.match_import_corrections(match_import_id);

create index match_import_corrections_status_idx
  on public.match_import_corrections(status);

create index match_import_corrections_entity_idx
  on public.match_import_corrections(
    match_import_id,
    entity_type,
    entity_key,
    field_name
  );

alter table public.match_import_corrections
  enable row level security;

create policy "Super Admins can view match import corrections"
on public.match_import_corrections
for select
to authenticated
using (public.is_active_super_admin());

create policy "Super Admins can create match import corrections"
on public.match_import_corrections
for insert
to authenticated
with check (public.is_active_super_admin());

create policy "Super Admins can update match import corrections"
on public.match_import_corrections
for update
to authenticated
using (public.is_active_super_admin())
with check (public.is_active_super_admin());