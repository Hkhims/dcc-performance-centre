alter table public.matches
add column stats_category text not null default 'Official Season'
  check (
    stats_category in (
      'Official Season',
      'Friendly',
      'Warm-up',
      'Internal'
    )
  );

alter table public.matches
add column official_season_eligible boolean not null default true;

create index matches_official_season_eligible_idx
  on public.matches(official_season_eligible);

create index matches_stats_category_idx
  on public.matches(stats_category);