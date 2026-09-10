begin;

-- ============================================================================
-- DCC 2026 canonical data audit preservation
-- ============================================================================
--
-- This migration preserves verified corrections identified during the full
-- 2026 reconciliation of DCC canonical match data against NV Play.
--
-- NV Play was used as an independent validation source, NOT as an automatic
-- authority. Every discrepancy represented below was manually reviewed before
-- the canonical record was corrected.
--
-- Legitimate NV Play differences that should NOT be "fixed" are documented
-- later in this file.
-- ============================================================================


-- ============================================================================
-- 1. MATCH DATE CORRECTION
-- ============================================================================

-- Midweek 2 vs Cregagh MW was played on 23 June 2026.
-- The canonical record previously contained 23 July 2026.

update matches
set match_date = date '2026-06-23'
where match_id = 'M2026-MIDWEEK-2-04';


-- ============================================================================
-- 2. BATTING CORRECTIONS
-- ============================================================================

-- Vamsi Vunnam - DCC 1-11
update player_match_performances
set
  runs = 7,
  balls_faced = 26,
  fours = 1,
  sixes = 0
where source_match_id = 'DCC 1-11'
  and player_id = 'P063';


-- Veera Pasupuleti - DCC 3-08
update player_match_performances
set
  runs = 11,
  balls_faced = 19,
  fours = 0,
  sixes = 0
where source_match_id = 'DCC 3-08'
  and player_id = 'P059';


-- Manjunath Prabhudeva - Midweek 2-09
update player_match_performances
set
  runs = 30,
  balls_faced = 26,
  fours = 4,
  sixes = 1
where source_match_id = 'Midweek 2-09'
  and player_id = 'P024';


-- ============================================================================
-- 3. BOWLING CORRECTIONS
-- ============================================================================

-- DCC 1-14
-- Siddhesh Patil and Onkar Jadhav had their bowling figures swapped in the
-- earlier canonical data.

update player_match_performances
set
  bowling_balls = 36,
  maidens = 0,
  runs_conceded = 41,
  wickets = 1,
  wides = 2,
  no_balls = 0
where source_match_id = 'DCC 1-14'
  and player_id = 'P050';


update player_match_performances
set
  bowling_balls = 12,
  maidens = 0,
  runs_conceded = 5,
  wickets = 0,
  wides = 4,
  no_balls = 0
where source_match_id = 'DCC 1-14'
  and player_id = 'P033';


-- DCC 4-03
-- Arnav Sharma bowled one over.
-- Pavan Mare did not bowl.

update player_match_performances
set
  bowling_balls = 6,
  maidens = 0,
  runs_conceded = 3,
  wickets = 0,
  wides = 1,
  no_balls = 0
where source_match_id = 'DCC 4-03'
  and player_id = 'P005';


update player_match_performances
set
  bowling_balls = null,
  maidens = null,
  runs_conceded = null,
  wickets = null,
  wides = null,
  no_balls = null
where source_match_id = 'DCC 4-03'
  and player_id = 'P035';


-- DCC 4-05
-- Gourav Saini bowled no wides.

update player_match_performances
set wides = 0
where source_match_id = 'DCC 4-05'
  and player_id = 'P013';


-- DCC 4-12
-- Wides and no-balls reconstructed and verified from the NV Play scorecard.

update player_match_performances
set wides = 3, no_balls = 0
where source_match_id = 'DCC 4-12'
  and player_id = 'P015';

update player_match_performances
set wides = 3, no_balls = 0
where source_match_id = 'DCC 4-12'
  and player_id = 'P025';

update player_match_performances
set wides = 1, no_balls = 0
where source_match_id = 'DCC 4-12'
  and player_id = 'P042';

update player_match_performances
set wides = 2, no_balls = 0
where source_match_id = 'DCC 4-12'
  and player_id = 'P044';

update player_match_performances
set wides = 1, no_balls = 0
where source_match_id = 'DCC 4-12'
  and player_id = 'P045';

update player_match_performances
set wides = 1, no_balls = 0
where source_match_id = 'DCC 4-12'
  and player_id = 'P052';

update player_match_performances
set wides = 4, no_balls = 0
where source_match_id = 'DCC 4-12'
  and player_id = 'P057';

update player_match_performances
set wides = 3, no_balls = 0
where source_match_id = 'DCC 4-12'
  and player_id = 'P064';


-- DCC 4-14
-- Vasudev Vinayak Guttal bowled no no-balls.

update player_match_performances
set no_balls = 0
where source_match_id = 'DCC 4-14'
  and player_id = 'P060';


-- ============================================================================
-- 4. FIELDING CORRECTIONS
-- ============================================================================

-- DCC 1-07 - Bilal Farooq
update player_match_performances
set catches = 2
where source_match_id = 'DCC 1-07'
  and player_id = 'P009';


-- DCC 1-10 - Rakesh Tatineni
update player_match_performances
set catches = 1
where source_match_id = 'DCC 1-10'
  and player_id = 'P039';


-- DCC 1-12 - Manav Sadana
update player_match_performances
set catches = 1
where source_match_id = 'DCC 1-12'
  and player_id = 'P023';


