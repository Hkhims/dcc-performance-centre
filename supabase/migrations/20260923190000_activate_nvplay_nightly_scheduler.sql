-- Activate the DCC NV Play nightly scheduler.
-- 21:00 UTC = 22:00 UK time during April–September.
-- The completion checker runs year-round so that an import
-- started on 30 September can finish after midnight.

select cron.schedule(
  'dcc-nvplay-nightly-import',
  '0 21 * 4-9 *',
  'select dcc_internal.start_nvplay_run();'
);

select cron.schedule(
  'dcc-nvplay-completion-check',
  '* * * * *',
  'select dcc_internal.check_nvplay_run();'
);