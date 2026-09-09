create table public.external_match_snapshots (
  id bigint generated always as identity primary key,

  external_match_id bigint not null
    references public.external_matches(id)
    on update cascade
    on delete restrict,

  payload jsonb not null,
  payload_hash text not null,

  fetched_at timestamptz not null default now(),

  constraint external_match_snapshots_match_hash_key
    unique (external_match_id, payload_hash)
);

create index external_match_snapshots_external_match_id_idx
  on public.external_match_snapshots(external_match_id);

create index external_match_snapshots_fetched_at_idx
  on public.external_match_snapshots(fetched_at desc);

alter table public.external_match_snapshots
  enable row level security;

create policy "Super Admins can view external match snapshots"
on public.external_match_snapshots
for select
to authenticated
using (public.is_active_super_admin());

create policy "Super Admins can create external match snapshots"
on public.external_match_snapshots
for insert
to authenticated
with check (public.is_active_super_admin());