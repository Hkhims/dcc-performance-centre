import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AnimatedSnapshotCard from "@/components/AnimatedSnapshotCard";



function formatMatchDate(date: string | null) {
  if (!date) return "Date unavailable";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatScore(
  score: number | null,
  wickets: number | null,
) {
  if (score === null || score === undefined) {
    return "—";
  }

  if (wickets === null || wickets === undefined) {
    return `${score}`;
  }

  return `${score}/${wickets}`;
}

function getResultClasses(result: string | null) {
  const normalized =
    result?.trim().toLowerCase();

  if (
    normalized === "won" ||
    normalized === "win"
  ) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }

  if (
    normalized === "lost" ||
    normalized === "loss"
  ) {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  if (
    normalized === "tied" ||
    normalized === "tie"
  ) {
    return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  }

  return "border-white/10 bg-white/5 text-slate-300";
}

export default async function Home() {
  const [
    matchesResponse,
    matchEntriesResponse,
    performancesResponse,
    playersResponse,
    teamsResponse,
    competitionsResponse,
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(`
        match_id,
        season,
        match_date,
        fixture_label,
        status,
        is_internal_dcc_match
      `)
      .eq("season", 2026)
      .order("match_date", {
        ascending: false,
      }),

    supabase
      .from("match_team_entries")
      .select(`
        source_match_id,
        match_id,
        team_id,
        competition_id,
        opponent_display_name,
        result,
        dcc_score,
        dcc_wickets,
        opponent_score,
        opponent_wickets
      `),

    supabase
  .from("player_match_performances")
  .select(`
    player_id,
    batted,
    runs,
    is_not_out,
    bowled,
    runs_conceded,
    wickets,
    catches,
    wickets_caught,
    wickets_caught_and_bowled
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
      .from("competitions")
      .select(`
        competition_id,
        competition_name
      `)
      .eq("season", 2026),
  ]);

  if (matchesResponse.error) {
    throw new Error(
      matchesResponse.error.message,
    );
  }

  if (matchEntriesResponse.error) {
    throw new Error(
      matchEntriesResponse.error.message,
    );
  }

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

  if (competitionsResponse.error) {
    throw new Error(
      competitionsResponse.error.message,
    );
  }

  const matches =
    matchesResponse.data ?? [];

  const matchEntries =
    matchEntriesResponse.data ?? [];

  const performances =
    performancesResponse.data ?? [];

  const players =
    playersResponse.data ?? [];

  const teams =
    teamsResponse.data ?? [];

  const competitions =
    competitionsResponse.data ?? [];

  const playerMap = new Map(
    players.map((player) => [
      player.player_id,
      player,
    ]),
  );

  const teamNameMap = new Map(
    teams.map((team) => [
      team.team_id,
      team.team_name,
    ]),
  );

  const teamOrderMap = new Map(
    teams.map((team) => [
      team.team_id,
      team.display_order ?? 999,
    ]),
  );

  const competitionNameMap = new Map(
    competitions.map((competition) => [
      competition.competition_id,
      competition.competition_name,
    ]),
  );

  // --------------------------------------------------
  // 2026 SEASON SNAPSHOT
  // --------------------------------------------------

  const totalMatches = new Set(
    matchEntries
      .map((entry) => entry.match_id)
      .filter(Boolean),
  ).size;

  const totalPlayers = new Set(
    performances
      .map(
        (performance) =>
          performance.player_id,
      )
      .filter(Boolean),
  ).size;

  const totalRuns =
    performances.reduce(
      (total, performance) =>
        total +
        (performance.runs ?? 0),
      0,
    );

  const totalWickets =
    performances.reduce(
      (total, performance) =>
        total +
        (performance.wickets ?? 0),
      0,
    );

  const totalCatches =
  performances.reduce(
    (total, performance) =>
      total +
      (performance.wickets_caught ?? 0) +
      (performance.wickets_caught_and_bowled ?? 0),
    0,
  );
  const battingInnings =
    performances.filter(
      (performance) =>
        performance.batted,
    );

  const totalFifties =
    battingInnings.filter(
      (performance) =>
        (performance.runs ?? 0) >= 50 &&
        (performance.runs ?? 0) < 100,
    ).length;

  const totalHundreds =
    battingInnings.filter(
      (performance) =>
        (performance.runs ?? 0) >= 100,
    ).length;

    const totalFiveWicketHauls =
  performances.filter(
    (performance) =>
      (performance.wickets ?? 0) >= 5,
  ).length;

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
      notOuts: number;

      bowlingInnings: number;
      runsConceded: number;
      wickets: number;

      highestScore: number;
      highestNotOut: boolean;
    }
  >();

  for (const performance of performances) {
    const player = playerMap.get(
      performance.player_id,
    );

    if (!player) continue;

    if (!playerStats.has(player.player_id)) {
      playerStats.set(player.player_id, {
        player_id: player.player_id,
        player_name: player.player_name,
        player_slug: player.player_slug,

        battingInnings: 0,
        runs: 0,
        notOuts: 0,

        bowlingInnings: 0,
        runsConceded: 0,
        wickets: 0,

        highestScore: 0,
        highestNotOut: false,
      });
    }

    const stats =
      playerStats.get(
        player.player_id,
      )!;

    if (performance.batted) {
      stats.battingInnings += 1;

      stats.runs +=
        performance.runs ?? 0;

      if (performance.is_not_out) {
        stats.notOuts += 1;
      }

      const inningsRuns =
        performance.runs ?? 0;

      if (
        inningsRuns >
          stats.highestScore ||
        (inningsRuns ===
          stats.highestScore &&
          performance.is_not_out &&
          !stats.highestNotOut)
      ) {
        stats.highestScore =
          inningsRuns;

        stats.highestNotOut =
          performance.is_not_out === true;
      }
    }

    if (performance.bowled) {
      stats.bowlingInnings += 1;

      stats.runsConceded +=
        performance.runs_conceded ?? 0;

      stats.wickets +=
        performance.wickets ?? 0;
    }
  }

  const aggregatedPlayers =
    Array.from(
      playerStats.values(),
    ).map((player) => {
      const dismissals =
        player.battingInnings -
        player.notOuts;

      const battingAverage =
        dismissals > 0
          ? player.runs / dismissals
          : null;

      const bowlingAverage =
        player.wickets > 0
          ? player.runsConceded /
            player.wickets
          : null;

      return {
        ...player,
        battingAverage,
        bowlingAverage,
      };
    });

  // --------------------------------------------------
  // SEASON STANDOUTS
  // --------------------------------------------------

  const leadingRunScorer =
    [...aggregatedPlayers]
      .filter(
        (player) =>
          player.battingInnings > 0,
      )
      .sort((a, b) => {
        if (b.runs !== a.runs) {
          return b.runs - a.runs;
        }

        return (
          (b.battingAverage ?? -1) -
          (a.battingAverage ?? -1)
        );
      })[0] ?? null;

  const leadingWicketTaker =
    [...aggregatedPlayers]
      .filter(
        (player) =>
          player.bowlingInnings > 0,
      )
      .sort((a, b) => {
        if (b.wickets !== a.wickets) {
          return b.wickets - a.wickets;
        }

        return (
          (a.bowlingAverage ??
            Number.POSITIVE_INFINITY) -
          (b.bowlingAverage ??
            Number.POSITIVE_INFINITY)
        );
      })[0] ?? null;

  const highestIndividualScore =
    [...aggregatedPlayers]
      .filter(
        (player) =>
          player.battingInnings > 0,
      )
      .sort((a, b) => {
        if (
          b.highestScore !==
          a.highestScore
        ) {
          return (
            b.highestScore -
            a.highestScore
          );
        }

        if (
          b.highestNotOut &&
          !a.highestNotOut
        ) {
          return 1;
        }

        if (
          a.highestNotOut &&
          !b.highestNotOut
        ) {
          return -1;
        }

        return 0;
      })[0] ?? null;

  const standoutCards = [
    leadingRunScorer && {
      label: "Leading Run Scorer",
      player: leadingRunScorer,
      value:
        leadingRunScorer.runs.toLocaleString(
          "en-GB",
        ),
      unit: "runs",
      detail: `${
        leadingRunScorer.battingInnings
      } innings · Avg ${
        leadingRunScorer.battingAverage !==
        null
          ? leadingRunScorer.battingAverage.toFixed(
              2,
            )
          : "—"
      }`,
    },

    leadingWicketTaker && {
      label: "Leading Wicket Taker",
      player: leadingWicketTaker,
      value:
        leadingWicketTaker.wickets.toString(),
      unit: "wickets",
      detail: `${
        leadingWicketTaker.bowlingInnings
      } innings · Avg ${
        leadingWicketTaker.bowlingAverage !==
        null
          ? leadingWicketTaker.bowlingAverage.toFixed(
              2,
            )
          : "—"
      }`,
    },

    highestIndividualScore && {
      label: "Highest Individual Score",
      player:
        highestIndividualScore,
      value: `${
        highestIndividualScore.highestScore
      }${
        highestIndividualScore.highestNotOut
          ? "*"
          : ""
      }`,
      unit: "runs",
      detail: `${highestIndividualScore.runs.toLocaleString(
        "en-GB",
      )} season runs`,
    },
  ].filter(
    (
      card,
    ): card is NonNullable<typeof card> =>
      card !== null,
  );

  // --------------------------------------------------
  // CURATED 2026 TEAM ACHIEVEMENTS
  // --------------------------------------------------

  const achievements = [
    {
      teamId: "T02",
      teamName: "DCC 2",
      status: "League Champions",
      description:
        "Champions of Junior League 6 and promoted to Junior League 5.",
      meta: "Champions · Promoted",
    },
    {
      teamId: "T03",
      teamName: "DCC 3",
      status: "Promoted",
      description:
        "Secured promotion from Junior League 7 after an outstanding league campaign.",
      meta: "Promotion secured",
    },
    {
      teamId: "T06",
      teamName: "Midweek 2",
      status: "Champions",
      description:
        "Finished top of Group B before winning the playoffs to become Midweek League champions (Back to Back).",
      meta: "Group B winners · Playoff champions",
    },
  ];

  // --------------------------------------------------
  // LATEST RESULTS
  // --------------------------------------------------

  const entriesByMatch = new Map<
    string,
    typeof matchEntries
  >();

  for (const entry of matchEntries) {
    const currentEntries =
      entriesByMatch.get(entry.match_id) ?? [];

    currentEntries.push(entry);

    entriesByMatch.set(
      entry.match_id,
      currentEntries,
    );
  }

  const enrichedMatches = matches.map(
    (match) => {
      const entries = [
        ...(entriesByMatch.get(
          match.match_id,
        ) ?? []),
      ].sort(
        (a, b) =>
          (teamOrderMap.get(
            a.team_id,
          ) ?? 999) -
          (teamOrderMap.get(
            b.team_id,
          ) ?? 999),
      );

      const primaryEntry =
        entries[0] ?? null;

      return {
        ...match,
        entries,
        primaryEntry,

        competitionName:
          primaryEntry?.competition_id
            ? competitionNameMap.get(
                primaryEntry.competition_id,
              ) ?? "Competition"
            : "Competition",
      };
    },
  );

  const latestResults =
    enrichedMatches
      .filter(
        (match) =>
          match.status
            ?.trim()
            .toLowerCase() !==
          "scheduled",
      )
      .slice(0, 3);

  // --------------------------------------------------
  // EXPLORE
  // --------------------------------------------------

  const exploreItems = [
    {
      href: "/teams",
      eyebrow: "Six Teams",
      title: "Teams",
      description:
        "Follow each Dunmurry side through its 2026 campaign, standings, squad and results.",
    },
    {
      href: "/players",
      eyebrow: "Player Profiles",
      title: "Players",
      description:
        "Explore individual season records, team appearances and match-by-match performances.",
    },
    {
      href: "/matches",
      eyebrow: "Scorecards",
      title: "Matches",
      description:
        "Browse results, scorecards and match stories from every team and competition.",
    },
    {
      href: "/stats",
      eyebrow: "Performance Data",
      title: "Statistics",
      description:
        "Dive into season leaders, milestones and detailed batting, bowling and fielding analysis.",
    },
  ];

  return (
    <div className="bg-[#050914] text-white">
      {/* HERO */}
      {/* HERO */}
<section className="relative flex min-h-[78vh] items-center overflow-hidden border-b border-white/10 px-4 sm:px-6">
  <div
    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
    style={{
      backgroundImage:
        "url('/images/dcc-hero.jpg')",
    }}
  />

  <div className="absolute inset-0 bg-[#050914]/05" />

  <div className="absolute inset-0 bg-gradient-to-r from-[#050914] via-[#050914]/45 to-[#050914]/20" />

  <div className="absolute inset-0 bg-gradient-to-t from-[#050914] via-transparent to-[#050914]/20" />

  <div className="site-container relative z-10">
    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#d4af37] sm:text-sm">
      Dunmurry Cricket Club
    </p>

    <h1 className="mt-5 max-w-5xl text-5xl font-black uppercase tracking-tight text-white sm:text-7xl">
      Performance Centre
    </h1>

    <p className="mt-5 text-lg font-semibold uppercase tracking-[0.25em] text-blue-400 sm:text-xl">
      2026 Season
    </p>

    <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
      Results, statistics and performances
      from across Dunmurry Cricket Club.
    </p>

    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        href="/stats"
        className="inline-flex items-center justify-center rounded-xl bg-[#d4af37] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#07101d] transition hover:bg-[#e4c452]"
      >
        Explore Statistics →
      </Link>

      <Link
        href="/matches"
        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-white backdrop-blur-sm transition hover:border-[#d4af37]/30 hover:bg-white/[0.08]"
      >
        Browse Matches →
      </Link>
    </div>
  </div>
</section>
      {/* SEASON AT A GLANCE */}
      <section className="border-b border-white/10 px-4 py-14 sm:px-6 sm:py-16">
        <div className="site-container">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4af37] sm:text-sm">
            2026 Season
          </p>

          <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
            At a Glance
          </h2>

          <p className="mt-3 max-w-2xl text-sm text-slate-400">
            A snapshot of Dunmurry Cricket
            Club&apos;s 2026 season across all
            six teams and competitions.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
  <AnimatedSnapshotCard
    label="Matches"
    value={totalMatches}
    description="Fixtures represented across the season."
  />

  <AnimatedSnapshotCard
    label="Players"
    value={totalPlayers}
    description="Players who represented Dunmurry."
  />

  <AnimatedSnapshotCard
    label="Runs"
    value={totalRuns}
    description="Runs scored across all teams."
  />

  <AnimatedSnapshotCard
    label="Wickets"
    value={totalWickets}
    description="Wickets taken by Dunmurry bowlers."
  />

  <AnimatedSnapshotCard
    label="Catches"
    value={totalCatches}
    description="Caught dismissals across the season."
  />

  <AnimatedSnapshotCard
    label="Fifties"
    value={totalFifties}
    description="Individual scores from 50 to 99."
  />

  <AnimatedSnapshotCard
    label="Centuries"
    value={totalHundreds}
    description="Individual scores of 100 or more."
  />

  <AnimatedSnapshotCard
    label="5-Wicket Hauls"
    value={totalFiveWicketHauls}
    description="Bowling performances of five wickets or more."
    />
</div>
        </div>
      </section>

      {/* SEASON ACHIEVEMENTS */}
      <section className="border-b border-white/10 px-4 py-14 sm:px-6 sm:py-16">
        <div className="site-container">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4af37] sm:text-sm">
            Club Success
          </p>

          <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
            Season Achievements
          </h2>

          <p className="mt-3 max-w-2xl text-sm text-slate-400">
            Celebrating the team achievements
            that defined Dunmurry Cricket
            Club&apos;s 2026 season.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {achievements.map(
              (achievement) => (
                <Link
                  key={achievement.teamId}
                  href={`/teams/${achievement.teamId}`}
                  className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#13223a] via-[#0b1728] to-[#07101d] p-6 transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/35 sm:p-7"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_18%,rgba(212,175,55,0.12),transparent_38%)]" />

                  <div className="relative flex min-h-[250px] flex-col">
                    <div className="min-h-[185px]">
                      <p className="text-lg font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                        {achievement.teamName}
                      </p>

                      <h3 className="mt-4 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
                        {achievement.status}
                      </h3>

                      <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
                        {achievement.description}
                      </p>
                    </div>

                    <div className="mt-auto pt-8">
                      <div className="border-t border-white/10 pt-4">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                          {achievement.meta}
                        </p>

                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500 transition group-hover:text-[#d4af37]">
                            View team
                          </span>

                          <span className="text-sm text-slate-600 transition group-hover:translate-x-1 group-hover:text-[#d4af37]">
                            →
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ),
            )}
          </div>
        </div>
      </section>

      {/* SEASON STANDOUTS */}
      <section className="border-b border-white/10 px-4 py-14 sm:px-6 sm:py-16">
        <div className="site-container">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4af37] sm:text-sm">
            Individual Excellence
          </p>

          <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
            Season Standouts
          </h2>

          <p className="mt-3 max-w-2xl text-sm text-slate-400">
            Three headline performances from
            across Dunmurry Cricket Club&apos;s
            2026 season.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {standoutCards.map((card) => (
              <Link
                key={card.label}
                href={`/players/${card.player.player_slug}`}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b1220] transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/35 hover:bg-[#0d1626]"
              >
                <div className="flex min-h-[245px] flex-col p-6 sm:p-7">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">
                    {card.label}
                  </p>

                  <div className="mt-8 flex items-end justify-between gap-5">
                    <div className="min-w-0">
                      <p className="text-xl font-black text-white transition group-hover:text-[#d4af37]">
                        {
                          card.player
                            .player_name
                        }
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        {card.detail}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                        {card.value}
                      </p>

                      <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {card.unit}
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto pt-8">
                    <div className="flex items-center justify-between border-t border-white/10 pt-4">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        2026 Season
                      </p>

                      <span className="text-xs font-semibold text-slate-600 transition group-hover:text-[#d4af37]">
                        View player →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Link
            href="/stats"
            className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#d4af37] transition hover:text-[#e7c95b]"
          >
            Explore all season statistics →
          </Link>
        </div>
      </section>

      {/* LATEST RESULTS */}
      <section className="border-b border-white/10 px-4 py-14 sm:px-6 sm:py-16">
        <div className="site-container">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4af37] sm:text-sm">
                Recent Cricket
              </p>

              <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                Latest Results
              </h2>

              <p className="mt-3 max-w-2xl text-sm text-slate-400">
                The most recent completed
                fixtures from across Dunmurry
                Cricket Club.
              </p>
            </div>

            <Link
              href="/matches"
              className="text-xs font-bold text-[#d4af37] transition hover:text-[#e7c95b]"
            >
              View all matches →
            </Link>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {latestResults.map((match) => {
              const primaryEntry =
                match.primaryEntry;

              const isInternal =
                match.is_internal_dcc_match;

              return (
                <Link
                  key={match.match_id}
                  href={`/matches/${match.match_id}`}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/30 hover:bg-[#0d1626]"
                >
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d4af37]">
                          {formatMatchDate(
                            match.match_date,
                          )}
                        </p>

                        <p className="mt-2 text-xs text-slate-500">
                          {
                            match.competitionName
                          }
                        </p>
                      </div>

                      {!isInternal &&
                        primaryEntry?.result && (
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${getResultClasses(
                              primaryEntry.result,
                            )}`}
                          >
                            {
                              primaryEntry.result
                            }
                          </span>
                        )}
                    </div>

                    <h3 className="mt-5 min-h-[56px] text-lg font-black leading-7 text-white transition group-hover:text-[#d4af37]">
                      {match.fixture_label}
                    </h3>

                    {isInternal ? (
                      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                        {match.entries.map(
                          (entry) => (
                            <div
                              key={`${match.match_id}-${entry.team_id}`}
                              className="flex items-center justify-between gap-4"
                            >
                              <div>
                                <p className="text-sm font-bold text-white">
                                  {teamNameMap.get(
                                    entry.team_id,
                                  ) ??
                                    entry.team_id}
                                </p>

                                <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-slate-600">
                                  {entry.result}
                                </p>
                              </div>

                              <p className="font-black text-white">
                                {formatScore(
                                  entry.dcc_score,
                                  entry.dcc_wickets,
                                )}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      primaryEntry && (
                        <div className="mt-5 border-t border-white/10 pt-4">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold text-slate-300">
                              {teamNameMap.get(
                                primaryEntry.team_id,
                              ) ??
                                primaryEntry.team_id}
                            </p>

                            <p className="font-black text-white">
                              {formatScore(
                                primaryEntry.dcc_score,
                                primaryEntry.dcc_wickets,
                              )}
                            </p>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold text-slate-400">
                              {
                                primaryEntry.opponent_display_name
                              }
                            </p>

                            <p className="font-black text-slate-300">
                              {formatScore(
                                primaryEntry.opponent_score,
                                primaryEntry.opponent_wickets,
                              )}
                            </p>
                          </div>
                        </div>
                      )
                    )}

                    <div className="mt-5 border-t border-white/10 pt-4 text-right">
                      <span className="text-xs font-semibold text-slate-600 transition group-hover:text-[#d4af37]">
                        View scorecard →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
     </div>
      
  );
}