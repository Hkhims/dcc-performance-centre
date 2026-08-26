import Link from "next/link";
import { supabase } from "@/lib/supabase";

function getSearchParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatMatchDate(date: string | null) {
  if (!date) return "Date unavailable";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function getMonthLabel(date: string | null) {
  if (!date) return "Date unavailable";

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function ballsToOvers(balls: number | null) {
  if (balls === null || balls === undefined) {
    return null;
  }

  const overs = Math.floor(balls / 6);
  const remainingBalls = balls % 6;

  return `${overs}.${remainingBalls}`;
}

function formatScore(
  score: number | null,
  wickets: number | null,
) {
  if (score === null || score === undefined) {
    return null;
  }

  if (wickets === null || wickets === undefined) {
    return `${score}`;
  }

  return `${score}/${wickets}`;
}

function getResultClasses(result: string | null) {
  const normalized = result?.trim().toLowerCase();

  if (normalized === "won" || normalized === "win") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }

  if (normalized === "lost" || normalized === "loss") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  if (normalized === "tied" || normalized === "tie") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  }

  return "border-white/10 bg-white/5 text-slate-300";
}

function getStatusClasses(status: string | null) {
  const normalized = status?.trim().toLowerCase();

  if (normalized === "scheduled") {
    return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  }

  if (normalized === "awarded") {
    return "border-[#d4af37]/30 bg-[#d4af37]/10 text-[#d4af37]";
  }

  return "border-white/10 bg-white/5 text-slate-300";
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{
    team?: string | string[];
    competition?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;

  const selectedTeam = getSearchParam(
    resolvedSearchParams.team,
  );

  const selectedCompetition = getSearchParam(
    resolvedSearchParams.competition,
  );

  const [
    matchesResponse,
    matchEntriesResponse,
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
      .order("match_date", { ascending: false }),

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
        dcc_balls,
        opponent_score,
        opponent_wickets,
        opponent_balls
      `),

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
      .eq("season", 2026)
      .order("competition_name", { ascending: true }),
  ]);

  if (matchesResponse.error) {
    throw new Error(matchesResponse.error.message);
  }

  if (matchEntriesResponse.error) {
    throw new Error(matchEntriesResponse.error.message);
  }

  if (teamsResponse.error) {
    throw new Error(teamsResponse.error.message);
  }

  if (competitionsResponse.error) {
    throw new Error(competitionsResponse.error.message);
  }

  const matches = matchesResponse.data ?? [];
  const matchEntries = matchEntriesResponse.data ?? [];
  const teams = teamsResponse.data ?? [];
  const competitions = competitionsResponse.data ?? [];

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

  const enrichedMatches = matches.map((match) => {
    const entries = [
      ...(entriesByMatch.get(match.match_id) ?? []),
    ].sort(
      (a, b) =>
        (teamOrderMap.get(a.team_id) ?? 999) -
        (teamOrderMap.get(b.team_id) ?? 999),
    );

    const primaryEntry = entries[0] ?? null;

    return {
      ...match,
      entries,
      primaryEntry,
      competition_id:
        primaryEntry?.competition_id ?? null,
      competition_name:
        primaryEntry?.competition_id
          ? competitionNameMap.get(
              primaryEntry.competition_id,
            ) ?? "Competition"
          : "Competition",
    };
  });

  const filteredMatches = enrichedMatches.filter(
    (match) => {
      const matchesTeam =
        !selectedTeam ||
        match.entries.some(
          (entry) => entry.team_id === selectedTeam,
        );

      const matchesCompetition =
        !selectedCompetition ||
        match.entries.some(
          (entry) =>
            entry.competition_id ===
            selectedCompetition,
        );

      return matchesTeam && matchesCompetition;
    },
  );

  const groupedMatches = new Map<
    string,
    typeof filteredMatches
  >();

  for (const match of filteredMatches) {
    const monthLabel = getMonthLabel(match.match_date);

    const currentMatches =
      groupedMatches.get(monthLabel) ?? [];

    currentMatches.push(match);

    groupedMatches.set(
      monthLabel,
      currentMatches,
    );
  }

  const usedCompetitionIds = new Set(
    matchEntries
      .map((entry) => entry.competition_id)
      .filter(Boolean),
  );

  const availableCompetitions =
    competitions.filter((competition) =>
      usedCompetitionIds.has(
        competition.competition_id,
      ),
    );

  return (
    <section className="px-4 py-8 sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
            2026 Season
          </p>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">
                Matches
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Browse Dunmurry Cricket Club results and
                fixtures across every team and competition.
              </p>
            </div>

            <p className="text-sm text-slate-400">
              <span className="font-bold text-white">
                {filteredMatches.length}
              </span>{" "}
              {filteredMatches.length === 1
                ? "match"
                : "matches"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <form
          method="get"
          className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-[#0b1220] p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]"
        >
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Team
            </span>

            <select
              name="team"
              defaultValue={selectedTeam}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0e1727] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]/50"
            >
              <option value="">
                All Teams
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
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Competition
            </span>

            <select
              name="competition"
              defaultValue={selectedCompetition}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0e1727] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]/50"
            >
              <option value="">
                All Competitions
              </option>

              {availableCompetitions.map(
                (competition) => (
                  <option
                    key={competition.competition_id}
                    value={
                      competition.competition_id
                    }
                  >
                    {competition.competition_name}
                  </option>
                ),
              )}
            </select>
          </label>

          <button
            type="submit"
            className="self-end rounded-xl bg-[#d4af37] px-5 py-3 text-sm font-bold text-[#08111f] transition hover:bg-[#e2c15b]"
          >
            Apply Filters
          </button>

          {(selectedTeam ||
            selectedCompetition) && (
            <Link
              href="/matches"
              className="self-end rounded-xl border border-white/10 px-5 py-3 text-center text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              Clear
            </Link>
          )}
        </form>

        {/* Match Groups */}
        <div className="mt-8 space-y-10">
          {Array.from(groupedMatches.entries()).map(
            ([monthLabel, monthMatches]) => (
              <section key={monthLabel}>
                <div className="mb-4 flex items-center gap-4">
                  <h2 className="text-lg font-black uppercase tracking-wide text-white">
                    {monthLabel}
                  </h2>

                  <div className="h-px flex-1 bg-white/10" />

                  <span className="text-xs font-semibold text-slate-500">
                    {monthMatches.length}
                  </span>
                </div>

                <div className="space-y-4">
                  {monthMatches.map((match) => {
                    const primaryEntry =
                      match.primaryEntry;

                    const isScheduled =
                      match.status
                        ?.trim()
                        .toLowerCase() ===
                      "scheduled";

                    const isAwarded =
                      match.status
                        ?.trim()
                        .toLowerCase() ===
                      "awarded";

                    const isInternal =
                      match.is_internal_dcc_match;

                    return (
                      <Link
  key={match.match_id}
  href={`/matches/${match.match_id}`}
  className="block overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] transition hover:border-[#d4af37]/30 hover:bg-[#0d1524]"
>
                        {/* Match Header */}
                        <div className="px-5 py-5 sm:px-6">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d4af37]">
                                  {formatMatchDate(
                                    match.match_date,
                                  )}
                                </p>

                                <span
                                  className="hidden h-1 w-1 rounded-full bg-slate-600 sm:block"
                                  aria-hidden="true"
                                />

                                <p className="text-xs font-medium text-slate-500">
                                  {
                                    match.competition_name
                                  }
                                </p>
                              </div>

                              <h3 className="mt-3 text-xl font-black text-white sm:text-2xl">
                                {match.fixture_label}
                              </h3>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {(isScheduled ||
                                isAwarded) && (
                                <span
                                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${getStatusClasses(
                                    match.status,
                                  )}`}
                                >
                                  {match.status}
                                </span>
                              )}

                              {!isScheduled &&
  !isInternal &&
  primaryEntry?.result && (
                                  <span
                                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${getResultClasses(
                                      primaryEntry.result,
                                    )}`}
                                  >
                                    {
                                      primaryEntry.result
                                    }
                                  </span>
                                )}
                            </div>
                          </div>
                        </div>

                        {/* Internal DCC Match */}
                        {isInternal &&
                          match.entries.length > 0 && (
                            <div className="border-t border-white/10">
                              {match.entries.map(
                                (entry) => {
                                  const score =
                                    formatScore(
                                      entry.dcc_score,
                                      entry.dcc_wickets,
                                    );

                                  const overs =
                                    ballsToOvers(
                                      entry.dcc_balls,
                                    );

                                  return (
                                    <div
                                      key={`${match.match_id}-${entry.team_id}`}
                                      className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 last:border-b-0 sm:px-6"
                                    >
                                      <div>
                                        <p className="font-bold text-white">
                                          {teamNameMap.get(
                                            entry.team_id,
                                          ) ??
                                            entry.team_id}
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                          {entry.result}
                                        </p>
                                      </div>

                                      <p className="text-right text-lg font-black text-white">
                                        {score ?? "—"}

                                        {overs && (
                                          <span className="ml-2 text-xs font-medium text-slate-500">
                                            ({overs} ov)
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          )}

                        {/* Normal Match */}
                        {!isInternal &&
                          primaryEntry && (
                            <div className="border-t border-white/10">
                              <div className="grid sm:grid-cols-2">
                                <div className="border-b border-white/10 px-5 py-4 sm:border-b-0 sm:border-r sm:px-6">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    {
                                      teamNameMap.get(
                                        primaryEntry.team_id,
                                      ) ??
                                      primaryEntry.team_id
                                    }
                                  </p>

                                  {formatScore(
                                    primaryEntry.dcc_score,
                                    primaryEntry.dcc_wickets,
                                  ) ? (
                                    <p className="mt-2 text-xl font-black text-white">
                                      {formatScore(
                                        primaryEntry.dcc_score,
                                        primaryEntry.dcc_wickets,
                                      )}

                                      {ballsToOvers(
                                        primaryEntry.dcc_balls,
                                      ) && (
                                        <span className="ml-2 text-xs font-medium text-slate-500">
                                          (
                                          {ballsToOvers(
                                            primaryEntry.dcc_balls,
                                          )}{" "}
                                          ov)
                                        </span>
                                      )}
                                    </p>
                                  ) : (
                                    <p className="mt-2 text-sm font-medium text-slate-500">
                                      {isScheduled
                                        ? "Yet to play"
                                        : isAwarded
                                          ? "Did not bat"
                                          : "Score unavailable"}
                                    </p>
                                  )}
                                </div>

                                <div className="px-5 py-4 sm:px-6">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    {
                                      primaryEntry.opponent_display_name
                                    }
                                  </p>

                                  {formatScore(
                                    primaryEntry.opponent_score,
                                    primaryEntry.opponent_wickets,
                                  ) ? (
                                    <p className="mt-2 text-xl font-black text-white">
                                      {formatScore(
                                        primaryEntry.opponent_score,
                                        primaryEntry.opponent_wickets,
                                      )}

                                      {ballsToOvers(
                                        primaryEntry.opponent_balls,
                                      ) && (
                                        <span className="ml-2 text-xs font-medium text-slate-500">
                                          (
                                          {ballsToOvers(
                                            primaryEntry.opponent_balls,
                                          )}{" "}
                                          ov)
                                        </span>
                                      )}
                                    </p>
                                  ) : (
                                    <p className="mt-2 text-sm font-medium text-slate-500">
                                      {isScheduled
                                        ? "Yet to play"
                                        : "Score unavailable"}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                        {!primaryEntry && (
                          <div className="border-t border-white/10 px-5 py-4 text-sm text-slate-500 sm:px-6">
                            Match details unavailable.
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ),
          )}
        </div>

        {filteredMatches.length === 0 && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-[#0b1220] p-8 text-center">
            <p className="font-semibold text-white">
              No matches found
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Try changing the team or competition
              filters.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}