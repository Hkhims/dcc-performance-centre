import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Teams",
  description:
    "Explore Dunmurry Cricket Club's six teams and their 2026 season performance.",
};

const teamLogoMap: Record<string, string> = {
  T01: "/team-logos/dcc-1.png",
  T02: "/team-logos/dcc-2.png",
  T03: "/team-logos/dcc-3.png",
  T04: "/team-logos/dcc-4.png",
  T05: "/team-logos/midweek-1.png",
  T06: "/team-logos/midweek-2.png",
};

function ordinal(position: number | null) {
  if (position === null || position === undefined) {
    return "—";
  }

  const mod100 = position % 100;

  if (mod100 >= 11 && mod100 <= 13) {
    return `${position}th`;
  }

  switch (position % 10) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}

function formatNrr(value: number | null) {
  if (value === null || value === undefined) {
    return null;
  }

  return value > 0
    ? `+${value.toFixed(2)}`
    : value.toFixed(2);
}

function getStatusClasses(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("champion")) {
    return "border-[#d4af37]/35 bg-[#d4af37]/10 text-[#d4af37]";
  }

  if (normalized.includes("promoted")) {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  }

  if (normalized.includes("qualified")) {
    return "border-blue-400/25 bg-blue-400/10 text-blue-300";
  }

  if (normalized.includes("relegated")) {
    return "border-red-400/25 bg-red-400/10 text-red-300";
  }

  return "border-white/10 bg-white/5 text-slate-300";
}

export default async function TeamsPage() {
  const [
    teamsResponse,
    competitionsResponse,
    standingsResponse,
    matchEntriesResponse,
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("team_id, team_name, display_order")
      .order("display_order", { ascending: true }),

    supabase
      .from("competitions")
      .select(`
        competition_id,
        competition_name,
        competition_type
      `)
      .eq("season", 2026),

    supabase
      .from("league_standings")
      .select(`
        competition_id,
        team_name,
        played,
        won,
        tied,
        lost,
        no_result,
        points,
        net_run_rate,
        position,
        status,
        is_dunmurry
      `)
      .eq("is_dunmurry", true),

    supabase
      .from("match_team_entries")
      .select(`
        team_id,
        competition_id
      `),
  ]);

  if (teamsResponse.error) {
    throw new Error(teamsResponse.error.message);
  }

  if (competitionsResponse.error) {
    throw new Error(competitionsResponse.error.message);
  }

  if (standingsResponse.error) {
    throw new Error(standingsResponse.error.message);
  }

  if (matchEntriesResponse.error) {
    throw new Error(matchEntriesResponse.error.message);
  }

  const teams = teamsResponse.data ?? [];
  const competitions = competitionsResponse.data ?? [];
  const standings = standingsResponse.data ?? [];
  const matchEntries = matchEntriesResponse.data ?? [];

  const competitionMap = new Map(
    competitions.map((competition) => [
      competition.competition_id,
      competition,
    ]),
  );

  const standingCompetitionIds = new Set(
    standings.map(
      (standing) => standing.competition_id,
    ),
  );

  const cards = teams.map((team) => {
    const competitionIds = [
      ...new Set(
        matchEntries
          .filter(
            (entry) =>
              entry.team_id === team.team_id &&
              standingCompetitionIds.has(
                entry.competition_id,
              ),
          )
          .map(
            (entry) => entry.competition_id,
          ),
      ),
    ];

    const primaryCompetitionId =
      competitionIds[0] ?? null;

    const competition =
      primaryCompetitionId !== null
        ? competitionMap.get(
            primaryCompetitionId,
          ) ?? null
        : null;

    const standing =
      primaryCompetitionId !== null
        ? standings.find(
            (row) =>
              row.competition_id ===
              primaryCompetitionId,
          ) ?? null
        : null;

    return {
      team,
      competition,
      standing,
    };
  });

  return (
    <section className="px-4 py-8 sm:px-6 lg:py-10">
      <div className="site-container">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
            2026 Season
          </p>

          <h1 className="mt-2 text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">
            Teams
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Explore Dunmurry Cricket Club&apos;s six teams
            and their 2026 season performance.
          </p>
        </div>

        {/* Team Cards */}
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {cards.map(
            ({
              team,
              competition,
              standing,
            }) => {
              const statuses =
                team.team_id === "T06"
                  ? ["Champion"]
                  : standing?.status
                      ?.split(",")
                      .map(
                        (value: string) =>
                          value.trim(),
                      )
                      .filter(Boolean) ?? [];

              const nrr = standing
                ? formatNrr(
                    standing.net_run_rate,
                  )
                : null;

              const logoSrc =
                teamLogoMap[team.team_id];

              return (
                <Link
                  key={team.team_id}
                  href={`/teams/${team.team_id}`}
                  className="group block overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/30 hover:shadow-[0_14px_40px_rgba(0,0,0,0.18)]"
                >
                  {/* Card Header */}
                  <div className="bg-gradient-to-br from-[#101d32] via-[#0d192b] to-[#0a1423] px-6 py-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-4">
                        {logoSrc && (
                          <Image
                            src={logoSrc}
                            alt={`${team.team_name} logo`}
                            width={56}
                            height={56}
                            className="h-14 w-14 shrink-0 object-contain"
                          />
                        )}

                        <div>
                          <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-black uppercase tracking-tight text-white transition group-hover:text-[#d4af37] sm:text-3xl">
                              {team.team_name}
                            </h2>

                            <span className="translate-x-0 text-lg text-slate-600 transition group-hover:translate-x-1 group-hover:text-[#d4af37]">
                              →
                            </span>
                          </div>

                          {competition && (
                            <p className="mt-2 text-sm text-slate-400">
                              {
                                competition.competition_name
                              }
                            </p>
                          )}
                        </div>
                      </div>

                      {statuses.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {statuses.map(
                            (status: string) => (
                              <span
                                key={status}
                                className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${getStatusClasses(
                                  status,
                                )}`}
                              >
                                {status}
                              </span>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {standing ? (
                    <>
                      {/* Position */}
                      <div className="border-t border-white/10 px-6 py-5">
                        <div className="flex items-end justify-between gap-4">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              League Standing
                            </p>

                            <p className="mt-2 text-3xl font-black text-white">
                              {ordinal(
                                standing.position,
                              )}
                            </p>
                          </div>

                          <p className="text-right text-sm text-slate-400">
                            <span className="font-bold text-white">
                              {standing.points}
                            </span>{" "}
                            pts
                          </p>
                        </div>
                      </div>

                      {/* Record */}
                      <div className="grid grid-cols-3 border-t border-white/10 sm:grid-cols-6">
                        {[
                          [
                            "P",
                            standing.played,
                          ],
                          ["W", standing.won],
                          ["L", standing.lost],
                          ["T", standing.tied],
                          [
                            "NR",
                            standing.no_result,
                          ],
                          [
                            "NRR",
                            nrr ?? "—",
                          ],
                        ].map(
                          ([label, value]) => (
                            <div
                              key={label}
                              className="border-b border-r border-white/10 px-4 py-4 last:border-r-0 sm:border-b-0"
                            >
                              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {label}
                              </p>

                              <p className="mt-2 text-lg font-black text-white">
                                {value}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="border-t border-white/10 px-6 py-6">
                      <p className="text-sm text-slate-400">
                        League standing data
                        unavailable.
                      </p>
                    </div>
                  )}
                </Link>
              );
            },
          )}
        </div>
      </div>
    </section>
  );
}