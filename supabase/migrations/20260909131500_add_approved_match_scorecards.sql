create table public.approved_match_scorecards (
  match_id text primary key
    references public.matches(match_id)
    on update cascade
    on delete cascade,

  scorecard jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.approved_match_scorecards
  enable row level security;

create policy "Public can view approved match scorecards"
on public.approved_match_scorecards
for select
to anon, authenticated
using (true);

create or replace function public.set_approved_match_scorecard_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_approved_match_scorecard_updated_at
before update on public.approved_match_scorecards
for each row
execute function public.set_approved_match_scorecard_updated_at();