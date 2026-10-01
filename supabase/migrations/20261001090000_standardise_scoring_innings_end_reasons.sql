-- ============================================================================
-- DCC App Scorer — standardise innings end reasons
-- ============================================================================

alter table public.scoring_innings
  drop constraint scoring_innings_end_reason_check;

alter table public.scoring_innings
  add constraint scoring_innings_end_reason_check
  check (
    end_reason is null
    or end_reason in (
      'TARGET_REACHED',
      'BALL_LIMIT_REACHED',
      'ALL_OUT',
      'DECLARED',
      'MANUAL',
      'RETIRED_CLOSED',
      'ABANDONED'
    )
  );
