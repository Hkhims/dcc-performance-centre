alter table public.competitions
drop constraint competitions_competition_type_check;

alter table public.competitions
add constraint competitions_competition_type_check
check (
    competition_type in (
        'League',
        'Cup',
        'Internal Match',
        'Friendly',
        'Warm-up Match'
    )
);