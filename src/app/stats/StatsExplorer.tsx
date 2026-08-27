"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Player = {
  player_id: string;
  player_name: string;
  player_slug: string;
};

type Team = {
  team_id: string;
  team_name: string;
  display_order: number | null;
};

type Performance = {
  source_match_id: string;
  player_id: string;
  team_id: string;

  batted: boolean | null;
  runs: number | null;
  balls_faced: number | null;
  is_not_out: boolean | null;

  bowled: boolean | null;
  bowling_balls: number | null;
  runs_conceded: number | null;
  wickets: number | null;

  catches: number | null;
  stumpings: number | null;
  run_outs: number | null;
};

type StatsExplorerProps = {
  players: Player[];
  teams: Team[];
  performances: Performance[];
};

type Tab = "batting" | "bowling" | "fielding";

type SortDirection = "asc" | "desc";

type BattingSortKey =
  | "runs"
  | "innings"
  | "average"
  | "strikeRate"
  | "fifties"
  | "hundreds"
  | "highestScore";

type BowlingSortKey =
  | "wickets"
  | "innings"
  | "overs"
  | "average"
  | "economy"
  | "strikeRate"
  | "best";

type FieldingSortKey =
  | "catches"
  | "stumpings"
  | "runOuts"
  | "total";

type SortKey =
  | BattingSortKey
  | BowlingSortKey
  | FieldingSortKey;

function formatNumber(
  value: number | null,
  decimals = 2,
) {
  if (value === null || value === undefined) {
    return "—";
  }

  return value.toFixed(decimals);
}

