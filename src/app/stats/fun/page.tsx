import Link from "next/link";
import { supabase } from "@/lib/supabase";
import FunStats, {
  type FunStat,
} from "../FunStats";

function formatMatchDate(date: string | null) {
  if (!date) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export default async function FunStatsPage() {
  const [
    performancesResponse,
    playersResponse,
    teamsResponse,
    matchEntriesResponse,
    matchesResponse,
  ] = await Promise.all([
    supabase
      .from("player_match_performances")
      .select(`
        source_match_id,
        player_id,
        team_id,
        batted,
        runs,
        balls_faced,
        fours,
        sixes,
        dismissal_type,
        is_not_out,
        bowled,
        bowling_balls,
        runs_conceded,
        wickets,
        wides,
        no_balls,
        catches,
        run_outs
      `),

    supabase
      .from("players")
      .select(`
        player_id,
        player_name,
        player_slug
      `),

    supabase
      .from("teams")
      .select(`
        team_id,
        team_name,
        display_order
      `)
      .order("display_order", {
        ascending: true,
      }),

    supabase
      .from("match_team_entries")
      .select(`
        source_match_id,
        match_id,
        team_id,
        opponent_display_name
      `),

    supabase
      .from("matches")
      .select(`
        match_id,
        match_date
      `),
  ]);

  if (performancesResponse.error) {
    throw new Error(
      performancesResponse.error.message,
    );
  }

  if (playersResponse.error) {
    throw new Error(
      playersResponse.error.message,
    );
  }

  if (teamsResponse.error) {
    throw new Error(
      teamsResponse.error.message,
    );
  }

  if (matchEntriesResponse.error) {
    throw new Error(
      matchEntriesResponse.error.message,
    );
  }

  if (matchesResponse.error) {
    throw new Error(
      matchesResponse.error.message,
    );
  }

  const performances =
    performancesResponse.data ?? [];

  const players =
    playersResponse.data ?? [];

  const teams =
    teamsResponse.data ?? [];

  const matchEntries =
    matchEntriesResponse.data ?? [];

  const matches =
    matchesResponse.data ?? [];

  const playerMap = new Map(
    players.map((player) => [
      player.player_id,
      player,
    ]),
  );

  const teamMap = new Map(
    teams.map((team) => [
      team.team_id,
      team.team_name,
    ]),
  );

  const matchDateMap = new Map(
    matches.map((match) => [
      match.match_id,
      match.match_date,
    ]),
  );

  const matchEntryMap = new Map(
    matchEntries.map((entry) => [
      `${entry.source_match_id}__${entry.team_id}`,
      entry,
    ]),
  );

  // --------------------------------------------------
  // PLAYER AGGREGATION
  // --------------------------------------------------

  const playerStats = new Map<
    string,
    {
      player_id: string;
      player_name: string;
      player_slug: string;

      battingInnings: number;
      runs: number;
      fours: number;
      sixes: number;
      ballsFaced: number;
      ducks: number;
      notOuts: number;
      scores40to49: number;

      wides: number;
      noBalls: number;

      runOutDismissals: number;

      catches: number;
      fieldingRunOuts: number;

      teamsRepresented: Set<string>;
    }
  >();

  for (const performance of performances) {
    const player = playerMap.get(
      performance.player_id,
    );

    if (!player) {
      continue;
    }

    if (!playerStats.has(player.player_id)) {
      playerStats.set(player.player_id, {
        player_id: player.player_id,
        player_name: player.player_name,
        player_slug: player.player_slug,

        battingInnings: 0,
        runs: 0,
        fours: 0,
        sixes: 0,
        ballsFaced: 0,
        ducks: 0,
        notOuts: 0,
        scores40to49: 0,

        wides: 0,
        noBalls: 0,

        runOutDismissals: 0,

        catches: 0,
        fieldingRunOuts: 0,

        teamsRepresented:
          new Set<string>(),
      });
    }

    const stats =
      playerStats.get(
        player.player_id,
      )!;

    stats.teamsRepresented.add(
      performance.team_id,
    );

    if (performance.batted) {
      const inningsRuns =
        performance.runs ?? 0;

      stats.battingInnings += 1;
      stats.runs += inningsRuns;
      stats.fours +=
        performance.fours ?? 0;
      stats.sixes +=
        performance.sixes ?? 0;
      stats.ballsFaced +=
        performance.balls_faced ?? 0;

      if (inningsRuns === 0) {
        stats.ducks += 1;
      }

      if (performance.is_not_out) {
        stats.notOuts += 1;
      }

      if (
        inningsRuns >= 40 &&
        inningsRuns <= 49
      ) {
        stats.scores40to49 += 1;
      }

      const dismissal =
        performance.dismissal_type
          ?.trim()
          .toLowerCase() ?? "";

      if (
        dismissal === "run out" ||
        dismissal === "run-out" ||
        dismissal === "runout"
      ) {
        stats.runOutDismissals += 1;
      }
    }

    if (performance.bowled) {
      stats.wides +=
        performance.wides ?? 0;

      stats.noBalls +=
        performance.no_balls ?? 0;
    }

    stats.catches +=
      performance.catches ?? 0;

    stats.fieldingRunOuts +=
      performance.run_outs ?? 0;
  }

  const aggregatedPlayers =
    Array.from(
      playerStats.values(),
    );

  function leaderBy(
    selector: (
      player: (typeof aggregatedPlayers)[number],
    ) => number,
  ) {
    return (
      [...aggregatedPlayers].sort(
        (a, b) =>
          selector(b) - selector(a),
      )[0] ?? null
    );
  }

  const mostFours = leaderBy(
    (player) => player.fours,
  );

  const mostSixes = leaderBy(
    (player) => player.sixes,
  );

  const mostBallsFaced = leaderBy(
    (player) => player.ballsFaced,
  );

  const mostDucks = leaderBy(
    (player) => player.ducks,
  );

  const mostWides = leaderBy(
    (player) => player.wides,
  );

  const mostNoBalls = leaderBy(
    (player) => player.noBalls,
  );

  const mostRunOutDismissals = leaderBy(
    (player) =>
      player.runOutDismissals,
  );

  const mostTeamsRepresented = leaderBy(
    (player) =>
      player.teamsRepresented.size,
  );

  const mostNotOuts = leaderBy(
    (player) => player.notOuts,
  );

  const mostCatches = leaderBy(
    (player) => player.catches,
  );

  const mostFieldingRunOuts = leaderBy(
    (player) =>
      player.fieldingRunOuts,
  );

  const mostScores40to49 = leaderBy(
    (player) =>
      player.scores40to49,
  );

  const boundaryPercentageLeader =
    [...aggregatedPlayers]
      .filter(
        (player) =>
          player.runs >= 100,
      )
      .map((player) => {
        const boundaryRuns =
          player.fours * 4 +
          player.sixes * 6;

        const boundaryPercentage =
          player.runs > 0
            ? (boundaryRuns /
                player.runs) *
              100
            : 0;

        return {
          ...player,
          boundaryRuns,
          boundaryPercentage,
        };
      })
      .sort(
        (a, b) =>
          b.boundaryPercentage -
          a.boundaryPercentage,
      )[0] ?? null;

  // --------------------------------------------------
  // SINGLE-INNINGS / SINGLE-SPELL RECORDS
  // --------------------------------------------------

  const widestSpell =
    [...performances]
      .filter(
        (performance) =>
          performance.bowled &&
          (performance.wides ?? 0) > 0,
      )
      .sort(
        (a, b) =>
          (b.wides ?? 0) -
          (a.wides ?? 0),
      )[0] ?? null;

  const mostNoBallsSpell =
    [...performances]
      .filter(
        (performance) =>
          performance.bowled &&
          (performance.no_balls ?? 0) >
            0,
      )
      .sort(
        (a, b) =>
          (b.no_balls ?? 0) -
          (a.no_balls ?? 0),
      )[0] ?? null;

  const quickCameo =
    [...performances]
      .filter(
        (performance) =>
          performance.batted &&
          (performance.balls_faced ?? 0) >=
            10,
      )
      .map((performance) => ({
        ...performance,
        inningsStrikeRate:
          (performance.balls_faced ?? 0) >
          0
            ? ((performance.runs ?? 0) /
                (performance.balls_faced ??
                  1)) *
              100
            : 0,
      }))
      .sort(
        (a, b) =>
          b.inningsStrikeRate -
          a.inningsStrikeRate,
      )[0] ?? null;

  const mostExpensiveSpell =
    [...performances]
      .filter(
        (performance) =>
          performance.bowled &&
          performance.runs_conceded !==
            null,
      )
      .sort((a, b) => {
        const runsDifference =
          (b.runs_conceded ?? 0) -
          (a.runs_conceded ?? 0);

        if (runsDifference !== 0) {
          return runsDifference;
        }

        return (
          (b.bowling_balls ?? 0) -
          (a.bowling_balls ?? 0)
        );
      })[0] ?? null;

  const bestShortSpell =
    [...performances]
      .filter(
        (performance) =>
          performance.bowled &&
          (performance.bowling_balls ??
            0) > 0 &&
          (performance.bowling_balls ??
            0) <= 24 &&
          (performance.wickets ?? 0) >
            0,
      )
      .sort((a, b) => {
        const wicketsDifference =
          (b.wickets ?? 0) -
          (a.wickets ?? 0);

        if (wicketsDifference !== 0) {
          return wicketsDifference;
        }

        return (
          (a.runs_conceded ?? 0) -
          (b.runs_conceded ?? 0)
        );
      })[0] ?? null;

  function getPerformanceContext(
    performance:
      | (typeof performances)[number]
      | null,
  ) {
    if (!performance) {
      return null;
    }

    const player = playerMap.get(
      performance.player_id,
    );

    if (!player) {
      return null;
    }

    const entry =
      matchEntryMap.get(
        `${performance.source_match_id}__${performance.team_id}`,
      );

    const matchDate =
      entry?.match_id
        ? matchDateMap.get(
            entry.match_id,
          ) ?? null
        : null;

    return {
      player,
      opponent:
        entry?.opponent_display_name ??
        "Opponent",
      teamName:
        teamMap.get(
          performance.team_id,
        ) ?? performance.team_id,
      matchDate,
    };
  }

  const widestSpellContext =
    getPerformanceContext(
      widestSpell,
    );

  const mostNoBallsSpellContext =
    getPerformanceContext(
      mostNoBallsSpell,
    );

  const quickCameoContext =
    getPerformanceContext(
      quickCameo,
    );

  const mostExpensiveSpellContext =
    getPerformanceContext(
      mostExpensiveSpell,
    );

  const bestShortSpellContext =
    getPerformanceContext(
      bestShortSpell,
    );

  // --------------------------------------------------
  // FUN STAT CARDS
  // --------------------------------------------------

  const funStats: FunStat[] = [];

  if (mostFours) {
    funStats.push({
      key: "most-fours",
      eyebrow: "Boundary Department",
      title: "Most Fours",
      playerName:
        mostFours.player_name,
      playerSlug:
        mostFours.player_slug,
      value:
        mostFours.fours.toString(),
      unit: "fours",
      detail:
        "The season's busiest route to the rope.",
      featured: true,
    });
  }

  if (mostSixes) {
    funStats.push({
      key: "most-sixes",
      eyebrow: "Air Traffic Control",
      title: "Most Sixes",
      playerName:
        mostSixes.player_name,
      playerSlug:
        mostSixes.player_slug,
      value:
        mostSixes.sixes.toString(),
      unit: "sixes",
      detail:
        "The most trips over the boundary without bouncing.",
      featured: true,
    });
  }

  if (mostBallsFaced) {
    funStats.push({
      key: "most-balls-faced",
      eyebrow: "Occupational Hazard",
      title: "Most Balls Faced",
      playerName:
        mostBallsFaced.player_name,
      playerSlug:
        mostBallsFaced.player_slug,
      value:
        mostBallsFaced.ballsFaced.toLocaleString(
          "en-GB",
        ),
      unit: "balls",
      detail:
        "Nobody spent longer negotiating with bowlers.",
      featured: true,
    });
  }

  if (mostDucks) {
    funStats.push({
      key: "most-ducks",
      eyebrow: "Quack Counter",
      title: "Most Ducks",
      playerName:
        mostDucks.player_name,
      playerSlug:
        mostDucks.player_slug,
      value:
        mostDucks.ducks.toString(),
      unit: "ducks",
      detail:
        "Cricket gives. Cricket also very much takes.",
      tone: "mischief",
    });
  }

  if (mostWides) {
    funStats.push({
      key: "most-wides",
      eyebrow: "Navigation Issues",
      title: "Most Wides",
      playerName:
        mostWides.player_name,
      playerSlug:
        mostWides.player_slug,
      value:
        mostWides.wides.toString(),
      unit: "wides",
      detail:
        "A season-long relationship with the tramlines.",
      tone: "mischief",
    });
  }

  if (mostNoBalls) {
    funStats.push({
      key: "most-no-balls",
      eyebrow: "Front-Foot Department",
      title: "Most No-Balls",
      playerName:
        mostNoBalls.player_name,
      playerSlug:
        mostNoBalls.player_slug,
      value:
        mostNoBalls.noBalls.toString(),
      unit: "no-balls",
      detail:
        "Every centimetre counts.",
      tone: "mischief",
    });
  }

  if (mostRunOutDismissals) {
    funStats.push({
      key: "most-run-outs",
      eyebrow: "Communication Breakdown",
      title: "Most Times Run Out",
      playerName:
        mostRunOutDismissals.player_name,
      playerSlug:
        mostRunOutDismissals.player_slug,
      value:
        mostRunOutDismissals.runOutDismissals.toString(),
      unit: "run outs",
      detail:
        "Sometimes yes means no. Sometimes two means absolutely not.",
      tone: "mischief",
    });
  }

  if (widestSpell && widestSpellContext) {
    funStats.push({
      key: "most-wides-match",
      eyebrow: "One-Match Special",
      title: "Most Wides in One Match",
      playerName:
        widestSpellContext.player
          .player_name,
      playerSlug:
        widestSpellContext.player
          .player_slug,
      value:
        (widestSpell.wides ?? 0).toString(),
      unit: "wides",
      detail: `vs ${widestSpellContext.opponent}`,
      secondaryDetail: `${widestSpellContext.teamName} · ${formatMatchDate(
        widestSpellContext.matchDate,
      )}`,
      tone: "mischief",
    });
  }

  if (
    mostNoBallsSpell &&
    mostNoBallsSpellContext
  ) {
    funStats.push({
      key: "most-no-balls-match",
      eyebrow: "One-Match Special",
      title: "Most No-Balls in One Match",
      playerName:
        mostNoBallsSpellContext.player
          .player_name,
      playerSlug:
        mostNoBallsSpellContext.player
          .player_slug,
      value:
        (
          mostNoBallsSpell.no_balls ??
          0
        ).toString(),
      unit: "no-balls",
      detail: `vs ${mostNoBallsSpellContext.opponent}`,
      secondaryDetail: `${mostNoBallsSpellContext.teamName} · ${formatMatchDate(
        mostNoBallsSpellContext.matchDate,
      )}`,
      tone: "mischief",
    });
  }

  if (mostTeamsRepresented) {
    const representedTeams =
      [...mostTeamsRepresented.teamsRepresented]
        .map(
          (teamId) =>
            teamMap.get(teamId) ??
            teamId,
        )
        .join(" · ");

    funStats.push({
      key: "most-teams",
      eyebrow: "Have Kit, Will Travel",
      title: "Most Teams Represented",
      playerName:
        mostTeamsRepresented.player_name,
      playerSlug:
        mostTeamsRepresented.player_slug,
      value:
        mostTeamsRepresented.teamsRepresented.size.toString(),
      unit: "teams",
      detail:
        representedTeams,
    });
  }

  if (boundaryPercentageLeader) {
    funStats.push({
      key: "boundary-percentage",
      eyebrow: "Boundary Addict",
      title: "Highest Boundary Percentage",
      playerName:
        boundaryPercentageLeader.player_name,
      playerSlug:
        boundaryPercentageLeader.player_slug,
      value:
        `${boundaryPercentageLeader.boundaryPercentage.toFixed(
          1,
        )}%`,
      unit: "of runs",
      detail:
        `${boundaryPercentageLeader.boundaryRuns} of ${boundaryPercentageLeader.runs} runs came in boundaries.`,
    });
  }

  if (mostNotOuts) {
    funStats.push({
      key: "most-not-outs",
      eyebrow: "Not-Out Merchant",
      title: "Most Not Outs",
      playerName:
        mostNotOuts.player_name,
      playerSlug:
        mostNotOuts.player_slug,
      value:
        mostNotOuts.notOuts.toString(),
      unit: "not outs",
      detail:
        "Still there when the innings ran out of road.",
    });
  }

  if (mostCatches) {
    funStats.push({
      key: "most-catches",
      eyebrow: "Safe Hands",
      title: "Most Catches",
      playerName:
        mostCatches.player_name,
      playerSlug:
        mostCatches.player_slug,
      value:
        mostCatches.catches.toString(),
      unit: "catches",
      detail:
        "Apparently gravity was negotiable.",
    });
  }

  if (mostFieldingRunOuts) {
    funStats.push({
      key: "most-fielding-run-outs",
      eyebrow: "Direct Hit Hero",
      title: "Most Fielding Run Outs",
      playerName:
        mostFieldingRunOuts.player_name,
      playerSlug:
        mostFieldingRunOuts.player_slug,
      value:
        mostFieldingRunOuts.fieldingRunOuts.toString(),
      unit: "run outs",
      detail:
        "Some batters found out the hard way.",
    });
  }

  if (mostScores40to49) {
    funStats.push({
      key: "most-40s",
      eyebrow: "Nearly There",
      title: "Most Scores from 40 to 49",
      playerName:
        mostScores40to49.player_name,
      playerSlug:
        mostScores40to49.player_slug,
      value:
        mostScores40to49.scores40to49.toString(),
      unit: "innings",
      detail:
        "The fifty was visible. Just not reachable.",
      tone: "mischief",
    });
  }

  if (quickCameo && quickCameoContext) {
    funStats.push({
      key: "quick-cameo",
      eyebrow: "Quick Cameo",
      title: "Highest Innings Strike Rate",
      playerName:
        quickCameoContext.player
          .player_name,
      playerSlug:
        quickCameoContext.player
          .player_slug,
      value:
        quickCameo.inningsStrikeRate.toFixed(
          2,
        ),
      unit: "strike rate",
      detail: `${quickCameo.runs ?? 0} from ${
        quickCameo.balls_faced ?? 0
      } balls vs ${quickCameoContext.opponent}`,
      secondaryDetail: `${quickCameoContext.teamName} · ${formatMatchDate(
        quickCameoContext.matchDate,
      )}`,
    });
  }

  if (
    mostExpensiveSpell &&
    mostExpensiveSpellContext
  ) {
    funStats.push({
      key: "most-expensive-spell",
      eyebrow: "Hazard Pay",
      title: "Most Expensive Spell",
      playerName:
        mostExpensiveSpellContext.player
          .player_name,
      playerSlug:
        mostExpensiveSpellContext.player
          .player_slug,
      value:
        (
          mostExpensiveSpell.runs_conceded ??
          0
        ).toString(),
      unit: "runs",
      detail: `${
        mostExpensiveSpell.wickets ?? 0
      } wicket${
        (mostExpensiveSpell.wickets ?? 0) ===
        1
          ? ""
          : "s"
      } · ${Math.floor(
        (mostExpensiveSpell.bowling_balls ??
          0) / 6,
      )}.${(mostExpensiveSpell.bowling_balls ??
        0) % 6} overs vs ${
        mostExpensiveSpellContext.opponent
      }`,
      secondaryDetail: `${mostExpensiveSpellContext.teamName} · ${formatMatchDate(
        mostExpensiveSpellContext.matchDate,
      )}`,
      tone: "mischief",
    });
  }

  if (
    bestShortSpell &&
    bestShortSpellContext
  ) {
    funStats.push({
      key: "best-short-spell",
      eyebrow: "Maximum Damage",
      title: "Best Short Spell",
      playerName:
        bestShortSpellContext.player
          .player_name,
      playerSlug:
        bestShortSpellContext.player
          .player_slug,
      value: `${bestShortSpell.wickets ?? 0}/${
        bestShortSpell.runs_conceded ?? 0
      }`,
      unit: "bowling",
      detail: `${Math.floor(
        (bestShortSpell.bowling_balls ??
          0) / 6,
      )}.${(bestShortSpell.bowling_balls ??
        0) % 6} overs vs ${
        bestShortSpellContext.opponent
      }`,
      secondaryDetail: `${bestShortSpellContext.teamName} · ${formatMatchDate(
        bestShortSpellContext.matchDate,
      )}`,
    });
  }

  return (
    <section className="px-4 py-8 sm:px-6 lg:py-10">
      <div className="site-container">
        <Link
          href="/stats"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to Season Stats
        </Link>

        {/* HERO */}
        <section className="relative mt-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#13223a] via-[#0b1728] to-[#07101d]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(212,175,55,0.13),transparent_35%)]" />

          <div className="relative px-6 py-10 sm:px-8 lg:px-10 lg:py-14">
            <div className="inline-flex rounded-full border border-[#d4af37]/20 bg-[#d4af37]/5 px-3 py-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#d4af37]">
                Just for Fun
              </span>
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-[#d4af37]">
              Beyond the Scorebook
            </p>

            <h1 className="mt-4 max-w-4xl text-4xl font-black uppercase tracking-tight text-white sm:text-5xl lg:text-6xl">
              The Numbers Nobody Asked For
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              A less serious look at the quirks,
              oddities and unexpected numbers from
              Dunmurry Cricket Club&apos;s 2026
              season.
            </p>

            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="max-w-2xl text-xs leading-relaxed text-slate-500">
                All statistics are calculated from
                the same recorded 2026 match data as
                the main Performance Centre. The
                commentary is considerably less
                scientific.
              </p>
            </div>
          </div>
        </section>

        {/* FUN STATS */}
        <section className="mt-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4af37]">
              Season Curiosities
            </p>

            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
              2026 Oddities
            </h2>

            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Some impressive. Some unfortunate.
              All statistically true.
            </p>
          </div>

          <div className="mt-6">
            <FunStats stats={funStats} />
          </div>
        </section>

        <div className="mt-12 border-t border-white/10 pt-6 text-center">
          <p className="text-xs text-slate-600">
            No reputations were harmed in the
            calculation of these statistics.
            Probably.
          </p>
        </div>
      </div>
    </section>
  );
}
