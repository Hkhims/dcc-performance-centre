import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Match Details",
};

function formatMatchDate(date: string | null) {
  if (!date) return "Date unavailable";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function ballsToOvers(balls: number | null) {
  if (balls === null || balls === undefined) {
    return "—";
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
    return "—";
  }

  if (wickets === null || wickets === undefined) {
    return `${score}`;
  }

  return `${score}/${wickets}`;
}

function formatStrikeRate(
  runs: number | null,
  balls: number | null,
) {
  if (
    runs === null ||
    runs === undefined ||
    balls === null ||
    balls === undefined ||
    balls === 0
  ) {
    return "—";
  }

  return ((runs / balls) * 100).toFixed(2);
}

function formatEconomy(
  runs: number | null,
  balls: number | null,
) {
  if (
    runs === null ||
    runs === undefined ||
    balls === null ||
    balls === undefined ||
    balls === 0
  ) {
    return "—";
  }

  return (runs / (balls / 6)).toFixed(2);
}

function formatRunRate(
  runs: number | null,
  balls: number | null,
) {
  if (
    runs === null ||
    runs === undefined ||
    balls === null ||
    balls === undefined ||
    balls === 0
  ) {
    return "—";
  }

  return (runs / (balls / 6)).toFixed(2);
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

function getSearchParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ match_id: string }>;
  searchParams: Promise<{
    fromTeam?: string | string[];
    fromPlayer?: string | string[];
    playerTeam?: string | string[];
  }>;
}) {
  const { match_id } = await params;
  const resolvedSearchParams = await searchParams;

  const requestedFromTeamId = getSearchParam(
    resolvedSearchParams.fromTeam,
  );

  const requestedFromPlayerSlug = getSearchParam(
    resolvedSearchParams.fromPlayer,
  );

  const requestedPlayerTeamId = getSearchParam(
    resolvedSearchParams.playerTeam,
  );

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(`
      match_id,
      season,
      match_date,
      fixture_label,
      status,
      is_internal_dcc_match
    `)
    .eq("match_id", match_id)
    .single();

  if (matchError || !match) {
    notFound();
  }

  const { data: matchEntries, error: matchEntriesError } =
    await supabase
      .from("match_team_entries")
      .select(`
        source_match_id,
        match_id,
        team_id,
        competition_id,
        opponent_display_name,
        result,
        scheduled_overs,
        revised_overs,
        dcc_score,
        dcc_wickets,
        dcc_balls,
        opponent_score,
        opponent_wickets,
        opponent_balls,
        match_notes
      `)
      .eq("match_id", match.match_id);

  if (matchEntriesError) {
    throw new Error(matchEntriesError.message);
  }

  const entries = matchEntries ?? [];

  const teamIds = [
    ...new Set(
      entries
        .map((entry) => entry.team_id)
        .filter(Boolean),
    ),
  ];

  const competitionIds = [
    ...new Set(
      entries
        .map((entry) => entry.competition_id)
        .filter(Boolean),
    ),
  ];

  const sourceMatchIds = [
    ...new Set(
      entries
        .map((entry) => entry.source_match_id)
        .filter(Boolean),
    ),
  ];

  const [
    teamsResponse,
    competitionsResponse,
    performancesResponse,
    storiesResponse,
  ] = await Promise.all([
    teamIds.length > 0
      ? supabase
          .from("teams")
          .select("team_id, team_name, display_order")
          .in("team_id", teamIds)
      : Promise.resolve({ data: [], error: null }),

    competitionIds.length > 0
      ? supabase
          .from("competitions")
          .select("competition_id, competition_name")
          .in("competition_id", competitionIds)
      : Promise.resolve({ data: [], error: null }),

    sourceMatchIds.length > 0
      ? supabase
          .from("player_match_performances")
          .select(`
            source_match_id,
            player_id,
            team_id,
            batted,
            batting_position,
            runs,
            balls_faced,
            fours,
            sixes,
            dismissal_type,
            is_not_out,
            bowled,
            bowling_balls,
            maidens,
            runs_conceded,
            wickets,
            wides,
            no_balls,
            catches,
            stumpings,
            run_outs
          `)
          .in("source_match_id", sourceMatchIds)
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from("match_stories")
      .select(`
        story_id,
        match_id,
        team_id,
        story,
        author_label
      `)
      .eq("match_id", match.match_id),
  ]);

  if (teamsResponse.error) {
    throw new Error(teamsResponse.error.message);
  }

  if (competitionsResponse.error) {
    throw new Error(competitionsResponse.error.message);
  }

  if (performancesResponse.error) {
    throw new Error(performancesResponse.error.message);
  }

  if (storiesResponse.error) {
    throw new Error(storiesResponse.error.message);
  }

  const teams = teamsResponse.data ?? [];
  const competitions = competitionsResponse.data ?? [];
  const performances = performancesResponse.data ?? [];
  const stories = storiesResponse.data ?? [];

  const playerIds = [
    ...new Set(
      performances
        .map((performance) => performance.player_id)
        .filter(Boolean),
    ),
  ];

  const { data: players, error: playersError } =
    playerIds.length > 0
      ? await supabase
          .from("players")
          .select("player_id, player_name, player_slug")
          .in("player_id", playerIds)
      : { data: [], error: null };

  if (playersError) {
    throw new Error(playersError.message);
  }

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

  const playerMap = new Map(
    (players ?? []).map((player) => [
      player.player_id,
      player,
    ]),
  );

  const orderedEntries = [...entries].sort(
    (a, b) =>
      (teamOrderMap.get(a.team_id) ?? 999) -
      (teamOrderMap.get(b.team_id) ?? 999),
  );

  const primaryEntry = orderedEntries[0] ?? null;

  const competitionName =
    primaryEntry?.competition_id
      ? competitionNameMap.get(
          primaryEntry.competition_id,
        ) ?? "Competition"
      : "Competition";

  const isInternal = match.is_internal_dcc_match;

  // --------------------------------------------------
  // NAVIGATION CONTEXT
  // --------------------------------------------------

  const contextTeamName = requestedFromTeamId
    ? teamNameMap.get(requestedFromTeamId) ?? null
    : null;

  const contextPlayer = requestedFromPlayerSlug
    ? (players ?? []).find(
        (player) =>
          player.player_slug === requestedFromPlayerSlug,
      ) ?? null
    : null;

  const backHref =
    requestedFromTeamId && contextTeamName
      ? `/teams/${requestedFromTeamId}`
      : contextPlayer
        ? `/players/${contextPlayer.player_slug}${
            requestedPlayerTeamId
              ? `?team=${requestedPlayerTeamId}`
              : ""
          }`
        : "/matches";

  const backLabel =
    requestedFromTeamId && contextTeamName
      ? `Back to ${contextTeamName}`
      : contextPlayer
        ? `Back to ${contextPlayer.player_name}`
        : "Back to matches";

  return (
    <section className="px-4 py-8 sm:px-6 lg:py-10">
      <div className="site-container">
        {/* Back */}
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          <span aria-hidden="true">←</span>
          {backLabel}
        </Link>

        {/* Match Hero */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#101d32] via-[#0c1728] to-[#08111f]">
          <div className="px-6 py-7 sm:px-8 lg:px-10 lg:py-9">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d4af37]">
                    {formatMatchDate(match.match_date)}
                  </p>

                  <span
                    className="hidden h-1 w-1 rounded-full bg-slate-600 sm:block"
                    aria-hidden="true"
                  />

                  <p className="text-xs font-medium text-slate-400">
                    {competitionName}
                  </p>
                </div>

                <h1 className="mt-4 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                  {match.fixture_label}
                </h1>

                {match.status &&
                  match.status.trim().toLowerCase() !==
                    "completed" && (
                    <p className="mt-3 text-sm text-slate-400">
                      {match.status}
                    </p>
                  )}
              </div>

              {!isInternal &&
                primaryEntry?.result && (
                  <span
                    className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${getResultClasses(
                      primaryEntry.result,
                    )}`}
                  >
                    {primaryEntry.result}
                  </span>
                )}
            </div>
          </div>

          {/* Scores */}
          <div className="border-t border-white/10">
            {isInternal ? (
              <div className="grid sm:grid-cols-2">
                {orderedEntries.map((entry, index) => (
                  <div
                    key={`${entry.source_match_id}-${entry.team_id}`}
                    className={`px-6 py-6 sm:px-8 ${
                      index === 0
                        ? "border-b border-white/10 sm:border-b-0 sm:border-r"
                        : ""
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {teamNameMap.get(entry.team_id) ??
                        entry.team_id}
                    </p>

                    <p className="mt-2 text-3xl font-black text-white">
                      {formatScore(
                        entry.dcc_score,
                        entry.dcc_wickets,
                      )}
                    </p>

                    <p className="mt-2 text-sm text-slate-400">
                      {ballsToOvers(entry.dcc_balls)} overs
                    </p>

                    {entry.result && (
                      <span
                        className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${getResultClasses(
                          entry.result,
                        )}`}
                      >
                        {entry.result}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              primaryEntry && (
                <div className="grid sm:grid-cols-2">
                  <div className="border-b border-white/10 px-6 py-6 sm:border-b-0 sm:border-r sm:px-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {teamNameMap.get(
                        primaryEntry.team_id,
                      ) ?? primaryEntry.team_id}
                    </p>

                    <p className="mt-2 text-3xl font-black text-white">
                      {formatScore(
                        primaryEntry.dcc_score,
                        primaryEntry.dcc_wickets,
                      )}
                    </p>

                    {primaryEntry.dcc_balls !== null && (
                      <p className="mt-2 text-sm text-slate-400">
                        {ballsToOvers(
                          primaryEntry.dcc_balls,
                        )}{" "}
                        overs
                      </p>
                    )}
                  </div>

                  <div className="px-6 py-6 sm:px-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {primaryEntry.opponent_display_name}
                    </p>

                    <p className="mt-2 text-3xl font-black text-white">
                      {formatScore(
                        primaryEntry.opponent_score,
                        primaryEntry.opponent_wickets,
                      )}
                    </p>

                    {primaryEntry.opponent_balls !== null && (
                      <p className="mt-2 text-sm text-slate-400">
                        {ballsToOvers(
                          primaryEntry.opponent_balls,
                        )}{" "}
                        overs
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        {/* Team performance sections */}
        <div className="mt-8 space-y-10">
          {orderedEntries.map((entry) => {
            const teamName =
              teamNameMap.get(entry.team_id) ??
              entry.team_id;

            const teamPerformances = performances.filter(
              (performance) =>
                performance.source_match_id ===
                  entry.source_match_id &&
                performance.team_id === entry.team_id,
            );

            const battingRows = teamPerformances
              .filter((performance) => performance.batted)
              .sort(
                (a, b) =>
                  (a.batting_position ?? 999) -
                  (b.batting_position ?? 999),
              );

            const didNotBatRows = teamPerformances
              .filter(
                (performance) => !performance.batted,
              )
              .map((performance) =>
                playerMap.get(performance.player_id),
              )
              .filter(Boolean);

            const bowlingRows = teamPerformances.filter(
              (performance) => performance.bowled,
            );

            const fieldingRows = teamPerformances.filter(
              (performance) =>
                (performance.catches ?? 0) > 0 ||
                (performance.stumpings ?? 0) > 0 ||
                (performance.run_outs ?? 0) > 0,
            );

            const batterRuns = battingRows.reduce(
              (total, performance) =>
                total + (performance.runs ?? 0),
              0,
            );

            const extras =
              entry.dcc_score !== null &&
              entry.dcc_score !== undefined
                ? entry.dcc_score - batterRuns
                : null;

            const runRate = formatRunRate(
              entry.dcc_score,
              entry.dcc_balls,
            );

            return (
              <section
                key={`${entry.source_match_id}-${entry.team_id}`}
              >
                {isInternal && (
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                      Team Performance
                    </p>

                    <h2 className="mt-1 text-2xl font-black uppercase text-white">
                      {teamName}
                    </h2>
                  </div>
                )}

                {/* Match info */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Result
                    </p>

                    <p className="mt-2 font-bold text-white">
                      {entry.result ?? "—"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Scheduled Overs
                    </p>

                    <p className="mt-2 font-bold text-white">
                      {entry.scheduled_overs ?? "—"}
                    </p>
                  </div>

                  {entry.revised_overs !== null &&
                    entry.revised_overs !== undefined && (
                      <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Revised Overs
                        </p>

                        <p className="mt-2 font-bold text-white">
                          {entry.revised_overs}
                        </p>
                      </div>
                    )}

                  <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Match Note
                    </p>

                    <p className="mt-2 text-sm font-medium text-white">
                      {entry.match_notes ?? "—"}
                    </p>
                  </div>
                </div>

                {/* Batting */}
                {battingRows.length > 0 && (
                  <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
                    <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                        Batting
                      </p>

                      <h3 className="mt-1 text-xl font-black uppercase text-white">
                        {teamName} Batting
                      </h3>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left">
                        <thead className="bg-white/[0.02]">
                          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            <th className="px-5 py-3 sm:px-6">
                              Batter
                            </th>
                            <th className="px-4 py-3">
                              Dismissal
                            </th>
                            <th className="px-4 py-3 text-right">
                              R
                            </th>
                            <th className="px-4 py-3 text-right">
                              B
                            </th>
                            <th className="px-4 py-3 text-right">
                              4s
                            </th>
                            <th className="px-4 py-3 text-right">
                              6s
                            </th>
                            <th className="px-5 py-3 text-right sm:px-6">
                              SR
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {battingRows.map(
                            (performance) => {
                              const player =
                                playerMap.get(
                                  performance.player_id,
                                );

                              return (
                                <tr
                                  key={performance.player_id}
                                  className="border-t border-white/10"
                                >
                                  <td className="px-5 py-4 font-semibold text-white sm:px-6">
                                    {player ? (
                                      <Link
                                        href={`/players/${player.player_slug}?fromMatch=${match.match_id}`}
                                        className="transition hover:text-[#d4af37]"
                                      >
                                        {player.player_name}
                                      </Link>
                                    ) : (
                                      performance.player_id
                                    )}
                                  </td>

                                  <td className="px-4 py-4 text-sm text-slate-400">
                                    {performance.is_not_out
                                      ? "Not Out"
                                      : performance.dismissal_type ??
                                        "—"}
                                  </td>

                                  <td className="px-4 py-4 text-right font-black text-white">
                                    {performance.runs ?? 0}
                                    {performance.is_not_out
                                      ? "*"
                                      : ""}
                                  </td>

                                  <td className="px-4 py-4 text-right text-slate-300">
                                    {performance.balls_faced ??
                                      "—"}
                                  </td>

                                  <td className="px-4 py-4 text-right text-slate-300">
                                    {performance.fours ?? 0}
                                  </td>

                                  <td className="px-4 py-4 text-right text-slate-300">
                                    {performance.sixes ?? 0}
                                  </td>

                                  <td className="px-5 py-4 text-right text-slate-300 sm:px-6">
                                    {formatStrikeRate(
                                      performance.runs,
                                      performance.balls_faced,
                                    )}
                                  </td>
                                </tr>
                              );
                            },
                          )}

                          {didNotBatRows.length > 0 && (
                            <tr className="border-t border-white/10">
                              <td
                                colSpan={7}
                                className="px-5 py-4 text-sm text-slate-400 sm:px-6"
                              >
                                <span className="font-semibold text-slate-300">
                                  Did not bat:
                                </span>{" "}
                                {didNotBatRows
                                  .map(
                                    (player) =>
                                      player?.player_name,
                                  )
                                  .filter(Boolean)
                                  .join(", ")}
                              </td>
                            </tr>
                          )}

                          <tr className="border-t border-white/10 bg-white/[0.02]">
                            <td className="px-5 py-4 font-semibold text-slate-300 sm:px-6">
                              Extras
                            </td>

                            <td className="px-4 py-4" />

                            <td className="px-4 py-4 text-right font-black text-white">
                              {extras ?? "—"}
                            </td>

                            <td className="px-4 py-4" />
                            <td className="px-4 py-4" />
                            <td className="px-4 py-4" />
                            <td className="px-5 py-4 sm:px-6" />
                          </tr>

                          <tr className="border-t border-white/10 bg-white/[0.04]">
                            <td className="px-5 py-4 font-black text-white sm:px-6">
                              Total
                            </td>

                            <td className="px-4 py-4" />

                            <td className="px-4 py-4 text-right font-black text-white">
                              {formatScore(
                                entry.dcc_score,
                                entry.dcc_wickets,
                              )}
                            </td>

                            <td
                              colSpan={4}
                              className="px-4 py-4 text-sm font-semibold text-slate-400"
                            >
                              {entry.dcc_balls !== null &&
                                entry.dcc_balls !==
                                  undefined && (
                                  <>
                                    {ballsToOvers(
                                      entry.dcc_balls,
                                    )}{" "}
                                    overs, RR: {runRate}
                                  </>
                                )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Bowling */}
                {bowlingRows.length > 0 && (
                  <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
                    <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                        Bowling
                      </p>

                      <h3 className="mt-1 text-xl font-black uppercase text-white">
                        {teamName} Bowling
                      </h3>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left">
                        <thead className="bg-white/[0.02]">
                          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            <th className="px-5 py-3 sm:px-6">
                              Bowler
                            </th>
                            <th className="px-4 py-3 text-right">
                              O
                            </th>
                            <th className="px-4 py-3 text-right">
                              M
                            </th>
                            <th className="px-4 py-3 text-right">
                              R
                            </th>
                            <th className="px-4 py-3 text-right">
                              W
                            </th>
                            <th className="px-4 py-3 text-right">
                              Econ
                            </th>
                            <th className="px-4 py-3 text-right">
                              WD
                            </th>
                            <th className="px-5 py-3 text-right sm:px-6">
                              NB
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {bowlingRows.map(
                            (performance) => {
                              const player =
                                playerMap.get(
                                  performance.player_id,
                                );

                              return (
                                <tr
                                  key={performance.player_id}
                                  className="border-t border-white/10"
                                >
                                  <td className="px-5 py-4 font-semibold text-white sm:px-6">
                                    {player ? (
                                      <Link
                                        href={`/players/${player.player_slug}?fromMatch=${match.match_id}`}
                                        className="transition hover:text-[#d4af37]"
                                      >
                                        {player.player_name}
                                      </Link>
                                    ) : (
                                      performance.player_id
                                    )}
                                  </td>

                                  <td className="px-4 py-4 text-right text-slate-300">
                                    {ballsToOvers(
                                      performance.bowling_balls,
                                    )}
                                  </td>

                                  <td className="px-4 py-4 text-right text-slate-300">
                                    {performance.maidens ??
                                      0}
                                  </td>

                                  <td className="px-4 py-4 text-right text-slate-300">
                                    {performance.runs_conceded ??
                                      0}
                                  </td>

                                  <td className="px-4 py-4 text-right font-black text-white">
                                    {performance.wickets ?? 0}
                                  </td>

                                  <td className="px-4 py-4 text-right text-slate-300">
                                    {formatEconomy(
                                      performance.runs_conceded,
                                      performance.bowling_balls,
                                    )}
                                  </td>

                                  <td className="px-4 py-4 text-right text-slate-300">
                                    {performance.wides ?? 0}
                                  </td>

                                  <td className="px-5 py-4 text-right text-slate-300 sm:px-6">
                                    {performance.no_balls ??
                                      0}
                                  </td>
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Fielding */}
                {fieldingRows.length > 0 && (
                  <section className="mt-6 rounded-2xl border border-white/10 bg-[#0b1220] p-5 sm:p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                      Fielding
                    </p>

                    <h3 className="mt-1 text-xl font-black uppercase text-white">
                      {teamName} Fielding
                    </h3>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {fieldingRows.map(
                        (performance) => {
                          const player =
                            playerMap.get(
                              performance.player_id,
                            );

                          const contributions: string[] =
                            [];

                          if (
                            (performance.catches ?? 0) > 0
                          ) {
                            contributions.push(
                              `${performance.catches} ${
                                performance.catches === 1
                                  ? "catch"
                                  : "catches"
                              }`,
                            );
                          }

                          if (
                            (performance.stumpings ?? 0) > 0
                          ) {
                            contributions.push(
                              `${performance.stumpings} ${
                                performance.stumpings === 1
                                  ? "stumping"
                                  : "stumpings"
                              }`,
                            );
                          }

                          if (
                            (performance.run_outs ?? 0) > 0
                          ) {
                            contributions.push(
                              `${performance.run_outs} ${
                                performance.run_outs === 1
                                  ? "run out"
                                  : "run outs"
                              }`,
                            );
                          }

                          return (
                            <div
                              key={performance.player_id}
                              className="rounded-xl border border-white/10 bg-[#0e1727] p-4"
                            >
                              <p className="font-bold text-white">
                                {player ? (
                                  <Link
                                    href={`/players/${player.player_slug}?fromMatch=${match.match_id}`}
                                    className="transition hover:text-[#d4af37]"
                                  >
                                    {player.player_name}
                                  </Link>
                                ) : (
                                  performance.player_id
                                )}
                              </p>

                              <p className="mt-2 text-sm text-slate-400">
                                {contributions.join(" • ")}
                              </p>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </section>
                )}
              </section>
            );
          })}
        </div>

        {/* Match Stories */}
        {stories.length > 0 && (
          <section className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
              Match Story
            </p>

            <h2 className="mt-1 text-2xl font-black uppercase text-white">
              Inside the Match
            </h2>

            <div className="mt-5 space-y-4">
              {stories.map((story) => (
                <article
                  key={story.story_id}
                  className="rounded-2xl border border-white/10 bg-[#0b1220] p-5 sm:p-6"
                >
                  {isInternal && (
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {teamNameMap.get(story.team_id) ??
                        story.team_id}
                    </p>
                  )}

                  <p className="mt-2 leading-7 text-slate-300">
                    {story.story}
                  </p>

                  {story.author_label && (
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {story.author_label}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}