function ballsToOvers(balls: number) {
  const overs = Math.floor(balls / 6);
  const remainingBalls = balls % 6;

  return `${overs}.${remainingBalls}`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function StatsExplorer({
  players,
  teams,
  performances,
}: StatsExplorerProps) {
  const [activeTab, setActiveTab] =
    useState<Tab>("batting");

  const [selectedTeamId, setSelectedTeamId] =
    useState("all");

  const [sortKey, setSortKey] =
    useState<SortKey>("runs");

  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");

  const [showAll, setShowAll] = useState(false);

  const playerMap = useMemo(
    () =>
      new Map(
        players.map((player) => [
          player.player_id,
          player,
        ]),
      ),
    [players],
  );

  const aggregatedPlayers = useMemo(() => {
    const filteredPerformances =
      selectedTeamId === "all"
        ? performances
        : performances.filter(
            (performance) =>
              performance.team_id ===
              selectedTeamId,
          );

    const statsMap = new Map<
      string,
      {
        player_id: string;
        player_name: string;
        player_slug: string;

        appearances: Set<string>;

        battingInnings: number;
        runs: number;
        ballsFaced: number;
        notOuts: number;
        fifties: number;
        hundreds: number;
        highestScore: number;
        highestNotOut: boolean;

        bowlingInnings: number;
        bowlingBalls: number;
        runsConceded: number;
        wickets: number;
        bestWickets: number;
        bestRuns: number | null;

        catches: number;
        stumpings: number;
        runOuts: number;
      }
    >();

    for (const performance of filteredPerformances) {
      const player = playerMap.get(
        performance.player_id,
      );

      if (!player) continue;

      if (!statsMap.has(player.player_id)) {
        statsMap.set(player.player_id, {
          player_id: player.player_id,
          player_name: player.player_name,
          player_slug: player.player_slug,

          appearances: new Set<string>(),

          battingInnings: 0,
          runs: 0,
          ballsFaced: 0,
          notOuts: 0,
          fifties: 0,
          hundreds: 0,
          highestScore: 0,
          highestNotOut: false,

          bowlingInnings: 0,
          bowlingBalls: 0,
          runsConceded: 0,
          wickets: 0,
          bestWickets: 0,
          bestRuns: null,

          catches: 0,
          stumpings: 0,
          runOuts: 0,
        });
      }

      const stats = statsMap.get(
        player.player_id,
      )!;

      stats.appearances.add(
        performance.source_match_id,
      );

      if (performance.batted) {
        stats.battingInnings += 1;
        stats.runs += performance.runs ?? 0;
        stats.ballsFaced +=
          performance.balls_faced ?? 0;

        if (performance.is_not_out) {
          stats.notOuts += 1;
        }

        const inningsRuns =
          performance.runs ?? 0;

        if (
          inningsRuns >= 50 &&
          inningsRuns < 100
        ) {
          stats.fifties += 1;
        }

        if (inningsRuns >= 100) {
          stats.hundreds += 1;
        }

        if (
          inningsRuns > stats.highestScore ||
          (inningsRuns ===
            stats.highestScore &&
            performance.is_not_out &&
            !stats.highestNotOut)
        ) {
          stats.highestScore = inningsRuns;
          stats.highestNotOut =
            performance.is_not_out === true;
        }
      }

      if (performance.bowled) {
        stats.bowlingInnings += 1;
        stats.bowlingBalls +=
          performance.bowling_balls ?? 0;
        stats.runsConceded +=
          performance.runs_conceded ?? 0;
        stats.wickets +=
          performance.wickets ?? 0;

        const inningsWickets =
          performance.wickets ?? 0;

        const inningsRuns =
          performance.runs_conceded ?? 0;

        if (
          inningsWickets > stats.bestWickets ||
          (inningsWickets ===
            stats.bestWickets &&
            (stats.bestRuns === null ||
              inningsRuns < stats.bestRuns))
        ) {
          stats.bestWickets = inningsWickets;
          stats.bestRuns = inningsRuns;
        }
      }

      stats.catches +=
        performance.catches ?? 0;

      stats.stumpings +=
        performance.stumpings ?? 0;

      stats.runOuts +=
        performance.run_outs ?? 0;
    }

    return Array.from(statsMap.values()).map(
      (player) => {
        const dismissals =
          player.battingInnings -
          player.notOuts;

        const battingAverage =
          dismissals > 0
            ? player.runs / dismissals
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
              (player.bowlingBalls / 6)
            : null;

        const bowlingStrikeRate =
          player.wickets > 0
            ? player.bowlingBalls /
              player.wickets
            : null;

        return {
          ...player,
          battingAverage,
          battingStrikeRate,
          bowlingAverage,
          economy,
          bowlingStrikeRate,
          fieldingTotal:
            player.catches +
            player.stumpings +
            player.runOuts,
        };
      },
    );
  }, [
    performances,
    playerMap,
    selectedTeamId,
  ]);

  function changeTab(tab: Tab) {
    setActiveTab(tab);
    setShowAll(false);
    setSortDirection("desc");

    if (tab === "batting") {
      setSortKey("runs");
    }

    if (tab === "bowling") {
      setSortKey("wickets");
    }

    if (tab === "fielding") {
      setSortKey("total");
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) =>
        current === "desc" ? "asc" : "desc",
      );
    } else {
      setSortKey(key);

      if (
        key === "average" ||
        key === "economy" ||
        key === "strikeRate"
      ) {
        setSortDirection(
          activeTab === "bowling" &&
            (key === "average" ||
              key === "economy" ||
              key === "strikeRate")
            ? "asc"
            : "desc",
        );
      } else {
        setSortDirection("desc");
      }
    }

    setShowAll(false);
  }

  const battingRows = useMemo(() => {
    return [...aggregatedPlayers]
      .filter(
        (player) =>
          player.battingInnings > 0,
      )
      .sort((a, b) => {
        let valueA = 0;
        let valueB = 0;

        switch (sortKey) {
          case "innings":
            valueA = a.battingInnings;
            valueB = b.battingInnings;
            break;

          case "average":
            valueA =
              a.battingAverage ??
              Number.NEGATIVE_INFINITY;
            valueB =
              b.battingAverage ??
              Number.NEGATIVE_INFINITY;
            break;

          case "strikeRate":
            valueA =
              a.battingStrikeRate ??
              Number.NEGATIVE_INFINITY;
            valueB =
              b.battingStrikeRate ??
              Number.NEGATIVE_INFINITY;
            break;

          case "fifties":
            valueA = a.fifties;
            valueB = b.fifties;
            break;

          case "hundreds":
            valueA = a.hundreds;
            valueB = b.hundreds;
            break;

          case "highestScore":
            valueA = a.highestScore;
            valueB = b.highestScore;
            break;

          default:
            valueA = a.runs;
            valueB = b.runs;
        }

        const difference =
          sortDirection === "desc"
            ? valueB - valueA
            : valueA - valueB;

        if (difference !== 0) {
          return difference;
        }

        return b.runs - a.runs;
      });
  }, [
    aggregatedPlayers,
    sortDirection,
    sortKey,
  ]);

  const bowlingRows = useMemo(() => {
    return [...aggregatedPlayers]
      .filter(
        (player) =>
          player.bowlingInnings > 0,
      )
      .sort((a, b) => {
        let valueA = 0;
        let valueB = 0;

        switch (sortKey) {
          case "innings":
            valueA = a.bowlingInnings;
            valueB = b.bowlingInnings;
            break;

          case "overs":
            valueA = a.bowlingBalls;
            valueB = b.bowlingBalls;
            break;

          case "average":
            valueA =
              a.bowlingAverage ??
              Number.POSITIVE_INFINITY;
            valueB =
              b.bowlingAverage ??
              Number.POSITIVE_INFINITY;
            break;

          case "economy":
            valueA =
              a.economy ??
              Number.POSITIVE_INFINITY;
            valueB =
              b.economy ??
              Number.POSITIVE_INFINITY;
            break;

          case "strikeRate":
            valueA =
              a.bowlingStrikeRate ??
              Number.POSITIVE_INFINITY;
            valueB =
              b.bowlingStrikeRate ??
              Number.POSITIVE_INFINITY;
            break;

          case "best":
            if (
              b.bestWickets !==
              a.bestWickets
            ) {
              return (
                b.bestWickets -
                a.bestWickets
              );
            }

            return (
              (a.bestRuns ??
                Number.POSITIVE_INFINITY) -
              (b.bestRuns ??
                Number.POSITIVE_INFINITY)
            );

          default:
            valueA = a.wickets;
            valueB = b.wickets;
        }

        const difference =
          sortDirection === "desc"
            ? valueB - valueA
            : valueA - valueB;

        if (difference !== 0) {
          return difference;
        }

        return b.wickets - a.wickets;
      });
  }, [
    aggregatedPlayers,
    sortDirection,
    sortKey,
  ]);

  const fieldingRows = useMemo(() => {
    return [...aggregatedPlayers]
      .filter(
        (player) =>
          player.fieldingTotal > 0,
      )
      .sort((a, b) => {
        let valueA = 0;
        let valueB = 0;

        switch (sortKey) {
          case "catches":
            valueA = a.catches;
            valueB = b.catches;
            break;

          case "stumpings":
            valueA = a.stumpings;
            valueB = b.stumpings;
            break;

          case "runOuts":
            valueA = a.runOuts;
            valueB = b.runOuts;
            break;

          default:
            valueA = a.fieldingTotal;
            valueB = b.fieldingTotal;
        }

        const difference =
          sortDirection === "desc"
            ? valueB - valueA
            : valueA - valueB;

        if (difference !== 0) {
          return difference;
        }

        return (
          b.fieldingTotal -
          a.fieldingTotal
        );
      });
  }, [
    aggregatedPlayers,
    sortDirection,
    sortKey,
  ]);

  const activeRows =
    activeTab === "batting"
      ? battingRows
      : activeTab === "bowling"
        ? bowlingRows
        : fieldingRows;

  const displayedRows = showAll
    ? activeRows
    : activeRows.slice(0, 10);

  function getPlayerHref(
  playerSlug: string,
) {
  if (selectedTeamId === "all") {
    return `/players/${playerSlug}?fromStats=1`;
  }

  return `/players/${playerSlug}?team=${selectedTeamId}&fromStats=1`;
}

  function SortButton({
    label,
    sort,
  }: {
    label: string;
    sort: SortKey;
  }) {
    const active = sortKey === sort;

    return (
      <button
        type="button"
        onClick={() => handleSort(sort)}
        className={`inline-flex items-center gap-1 transition ${
          active
            ? "text-[#d4af37]"
            : "text-slate-500 hover:text-white"
        }`}
      >
        {label}

        {active && (
          <span aria-hidden="true">
            {sortDirection === "desc"
              ? "↓"
              : "↑"}
          </span>
        )}
      </button>
    );
  }

  return (
    <section
      id="player-stats"
      className="scroll-mt-24 mt-12"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4af37]">
          Player Statistics
        </p>

        <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
          Statistics Explorer
        </h2>

        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Compare batting, bowling and fielding
          performance across the 2026 season.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
        {/* CONTROLS */}
        <div className="flex flex-col gap-4 border-b border-white/10 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto">
            {(
              [
                ["batting", "Batting"],
                ["bowling", "Bowling"],
                ["fielding", "Fielding"],
              ] as [Tab, string][]
            ).map(([value, label]) => {
              const active =
                activeTab === value;

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    changeTab(value)
                  }
                  className={`shrink-0 rounded-lg border px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] transition ${
                    active
                      ? "border-[#d4af37] bg-[#d4af37] text-[#07101d]"
                      : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-[#d4af37]/30 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="team-filter"
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"
            >
              Team
            </label>

            <select
              id="team-filter"
              value={selectedTeamId}
              onChange={(event) => {
                setSelectedTeamId(
                  event.target.value,
                );
                setShowAll(false);
              }}
              className="min-w-[170px] rounded-lg border border-white/10 bg-[#0e1727] px-3 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-[#d4af37]/50"
            >
              <option value="all">
                All Teams
              </option>

              {teams
                .slice()
                .sort(
                  (a, b) =>
                    (a.display_order ?? 999) -
                    (b.display_order ?? 999),
                )
                .map((team) => (
                  <option
                    key={team.team_id}
                    value={team.team_id}
                  >
                    {team.team_name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* BATTING */}
        {activeTab === "batting" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-white/[0.02]">
                <tr className="text-[9px] font-semibold uppercase tracking-[0.13em]">
                  <th className="w-14 px-5 py-3 text-slate-500 sm:px-6">
                    #
                  </th>

                  <th className="px-3 py-3 text-slate-500">
                    Player
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Inns"
                      sort="innings"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Runs"
                      sort="runs"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Avg"
                      sort="average"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="SR"
                      sort="strikeRate"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="50s"
                      sort="fifties"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="100s"
                      sort="hundreds"
                    />
                  </th>

                  <th className="px-5 py-3 text-right sm:px-6">
                    <SortButton
                      label="HS"
                      sort="highestScore"
                    />
                  </th>
                </tr>
              </thead>

              <tbody>
                {displayedRows.map(
                  (player, index) => (
                    <tr
                      key={player.player_id}
                      className="border-t border-white/10 transition hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-4 sm:px-6">
                        <span
                          className={
                            index < 3
                              ? "font-black text-[#d4af37]"
                              : "font-bold text-slate-500"
                          }
                        >
                          {index + 1}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <Link
                          href={getPlayerHref(
                            player.player_slug,
                          )}
                          className="group flex items-center gap-3"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[10px] font-black text-[#d4af37]">
                            {getInitials(
                              player.player_name,
                            )}
                          </span>

                          <span className="font-semibold text-white transition group-hover:text-[#d4af37]">
                            {player.player_name}
                          </span>
                        </Link>
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {player.battingInnings}
                      </td>

                      <td className="px-3 py-4 text-right font-black text-white">
                        {player.runs}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {formatNumber(
                          player.battingAverage,
                        )}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {formatNumber(
                          player.battingStrikeRate,
                        )}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {player.fifties}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {player.hundreds}
                      </td>

                      <td className="px-5 py-4 text-right font-bold text-white sm:px-6">
                        {player.highestScore}
                        {player.highestNotOut
                          ? "*"
                          : ""}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* BOWLING */}
        {activeTab === "bowling" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-white/[0.02]">
                <tr className="text-[9px] font-semibold uppercase tracking-[0.13em]">
                  <th className="w-14 px-5 py-3 text-slate-500 sm:px-6">
                    #
                  </th>

                  <th className="px-3 py-3 text-slate-500">
                    Player
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Inns"
                      sort="innings"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Overs"
                      sort="overs"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Wkts"
                      sort="wickets"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Avg"
                      sort="average"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Econ"
                      sort="economy"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="SR"
                      sort="strikeRate"
                    />
                  </th>

                  <th className="px-5 py-3 text-right sm:px-6">
                    <SortButton
                      label="Best"
                      sort="best"
                    />
                  </th>
                </tr>
              </thead>

              <tbody>
                {displayedRows.map(
                  (player, index) => (
                    <tr
                      key={player.player_id}
                      className="border-t border-white/10 transition hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-4 sm:px-6">
                        <span
                          className={
                            index < 3
                              ? "font-black text-[#d4af37]"
                              : "font-bold text-slate-500"
                          }
                        >
                          {index + 1}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <Link
                          href={getPlayerHref(
                            player.player_slug,
                          )}
                          className="group flex items-center gap-3"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[10px] font-black text-[#d4af37]">
                            {getInitials(
                              player.player_name,
                            )}
                          </span>

                          <span className="font-semibold text-white transition group-hover:text-[#d4af37]">
                            {player.player_name}
                          </span>
                        </Link>
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {player.bowlingInnings}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {ballsToOvers(
                          player.bowlingBalls,
                        )}
                      </td>

                      <td className="px-3 py-4 text-right font-black text-white">
                        {player.wickets}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {formatNumber(
                          player.bowlingAverage,
                        )}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {formatNumber(
                          player.economy,
                        )}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {formatNumber(
                          player.bowlingStrikeRate,
                        )}
                      </td>

                      <td className="px-5 py-4 text-right font-bold text-white sm:px-6">
                        {player.bestRuns !== null
                          ? `${player.bestWickets}/${player.bestRuns}`
                          : "—"}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* FIELDING */}
        {activeTab === "fielding" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left">
              <thead className="bg-white/[0.02]">
                <tr className="text-[9px] font-semibold uppercase tracking-[0.13em]">
                  <th className="w-14 px-5 py-3 text-slate-500 sm:px-6">
                    #
                  </th>

                  <th className="px-3 py-3 text-slate-500">
                    Player
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Catches"
                      sort="catches"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Stumpings"
                      sort="stumpings"
                    />
                  </th>

                  <th className="px-3 py-3 text-right">
                    <SortButton
                      label="Run Outs"
                      sort="runOuts"
                    />
                  </th>

                  <th className="px-5 py-3 text-right sm:px-6">
                    <SortButton
                      label="Total"
                      sort="total"
                    />
                  </th>
                </tr>
              </thead>

              <tbody>
                {displayedRows.map(
                  (player, index) => (
                    <tr
                      key={player.player_id}
                      className="border-t border-white/10 transition hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-4 sm:px-6">
                        <span
                          className={
                            index < 3
                              ? "font-black text-[#d4af37]"
                              : "font-bold text-slate-500"
                          }
                        >
                          {index + 1}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <Link
                          href={getPlayerHref(
                            player.player_slug,
                          )}
                          className="group flex items-center gap-3"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[10px] font-black text-[#d4af37]">
                            {getInitials(
                              player.player_name,
                            )}
                          </span>

                          <span className="font-semibold text-white transition group-hover:text-[#d4af37]">
                            {player.player_name}
                          </span>
                        </Link>
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {player.catches}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {player.stumpings}
                      </td>

                      <td className="px-3 py-4 text-right text-slate-300">
                        {player.runOuts}
                      </td>

                      <td className="px-5 py-4 text-right font-black text-white sm:px-6">
                        {player.fieldingTotal}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* FOOTER */}
        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-slate-500">
            Showing{" "}
            <span className="font-bold text-white">
              {displayedRows.length}
            </span>{" "}
            of{" "}
            <span className="font-bold text-white">
              {activeRows.length}
            </span>{" "}
            players
          </p>

          {activeRows.length > 10 && (
            <button
              type="button"
              onClick={() =>
                setShowAll((current) => !current)
              }
              className="text-left text-xs font-bold text-[#d4af37] transition hover:text-[#e7c95b] sm:text-right"
            >
              {showAll
                ? "Show top 10 ↑"
                : `View all ${activeRows.length} players ↓`}
            </button>
          )}
        </div>
      </div>

      {activeTab === "batting" && (
        <p className="mt-3 text-xs text-slate-600">
          Batting averages and strike rates shown
          here are calculated from all displayed
          innings.
        </p>
      )}

      {activeTab === "bowling" && (
        <p className="mt-3 text-xs text-slate-600">
          Bowling averages, economy rates and
          strike rates are calculated from recorded
          bowling performances.
        </p>
      )}
    </section>
  );
}