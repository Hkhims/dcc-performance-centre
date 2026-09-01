"use client";

import { useMemo, useState } from "react";

type TeamOption = {
  team_id: string;
  team_name: string;
};

type AdminPlayer = {
  player_id: string;
  player_name: string;
  total_matches: number;
  team_matches: Record<string, number>;
};

type SortOption =
  | "alphabetical"
  | "most-matches"
  | "fewest-matches";

export default function ClubAdminDashboard({
  players,
  teams,
}: {
  players: AdminPlayer[];
  teams: TeamOption[];
}) {
  const [search, setSearch] = useState("");
  const [selectedTeam, setSelectedTeam] =
    useState("all");
  const [minimumMatches, setMinimumMatches] =
    useState("0");
  const [sortOption, setSortOption] =
    useState<SortOption>("alphabetical");

  const filteredPlayers = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    const minimum =
      Number(minimumMatches) || 0;

    const filtered = [...players].filter(
      (player) => {
        const matchesSearch =
          !query ||
          player.player_name
            .toLowerCase()
            .includes(query);

        const matchesTeam =
          selectedTeam === "all" ||
          (player.team_matches[
            selectedTeam
          ] ?? 0) > 0;

        const matchesMinimum =
          player.total_matches >= minimum;

        return (
          matchesSearch &&
          matchesTeam &&
          matchesMinimum
        );
      },
    );

    if (sortOption === "most-matches") {
      return filtered.sort((a, b) => {
        if (
          b.total_matches !==
          a.total_matches
        ) {
          return (
            b.total_matches -
            a.total_matches
          );
        }

        return a.player_name.localeCompare(
          b.player_name,
          "en-GB",
          {
            sensitivity: "base",
          },
        );
      });
    }

    if (sortOption === "fewest-matches") {
      return filtered.sort((a, b) => {
        if (
          a.total_matches !==
          b.total_matches
        ) {
          return (
            a.total_matches -
            b.total_matches
          );
        }

        return a.player_name.localeCompare(
          b.player_name,
          "en-GB",
          {
            sensitivity: "base",
          },
        );
      });
    }

    return filtered.sort((a, b) =>
      a.player_name.localeCompare(
        b.player_name,
        "en-GB",
        {
          sensitivity: "base",
        },
      ),
    );
  }, [
    players,
    search,
    selectedTeam,
    minimumMatches,
    sortOption,
  ]);

  function exportCsv() {
    const headers = [
      "Player",
      "Total Matches",
      ...teams.map(
        (team) => team.team_name,
      ),
    ];

    const rows = filteredPlayers.map(
      (player) => [
        player.player_name,
        player.total_matches,
        ...teams.map(
          (team) =>
            player.team_matches[
              team.team_id
            ] ?? 0,
        ),
      ],
    );

    const csvRows = [
      headers,
      ...rows,
    ].map((row) =>
      row
        .map((value) => {
          const text =
            String(value);

          return `"${text.replace(
            /"/g,
            '""',
          )}"`;
        })
        .join(","),
    );

    const csvContent =
      csvRows.join("\n");

    const blob = new Blob(
      [csvContent],
      {
        type: "text/csv;charset=utf-8;",
      },
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download =
      "dcc-2026-player-appearances.csv";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* FILTERS */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#0b1220] p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto] xl:items-end">
          {/* SEARCH */}
          <div>
            <label
              htmlFor="admin-player-search"
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500"
            >
              Search player
            </label>

            <input
              id="admin-player-search"
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search by name..."
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#07101d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-[#d4af37]/60"
            />
          </div>

          {/* TEAM FILTER */}
          <div>
            <label
              htmlFor="admin-team-filter"
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500"
            >
              Team
            </label>

            <select
              id="admin-team-filter"
              value={selectedTeam}
              onChange={(event) =>
                setSelectedTeam(
                  event.target.value,
                )
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#07101d] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]/60"
            >
              <option value="all">
                All teams
              </option>

              {teams.map((team) => (
                <option
                  key={team.team_id}
                  value={team.team_id}
                >
                  {team.team_name}
                </option>
              ))}
            </select>
          </div>

          {/* MINIMUM APPEARANCES */}
          <div>
            <label
              htmlFor="admin-minimum-matches"
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500"
            >
              Minimum appearances
            </label>

            <input
              id="admin-minimum-matches"
              type="number"
              min="0"
              step="1"
              value={minimumMatches}
              onChange={(event) =>
                setMinimumMatches(
                  event.target.value,
                )
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#07101d] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]/60"
            />
          </div>

          {/* SORT */}
          <div>
            <label
              htmlFor="admin-sort"
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500"
            >
              Sort players
            </label>

            <select
              id="admin-sort"
              value={sortOption}
              onChange={(event) =>
                setSortOption(
                  event.target
                    .value as SortOption,
                )
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#07101d] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]/60"
            >
              <option value="alphabetical">
                A–Z
              </option>

              <option value="most-matches">
                Most matches first
              </option>

              <option value="fewest-matches">
                Fewest matches first
              </option>
            </select>
          </div>

          {/* EXPORT */}
          <button
            type="button"
            onClick={exportCsv}
            disabled={
              filteredPlayers.length === 0
            }
            className="rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#d4af37] transition hover:bg-[#d4af37]/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="text-sm text-slate-400">
            Showing{" "}
            <span className="font-black text-white">
              {filteredPlayers.length}
            </span>{" "}
            of{" "}
            <span className="font-black text-white">
              {players.length}
            </span>{" "}
            players
          </p>

          <p className="text-xs text-slate-600">
            League and cup appearances included
          </p>
        </div>
      </section>

      {/* TABLE */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="sticky left-0 z-10 min-w-[220px] bg-[#0c1422] px-5 py-4 text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Player
                </th>

                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-[0.16em] text-[#d4af37]">
                  Total
                </th>

                {teams.map((team) => (
                  <th
                    key={team.team_id}
                    className="min-w-[120px] px-5 py-4 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-500"
                  >
                    {team.team_name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredPlayers.map(
                (player) => (
                  <tr
                    key={player.player_id}
                    className="border-b border-white/10 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <td className="sticky left-0 z-10 bg-[#0b1220] px-5 py-4 font-bold text-white">
                      {
                        player.player_name
                      }
                    </td>

                    <td className="px-5 py-4 text-center text-lg font-black text-[#d4af37]">
                      {
                        player.total_matches
                      }
                    </td>

                    {teams.map(
                      (team) => {
                        const count =
                          player
                            .team_matches[
                            team
                              .team_id
                          ] ?? 0;

                        return (
                          <td
                            key={
                              team.team_id
                            }
                            className="px-5 py-4 text-center font-semibold text-slate-300"
                          >
                            {count}
                          </td>
                        );
                      },
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        {/* EMPTY STATE */}
        {filteredPlayers.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="font-bold text-white">
              No players found
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Try changing the search or
              filter options.
            </p>
          </div>
        )}
      </section>
    </>
  );
}