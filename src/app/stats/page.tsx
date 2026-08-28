import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import StatsExplorer from "./StatsExplorer";

export const metadata: Metadata = {
  title: "Season Stats",
  description:
    "Explore Dunmurry Cricket Club's 2026 batting, bowling and fielding statistics.",
};

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

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{
    team?: string;
  }>;
}) {
  const { team } = await searchParams;
  const [
    matchEntriesResponse,
    matchesResponse,
    performancesResponse,
    playersResponse,
    teamsResponse,
  ] = await Promise.all([
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

    supabase
      .from("player_match_performances")
      .select(`
        source_match_id,
        player_id,
        team_id,
        batted,
        runs,
        balls_faced,
        is_not_out,
        bowled,
        bowling_balls,
        runs_conceded,
        wickets,
        catches,
        stumpings,
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
  ]);

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

  const matchEntries =
    matchEntriesResponse.data ?? [];

  const matches =
    matchesResponse.data ?? [];

  const performances =
    performancesResponse.data ?? [];

  const players =
    playersResponse.data ?? [];

  const teams =
    teamsResponse.data ?? [];
  
    const initialTeamId =
  team &&
  teams.some(
    (availableTeam) =>
      availableTeam.team_id === team,
  )
    ? team
    : "all";

  const playerMap = new Map(
    players.map((player) => [
      player.player_id,
      player,
    ]),
  );

  const teamMap = new Map(
    teams.map((team) => [
      team.team_id,
      team,
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
  // SEASON-WIDE BATTING MILESTONES
  // --------------------------------------------------

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
      ballsFaced: number;
      notOuts: number;
      highestScore: number;
      highestNotOut: boolean;

      bowlingInnings: number;
      bowlingBalls: number;
      runsConceded: number;
      wickets: number;

      catches: number;
    }
  >();

  for (const performance of performances) {
    const player = playerMap.get(
      performance.player_id,
    );

    if (!player) continue;

    if (
      !playerStats.has(
        player.player_id,
      )
    ) {
      playerStats.set(
        player.player_id,
        {
          player_id:
            player.player_id,

          player_name:
            player.player_name,

          player_slug:
            player.player_slug,

          battingInnings: 0,
          runs: 0,
          ballsFaced: 0,
          notOuts: 0,
          highestScore: 0,
          highestNotOut: false,

          bowlingInnings: 0,
          bowlingBalls: 0,
          runsConceded: 0,
          wickets: 0,

          catches: 0,
        },
      );
    }

    const stats =
      playerStats.get(
        player.player_id,
      )!;

    if (performance.batted) {
      stats.battingInnings += 1;

      stats.runs +=
        performance.runs ?? 0;

      stats.ballsFaced +=
        performance.balls_faced ??
        0;

      if (
        performance.is_not_out
      ) {
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
          performance.is_not_out ===
          true;
      }
    }

    if (performance.bowled) {
      stats.bowlingInnings += 1;

      stats.bowlingBalls +=
        performance.bowling_balls ??
        0;

      stats.runsConceded +=
        performance.runs_conceded ??
        0;

      stats.wickets +=
        performance.wickets ?? 0;
    }

    stats.catches +=
      performance.catches ?? 0;
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
          ? player.runs /
            dismissals
          : null;

      const battingStrikeRate =
        player.ballsFaced > 0
          ? (player.runs /
              player.ballsFaced) *
            100
          : null;

      const bowlingAverage =
        player.wickets > 0
          ? player.runsConceded /
            player.wickets
          : null;

      const economy =
        player.bowlingBalls > 0
          ? player.runsConceded /
            (player.bowlingBalls /
              6)
          : null;

      return {
        ...player,
        battingAverage,
        battingStrikeRate,
        bowlingAverage,
        economy,
      };
    });

  // --------------------------------------------------
  // QUALIFICATION RULES
  // --------------------------------------------------

  const MIN_BATTING_INNINGS = 10;
  const MIN_BOWLING_INNINGS = 10;

  // --------------------------------------------------
  // SEASON LEADERS
  // --------------------------------------------------

  const mostRuns =
    [...aggregatedPlayers]
      .filter(
        (player) =>
          player.battingInnings >=
            MIN_BATTING_INNINGS,
      )
      .sort((a, b) => {
        if (
          b.runs !== a.runs
        ) {
          return b.runs - a.runs;
        }

        return (
          (b.battingAverage ?? -1) -
          (a.battingAverage ?? -1)
        );
      })[0] ?? null;

  const mostWickets =
    [...aggregatedPlayers]
      .filter(
        (player) =>
          player.bowlingInnings >=
            MIN_BOWLING_INNINGS,
      )
      .sort((a, b) => {
        if (
          b.wickets !==
          a.wickets
        ) {
          return (
            b.wickets -
            a.wickets
          );
        }

        return (
          (a.bowlingAverage ??
            Number.POSITIVE_INFINITY) -
          (b.bowlingAverage ??
            Number.POSITIVE_INFINITY)
        );
      })[0] ?? null;

  const bestBattingAverage =
    [...aggregatedPlayers]
      .filter(
        (player) =>
          player.battingInnings >=
            MIN_BATTING_INNINGS &&
          player.battingAverage !==
            null,
      )
      .sort(
        (a, b) =>
          (b.battingAverage ?? 0) -
          (a.battingAverage ?? 0),
      )[0] ?? null;

  const bestEconomy =
    [...aggregatedPlayers]
      .filter(
        (player) =>
          player.bowlingInnings >=
            MIN_BOWLING_INNINGS &&
          player.economy !== null,
      )
      .sort(
        (a, b) =>
          (a.economy ??
            Number.POSITIVE_INFINITY) -
          (b.economy ??
            Number.POSITIVE_INFINITY),
      )[0] ?? null;

  const mostCatches =
    [...aggregatedPlayers].sort(
      (a, b) =>
        b.catches - a.catches,
    )[0] ?? null;

  const bestBattingStrikeRate =
    [...aggregatedPlayers]
      .filter(
        (player) =>
          player.battingInnings >=
            MIN_BATTING_INNINGS &&
          player.battingStrikeRate !==
            null,
      )
      .sort(
        (a, b) =>
          (b.battingStrikeRate ?? 0) -
          (a.battingStrikeRate ?? 0),
      )[0] ?? null;

  const seasonLeaders = [
  mostRuns && {
    label: "Most Runs",
    player: mostRuns,
    value:
      mostRuns.runs.toLocaleString(
        "en-GB",
      ),
    unit: "runs",
    detail: `${
      mostRuns.battingInnings
    } innings · Avg ${
      mostRuns.battingAverage !==
      null
        ? mostRuns.battingAverage.toFixed(
            2,
          )
        : "—"
    }`,
  },

  bestBattingAverage && {
    label: "Best Batting Average",
    player:
      bestBattingAverage,
    value:
      bestBattingAverage.battingAverage?.toFixed(
        2,
      ) ?? "—",
    unit: "average",
    detail: `${bestBattingAverage.runs} runs · ${bestBattingAverage.battingInnings} innings`,
  },

  bestBattingStrikeRate && {
    label: "Best Batting Strike Rate",
    player:
      bestBattingStrikeRate,
    value:
      bestBattingStrikeRate.battingStrikeRate?.toFixed(
        2,
      ) ?? "—",
    unit: "strike rate",
    detail: `${bestBattingStrikeRate.runs} runs · ${bestBattingStrikeRate.battingInnings} innings`,
  },

  mostWickets && {
    label: "Most Wickets",
    player: mostWickets,
    value:
      mostWickets.wickets.toString(),
    unit: "wickets",
    detail: `${
      mostWickets.bowlingInnings
    } innings · Avg ${
      mostWickets.bowlingAverage !==
      null
        ? mostWickets.bowlingAverage.toFixed(
            2,
          )
        : "—"
    }`,
  },

  bestEconomy && {
    label: "Best Economy",
    player: bestEconomy,
    value:
      bestEconomy.economy?.toFixed(
        2,
      ) ?? "—",
    unit: "runs / over",
    detail: `${bestEconomy.wickets} wickets · ${bestEconomy.bowlingInnings} innings`,
  },

  mostCatches && {
    label: "Most Catches",
    player: mostCatches,
    value:
      mostCatches.catches.toString(),
    unit: "catches",
    detail:
      "Across all 2026 appearances",
  },
].filter(
  (
    leader,
  ): leader is NonNullable<
    typeof leader
  > => leader !== null,
);

  // --------------------------------------------------
  // MILESTONES & SEASON BESTS
  // --------------------------------------------------

  const centuryPerformances =
    performances
      .filter(
        (performance) =>
          performance.batted &&
          (performance.runs ?? 0) >=
            100,
      )
      .map((performance) => {
        const player =
          playerMap.get(
            performance.player_id,
          );

        const entry =
          matchEntryMap.get(
            `${performance.source_match_id}__${performance.team_id}`,
          );

        if (!player) {
          return null;
        }

        return {
          ...performance,
          player,
          opponent:
            entry?.opponent_display_name ??
            "Opponent",

          matchDate:
            entry?.match_id
              ? matchDateMap.get(
                  entry.match_id,
                ) ?? null
              : null,

          teamName:
            teamMap.get(
              performance.team_id,
            )?.team_name ??
            performance.team_id,
        };
      })
      .filter(
        (
          performance,
        ): performance is NonNullable<
          typeof performance
        > => performance !== null,
      )
      .sort(
        (a, b) =>
          (b.runs ?? 0) -
          (a.runs ?? 0),
      );

  const fiveWicketHauls =
    performances
      .filter(
        (performance) =>
          performance.bowled &&
          (performance.wickets ?? 0) >=
            5,
      )
      .map((performance) => {
        const player =
          playerMap.get(
            performance.player_id,
          );

        const entry =
          matchEntryMap.get(
            `${performance.source_match_id}__${performance.team_id}`,
          );

        if (!player) {
          return null;
        }

        return {
          ...performance,
          player,
          opponent:
            entry?.opponent_display_name ??
            "Opponent",

          matchDate:
            entry?.match_id
              ? matchDateMap.get(
                  entry.match_id,
                ) ?? null
              : null,

          teamName:
            teamMap.get(
              performance.team_id,
            )?.team_name ??
            performance.team_id,
        };
      })
      .filter(
        (
          performance,
        ): performance is NonNullable<
          typeof performance
        > => performance !== null,
      )
      .sort((a, b) => {
        if (
          (b.wickets ?? 0) !==
          (a.wickets ?? 0)
        ) {
          return (
            (b.wickets ?? 0) -
            (a.wickets ?? 0)
          );
        }

        return (
          (a.runs_conceded ?? 0) -
          (b.runs_conceded ?? 0)
        );
      });

  const highestScorePerformance =
    performances
      .filter(
        (performance) =>
          performance.batted,
      )
      .map((performance) => {
        const player =
          playerMap.get(
            performance.player_id,
          );

        const entry =
          matchEntryMap.get(
            `${performance.source_match_id}__${performance.team_id}`,
          );

        if (!player) {
          return null;
        }

        return {
          ...performance,
          player,

          opponent:
            entry?.opponent_display_name ??
            "Opponent",

          matchDate:
            entry?.match_id
              ? matchDateMap.get(
                  entry.match_id,
                ) ?? null
              : null,

          teamName:
            teamMap.get(
              performance.team_id,
            )?.team_name ??
            performance.team_id,
        };
      })
      .filter(
        (
          performance,
        ): performance is NonNullable<
          typeof performance
        > => performance !== null,
      )
      .sort((a, b) => {
        const runDifference =
          (b.runs ?? 0) -
          (a.runs ?? 0);

        if (runDifference !== 0) {
          return runDifference;
        }

        if (
          b.is_not_out &&
          !a.is_not_out
        ) {
          return 1;
        }

        if (
          a.is_not_out &&
          !b.is_not_out
        ) {
          return -1;
        }

        return 0;
      })[0] ?? null;

  const bestBowlingPerformance =
    performances
      .filter(
        (performance) =>
          performance.bowled,
      )
      .map((performance) => {
        const player =
          playerMap.get(
            performance.player_id,
          );

        const entry =
          matchEntryMap.get(
            `${performance.source_match_id}__${performance.team_id}`,
          );

        if (!player) {
          return null;
        }

        return {
          ...performance,
          player,

          opponent:
            entry?.opponent_display_name ??
            "Opponent",

          matchDate:
            entry?.match_id
              ? matchDateMap.get(
                  entry.match_id,
                ) ?? null
              : null,

          teamName:
            teamMap.get(
              performance.team_id,
            )?.team_name ??
            performance.team_id,
        };
      })
      .filter(
        (
          performance,
        ): performance is NonNullable<
          typeof performance
        > => performance !== null,
      )
      .sort((a, b) => {
        const wicketDifference =
          (b.wickets ?? 0) -
          (a.wickets ?? 0);

        if (
          wicketDifference !== 0
        ) {
          return wicketDifference;
        }

        return (
          (a.runs_conceded ?? 0) -
          (b.runs_conceded ?? 0)
        );
      })[0] ?? null;

  const fiftyScorers =
    new Set(
      battingInnings
        .filter(
          (performance) =>
            (performance.runs ?? 0) >=
              50 &&
            (performance.runs ?? 0) <
              100,
        )
        .map(
          (performance) =>
            performance.player_id,
        ),
    ).size;

  return (
    <section className="px-4 py-8 sm:px-6 lg:py-10">
      <div className="site-container">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#13223a] via-[#0b1728] to-[#07101d]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(212,175,55,0.11),transparent_34%)]" />

          <div className="relative px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d4af37]">
              2026 Season
            </p>

            <h1 className="mt-3 text-4xl font-black uppercase tracking-tight text-white sm:text-5xl lg:text-6xl">
              Statistics
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Explore batting, bowling and
              fielding performance across
              Dunmurry Cricket Club&apos;s
              2026 season.
            </p>
          </div>
        </section>

        {/* SEASON LEADERS */}
        <section
          id="leaders"
          className="scroll-mt-24 mt-10"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4af37]">
              Performance Leaders
            </p>

            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
              Season Leaders
            </h2>

            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              The standout individual
              performers across Dunmurry
              Cricket Club&apos;s 2026 season.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {seasonLeaders.map(
              (leader) => (
                <Link
                  key={leader.label}
                  href={`/players/${leader.player.player_slug}?fromStats=1`}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/35 hover:bg-[#0d1626]"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent opacity-0 transition group-hover:opacity-100" />

                  <div className="p-5 sm:p-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">
                      {leader.label}
                    </p>

                    <div className="mt-6 flex items-end justify-between gap-5">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black text-white transition group-hover:text-[#d4af37]">
                          {
                            leader.player
                              .player_name
                          }
                        </p>

                        <p className="mt-2 text-xs text-slate-500">
                          {leader.detail}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                          {leader.value}
                        </p>

                        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {leader.unit}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        2026 Season
                      </p>

                      <span className="text-xs font-semibold text-slate-600 transition group-hover:text-[#d4af37]">
                        View player →
                      </span>
                    </div>
                  </div>
                </Link>
              ),
            )}
          </div>

          <p className="mt-4 text-xs text-slate-600">
            All batting leader metrics require a
            minimum of 10 batting innings. All
            bowling leader metrics require a
            minimum of 10 bowling innings.
          </p>
        </section>

        {/* PLAYER STATISTICS EXPLORER */}
        <StatsExplorer
  players={players}
  teams={teams}
  performances={performances}
  initialTeamId={initialTeamId}
/>

        {/* MILESTONES */}
        <section
          id="milestones"
          className="scroll-mt-24 mt-12"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4af37]">
              Standout Performances
            </p>

            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
              Milestones &amp; Season Bests
            </h2>

            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Individual performances that
              defined Dunmurry Cricket
              Club&apos;s 2026 season.
            </p>
          </div>

          {/* FEATURE CARDS */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {highestScorePerformance && (
              <Link
                href={`/players/${highestScorePerformance.player.player_slug}?fromStats=1`}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#13223a] via-[#0b1728] to-[#07101d] p-6 transition hover:border-[#d4af37]/35 sm:p-7"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(212,175,55,0.12),transparent_38%)]" />

                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    Highest Individual Score
                  </p>

                  <div className="mt-8 flex items-end justify-between gap-5">
                    <div>
                      <p className="text-2xl font-black text-white transition group-hover:text-[#d4af37]">
                        {
                          highestScorePerformance
                            .player
                            .player_name
                        }
                      </p>

                      <p className="mt-2 text-sm text-slate-400">
                        vs{" "}
                        {
                          highestScorePerformance
                            .opponent
                        }
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {
                          highestScorePerformance
                            .teamName
                        }{" "}
                        ·{" "}
                        {formatMatchDate(
                          highestScorePerformance
                            .matchDate,
                        )}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-5xl font-black tracking-tight text-white sm:text-6xl">
                        {highestScorePerformance.runs ??
                          0}
                        {highestScorePerformance.is_not_out
                          ? "*"
                          : ""}
                      </p>

                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        runs
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {bestBowlingPerformance && (
              <Link
                href={`/players/${bestBowlingPerformance.player.player_slug}?fromStats=1`}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#13223a] via-[#0b1728] to-[#07101d] p-6 transition hover:border-[#d4af37]/35 sm:p-7"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(212,175,55,0.12),transparent_38%)]" />

                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    Best Bowling Figures
                  </p>

                  <div className="mt-8 flex items-end justify-between gap-5">
                    <div>
                      <p className="text-2xl font-black text-white transition group-hover:text-[#d4af37]">
                        {
                          bestBowlingPerformance
                            .player
                            .player_name
                        }
                      </p>

                      <p className="mt-2 text-sm text-slate-400">
                        vs{" "}
                        {
                          bestBowlingPerformance
                            .opponent
                        }
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {
                          bestBowlingPerformance
                            .teamName
                        }{" "}
                        ·{" "}
                        {formatMatchDate(
                          bestBowlingPerformance
                            .matchDate,
                        )}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-5xl font-black tracking-tight text-white sm:text-6xl">
                        {bestBowlingPerformance.wickets ??
                          0}
                        /
                        {bestBowlingPerformance.runs_conceded ??
                          0}
                      </p>

                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        bowling
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            )}
          </div>

          {/* MILESTONE CARDS */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {/* CENTURIES */}
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
              <div className="border-b border-white/10 p-5 sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">
                  Centuries
                </p>

                <p className="mt-3 text-4xl font-black text-white">
                  {centuryPerformances.length}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Scores of 100 or more.
                </p>
              </div>

              <div>
                {centuryPerformances.map(
                  (performance) => (
                    <Link
                      key={`${performance.source_match_id}-${performance.player_id}`}
                      href={`/players/${performance.player.player_slug}?fromStats=1`}
                      className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 transition last:border-b-0 hover:bg-white/[0.02] sm:px-6"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white">
                          {
                            performance.player
                              .player_name
                          }
                        </p>

                        <p className="mt-1 truncate text-xs text-slate-500">
                          vs{" "}
                          {
                            performance.opponent
                          }
                        </p>
                      </div>

                      <p className="shrink-0 text-xl font-black text-[#d4af37]">
                        {performance.runs ?? 0}
                        {performance.is_not_out
                          ? "*"
                          : ""}
                      </p>
                    </Link>
                  ),
                )}
              </div>
            </section>

            {/* FIVE-FORS */}
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
              <div className="border-b border-white/10 p-5 sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">
                  Five-Wicket Hauls
                </p>

                <p className="mt-3 text-4xl font-black text-white">
                  {fiveWicketHauls.length}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Five or more wickets in an
                  innings.
                </p>
              </div>

              <div>
                {fiveWicketHauls.map(
                  (performance) => (
                    <Link
                      key={`${performance.source_match_id}-${performance.player_id}`}
                      href={`/players/${performance.player.player_slug}?fromStats=1`}
                      className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 transition last:border-b-0 hover:bg-white/[0.02] sm:px-6"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white">
                          {
                            performance.player
                              .player_name
                          }
                        </p>

                        <p className="mt-1 truncate text-xs text-slate-500">
                          vs{" "}
                          {
                            performance.opponent
                          }
                        </p>
                      </div>

                      <p className="shrink-0 text-xl font-black text-[#d4af37]">
                        {performance.wickets ??
                          0}
                        /
                        {performance.runs_conceded ??
                          0}
                      </p>
                    </Link>
                  ),
                )}
              </div>
            </section>

            {/* FIFTIES */}
            <section className="rounded-2xl border border-white/10 bg-[#0b1220] p-5 sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">
                Fifties
              </p>

              <p className="mt-3 text-4xl font-black text-white">
                {totalFifties}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Scores between 50 and 99.
              </p>

              <div className="mt-8 border-t border-white/10 pt-5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Different Players
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {fiftyScorers}
                </p>

                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Players who registered at
                  least one half-century during
                  the season.
                </p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </section>
  );
}