create table public.player_external_identities (
  id bigint generated always as identity primary key,
  player_id text not null
    references public.players(player_id)
    on update cascade
    on delete restrict,

  provider text not null,
  external_player_id text not null,
  external_player_name text,

  status text not null default 'Confirmed'
    check (status in ('Confirmed', 'Inactive')),

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_external_identities_provider_external_id_key
    unique (provider, external_player_id)
);

create index player_external_identities_player_id_idx
  on public.player_external_identities(player_id);

create index player_external_identities_provider_idx
  on public.player_external_identities(provider);

alter table public.player_external_identities
  enable row level security;

create policy "Super Admins can view player external identities"
on public.player_external_identities
for select
to authenticated
using (public.is_active_super_admin());

create policy "Super Admins can create player external identities"
on public.player_external_identities
for insert
to authenticated
with check (public.is_active_super_admin());

create policy "Super Admins can update player external identities"
on public.player_external_identities
for update
to authenticated
using (public.is_active_super_admin())
with check (public.is_active_super_admin());

create policy "Super Admins can delete player external identities"
on public.player_external_identities
for delete
to authenticated
using (public.is_active_super_admin());

create or replace function public.set_player_external_identity_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_player_external_identity_updated_at
before update on public.player_external_identities
for each row
execute function public.set_player_external_identity_updated_at();