-- DCC 1-16 - Prasanth Yalamanchili
update player_match_performances
set catches = null
where source_match_id = 'DCC 1-16'
  and player_id = 'P037';


-- DCC 2-03 - Jagadeesh Bantrotu
-- Final verified fielding record: one catch AND one run-out.
update player_match_performances
set
  catches = 1,
  run_outs = 1
where source_match_id = 'DCC 2-03'
  and player_id = 'P018';


-- DCC 2-14 - Rakesh Tatineni
update player_match_performances
set catches = 2
where source_match_id = 'DCC 2-14'
  and player_id = 'P039';


-- DCC 2-14 - Santhan Reddy Gaddam
update player_match_performances
set catches = 1
where source_match_id = 'DCC 2-14'
  and player_id = 'P046';


-- DCC 3-10 - Talha Shah
update player_match_performances
set catches = 1
where source_match_id = 'DCC 3-10'
  and player_id = 'P055';


-- DCC 4-12 - Sanket Jagadale
-- Correct fielding record is one catch and no run-out.
update player_match_performances
set
  catches = 1,
  run_outs = null
where source_match_id = 'DCC 4-12'
  and player_id = 'P045';


-- ============================================================================
-- 5. VERIFIED NV PLAY DIFFERENCES - DOCUMENTATION ONLY
-- ============================================================================
--
-- The following differences were reviewed and deliberately NOT changed.
--
-- DCC 1-01 - Bilal Farooq
-- Canonical:
--   33 legal balls, 15 runs, 4 wickets, 2 wides, 1 no-ball.
-- NV Play:
--   32 legal balls, 15 runs, 3 wickets, 2 wides, 1 no-ball.
--
-- The scorer accidentally ended the innings instead of recording the final
-- wicket. Bilal took the final wicket. The canonical record is correct.
--
--
-- DCC 4-07 - Manoj Das / Achal Mihani
-- Canonical:
--   Manoj Das  - 24 balls, 45 runs, 0 wickets, 4 wides, 1 no-ball.
--   Achal Mihani - 18 balls, 24 runs, 1 wicket, 1 wide, 1 no-ball.
--
-- NV Play contains duplicated / incorrect bowling allocation and effectively
-- gives Achal seven overs in a 20-over match, which is impossible under the
-- competition bowling limit. The canonical figures were independently
-- confirmed and remain authoritative.
--
--
-- KNOWN 2026 PLAYER IDENTITY SUBSTITUTIONS
--
-- DCC 3-05:
--   Canonical Siddhesh Patil (P050)
--   NV Play Ritvik K (P041)
--   Siddhesh actually played under Ritvik's NV Play identity.
--
-- DCC 3-09:
--   Canonical Gunjan Deshmukh (P014)
--   NV Play Ritvik K (P041)
--   Gunjan actually played under Ritvik's NV Play identity.
--
-- DCC 4-07:
--   Canonical Himanshu Kashyap (P016)
--   NV Play Mahesh Nilewar (P022)
--   Himanshu actually played under Mahesh's NV Play identity.
--
-- These substitutions must remain explicit reconciliation exceptions.
-- Canonical player identities must not be silently replaced by NV Play.
--
--
-- FIELDING RULES CONFIRMED BY THE 2026 AUDIT
--
-- 1. Caught-and-bowled counts as:
--      - one bowling wicket, AND
--      - one fielding catch for the bowler
--    in DCC canonical statistics.
--
-- 2. Fielding credit must never be manufactured.
--    If a dismissal identifies the fielder only as "Unknown", no player
--    receives a catch, stumping or run-out credit.
--
-- 3. Duplicate representations of the same fielder within one dismissal must
--    be de-duplicated.
--    Example:
--      "c Sandip Gite/Sandip Gite b Babli Parab"
--    represents ONE catch, not two.
--
--
-- BALLYMENA 1st XI vs DUNMURRY 1st XI
-- External NV Play match UUID:
--   94e6d7fd-1476-4738-a94d-4e61451d836f
--
-- DCC legitimately has no batting innings.
-- Ballymena, as home team, could not provide the required printed DLS sheets
-- after their first innings because of a printer failure. The match was
-- subsequently awarded to DCC.
--
-- Therefore "missing DCC innings" is NOT a parser failure when an awarded /
-- forfeited / otherwise concluded match legitimately ends before DCC bats.
--
--
-- DCC-v-DCC MATCH CLASSIFICATION
--
-- A match involving two DCC teams is not automatically an "Internal Match".
-- The 2026 DCC 3 vs DCC 4 Minor Qualifying Cup fixture was an official cup
-- match and remains Official Season / stats eligible.
--
--
-- FINAL 2026 NV PLAY RECONCILIATION
--
-- Matched appearances:            843
-- Canonical-only appearances:       3
-- NV-only appearances:              3
--
-- Batting differences:
--   Runs:                           0
--   Balls faced:                    0
--   Fours:                          0
--   Sixes:                          0
--
-- Remaining bowling differences are fully explained by the verified
-- Bilal Farooq and Manoj Das / Achal Mihani exceptions above.
--
-- Remaining fielding differences were manually adjudicated and contain
-- no unresolved canonical errors.
--
-- The 2026 canonical dataset is therefore the audited DCC reference dataset.
-- ============================================================================

commit;
