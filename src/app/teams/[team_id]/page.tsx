import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Team Performance",
};

function formatNumber(value: number | null, decimals = 2) {
  if (value === null || value === undefined) return "—";
  return value.toFixed(decimals);
}

function ballsToOvers(balls: number | null) {
  if (balls === null || balls === undefined) return "—";

  const overs = Math.floor(balls / 6);
  const remainingBalls = balls % 6;

  return `${overs}.${remainingBalls}`;
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
    return "—";
  }

  return value > 0
    ? `+${value.toFixed(2)}`
    : value.toFixed(2);
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

function getStandingStatusClasses(status: string | null) {
  const normalized = status?.toLowerCase() ?? "";

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
function getTeamLogo(teamId: string) {
  const logos: Record<string, string> = {
    T01: "/team-logos/dcc-1.png",
    T02: "/team-logos/dcc-2.png",
    T03: "/team-logos/dcc-3.png",
    T04: "/team-logos/dcc-4.png",
    T05: "/team-logos/midweek-1.png",
    T06: "/team-logos/midweek-2.png",
  };

  return logos[teamId] ?? null;
}
export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ team_id: string }>;
}) {
  const { team_id } = await params;

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("team_id, team_name, display_order")
    .eq("team_id", team_id)
    .single();

  if (teamError || !team) {
    notFound();
  }

  const { data: teamEntries, error: teamEntriesError } =
    await supabase
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
      `)
      .eq("team_id", team.team_id);

  if (teamEntriesError) {
    throw new Error(teamEntriesError.message);
  }

  const entries = teamEntries ?? [];

  const competitionIds = [
    ...new Set(
      entries
        .map((entry) => entry.competition_id)
        .filter(Boolean),
    ),
  ];

  const matchIds = [
    ...new Set(
      entries
        .map((entry) => entry.match_id)
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
    competitionsResponse,
    matchesResponse,
    performancesResponse,
    standingsResponse,
  ] = await Promise.all([
    competitionIds.length > 0
      ? supabase
          .from("competitions")
          .select(`
            competition_id,
            competition_name,
            competition_type
          `)
          .in("competition_id", competitionIds)
      : Promise.resolve({ data: [], error: null }),

    matchIds.length > 0
      ? supabase
          .from("matches")
          .select(`
            match_id,
            match_date,
            fixture_label,
            status
          `)
          .in("match_id", matchIds)
      : Promise.resolve({ data: [], error: null }),

    sourceMatchIds.length > 0
      ? supabase
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
            is_not_out,
            bowled,
            bowling_balls,
            maidens,
            runs_conceded,
            wickets,
            catches,
            stumpings,
            run_outs
          `)
          .eq("team_id", team.team_id)
      : Promise.resolve({ data: [], error: null }),

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
      .order("position", { ascending: true }),
  ]);

  if (competitionsResponse.error) {
    throw new Error(competitionsResponse.error.message);
  }

  if (matchesResponse.error) {
    throw new Error(matchesResponse.error.message);
  }

  if (performancesResponse.error) {
    throw new Error(performancesResponse.error.message);
  }

  if (standingsResponse.error) {
    throw new Error(standingsResponse.error.message);
  }

  const competitions = competitionsResponse.data ?? [];
  const matches = matchesResponse.data ?? [];
  const performances = performancesResponse.data ?? [];
  const standings = standingsResponse.data ?? [];

  const competitionMap = new Map(
    competitions.map((competition) => [
      competition.competition_id,
      competition,
    ]),
  );

  const matchMap = new Map(
    matches.map((match) => [match.match_id, match]),
  );

  const leagueStandingCompetitionIds = new Set(
    standings
      .filter((standing) => standing.is_dunmurry)
      .map((standing) => standing.competition_id),
  );

  const primaryLeagueCompetitionId =
    competitionIds.find((competitionId) =>
      leagueStandingCompetitionIds.has(competitionId),
    ) ?? null;

  const primaryLeagueCompetition =
    primaryLeagueCompetitionId
      ? competitionMap.get(primaryLeagueCompetitionId) ?? null
      : null;

  const leagueTable =
    primaryLeagueCompetitionId !== null
      ? standings.filter(
          (standing) =>
            standing.competition_id ===
            primaryLeagueCompetitionId,
        )
      : [];

  const teamStanding =
    leagueTable.find((standing) => standing.is_dunmurry) ??
    null;

  const statuses =
    team.team_id === "T06"
      ? ["Champion"]
      : teamStanding?.status
          ?.split(",")
          .map((status: string) => status.trim())
          .filter(Boolean) ?? [];

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

  const playerMap = new Map(
    (players ?? []).map((player) => [
      player.player_id,
      player,
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
      appearances: Set<string>;

      battingInnings: number;
      runs: number;
      ballsFaced: number;
      notOuts: number;
      fours: number;
      sixes: number;
      highestScore: number;
      highestNotOut: boolean;

      bowlingInnings: number;
      bowlingBalls: number;
      runsConceded: number;
      wickets: number;
      maidens: number;
      bestWickets: number;
      bestRuns: number | null;

      catches: number;
      stumpings: number;
      runOuts: number;
    }
  >();

  for (const performance of performances) {
    const player = playerMap.get(performance.player_id);

    if (!player) continue;

    if (!playerStats.has(player.player_id)) {
      playerStats.set(player.player_id, {
        player_id: player.player_id,
        player_name: player.player_name,
        player_slug: player.player_slug,
        appearances: new Set<string>(),

        battingInnings: 0,
        runs: 0,
        ballsFaced: 0,
        notOuts: 0,
        fours: 0,
        sixes: 0,
        highestScore: 0,
        highestNotOut: false,

        bowlingInnings: 0,
        bowlingBalls: 0,
        runsConceded: 0,
        wickets: 0,
        maidens: 0,
        bestWickets: 0,
        bestRuns: null,

        catches: 0,
        stumpings: 0,
        runOuts: 0,
      });
    }

    const stats = playerStats.get(player.player_id)!;

    stats.appearances.add(performance.source_match_id);

    if (performance.batted) {
      stats.battingInnings += 1;
      stats.runs += performance.runs ?? 0;
      stats.ballsFaced += performance.balls_faced ?? 0;
      stats.fours += performance.fours ?? 0;
      stats.sixes += performance.sixes ?? 0;

      if (performance.is_not_out) {
        stats.notOuts += 1;
      }

      const inningsRuns = performance.runs ?? 0;

      if (
        inningsRuns > stats.highestScore ||
        (inningsRuns === stats.highestScore &&
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
      stats.bowlingBalls += performance.bowling_balls ?? 0;
      stats.runsConceded +=
        performance.runs_conceded ?? 0;
      stats.wickets += performance.wickets ?? 0;
      stats.maidens += performance.maidens ?? 0;

      const inningsWickets = performance.wickets ?? 0;
      const inningsRuns = performance.runs_conceded ?? 0;

      if (
        inningsWickets > stats.bestWickets ||
        (inningsWickets === stats.bestWickets &&
          (stats.bestRuns === null ||
            inningsRuns < stats.bestRuns))
      ) {
        stats.bestWickets = inningsWickets;
        stats.bestRuns = inningsRuns;
      }
    }

    stats.catches += performance.catches ?? 0;
    stats.stumpings += performance.stumpings ?? 0;
    stats.runOuts += performance.run_outs ?? 0;
  }

  const aggregatedPlayers = Array.from(
    playerStats.values(),
  );

  const battingLeaderboard = aggregatedPlayers
    .filter((player) => player.battingInnings > 0)
    .map((player) => {
      const dismissals =
        player.battingInnings - player.notOuts;

      const average =
        dismissals > 0
          ? player.runs / dismissals
          : null;

      const strikeRate =
        player.ballsFaced > 0
          ? (player.runs / player.ballsFaced) * 100
          : null;

      return {
        ...player,
        average,
        strikeRate,
      };
    })
    .sort((a, b) => {
      if (b.runs !== a.runs) {
        return b.runs - a.runs;
      }

      return (b.average ?? -1) - (a.average ?? -1);
    });

  const bowlingLeaderboard = aggregatedPlayers
    .filter((player) => player.bowlingInnings > 0)
    .map((player) => {
      const average =
        player.wickets > 0
          ? player.runsConceded / player.wickets
          : null;

      const economy =
        player.bowlingBalls > 0
          ? player.runsConceded /
            (player.bowlingBalls / 6)
          : null;

      return {
        ...player,
        average,
        economy,
      };
    })
    .sort((a, b) => {
      if (b.wickets !== a.wickets) {
        return b.wickets - a.wickets;
      }

      return (
        (a.average ?? Number.POSITIVE_INFINITY) -
        (b.average ?? Number.POSITIVE_INFINITY)
      );
    });

  const topBatters = battingLeaderboard.slice(0, 5);
  const topBowlers = bowlingLeaderboard.slice(0, 5);

  const battingLeader = topBatters[0] ?? null;
  const bowlingLeader = topBowlers[0] ?? null;

  const squad = [...aggregatedPlayers].sort((a, b) => {
    if (b.appearances.size !== a.appearances.size) {
      return b.appearances.size - a.appearances.size;
    }

    return a.player_name.localeCompare(b.player_name);
  });

  // --------------------------------------------------
  // MATCHES
  // --------------------------------------------------

  const enrichedMatches = entries
    .map((entry) => {
      const match = matchMap.get(entry.match_id);

      const competition =
        competitionMap.get(entry.competition_id) ?? null;

      return {
        ...entry,
        match,
        competition,
      };
    })
    .filter((entry) => entry.match)
    .sort((a, b) => {
      const dateA = a.match?.match_date ?? "";
      const dateB = b.match?.match_date ?? "";

      return dateB.localeCompare(dateA);
    });

  const recentMatches = enrichedMatches.slice(0, 4);

  const wins = enrichedMatches.filter(
    (entry) =>
      entry.result?.trim().toLowerCase() === "won",
  ).length;

  const losses = enrichedMatches.filter(
    (entry) =>
      entry.result?.trim().toLowerCase() === "lost",
  ).length;

  return (
    <section className="px-4 py-8 sm:px-6 lg:py-10">
      <div className="site-container">
        {/* Back */}
        <Link
          href="/teams"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to teams
        </Link>

        {/* HERO */}
        <section className="relative mt-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#13223a] via-[#0b1728] to-[#07101d]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(212,175,55,0.10),transparent_35%)]" />

          <div className="relative px-6 py-9 sm:px-8 lg:px-10 lg:py-12">
            <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <div className="flex items-center gap-5">
                  {getTeamLogo(team.team_id) && (
                    <Image
                      src={getTeamLogo(team.team_id)!}
                      alt={`${team.team_name} logo`}
                      width={96}
                      height={96}
                      className="h-20 w-20 shrink-0 object-contain sm:h-24 sm:w-24"
                    />
                  )}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d4af37]">
                      2026 Team Performance
                    </p>

                    <h1 className="mt-4 text-5xl font-black uppercase tracking-tight text-white sm:text-6xl">
                      {team.team_name}
                    </h1>

                    {primaryLeagueCompetition && (
                      <p className="mt-3 text-base font-medium text-blue-300">
                        {primaryLeagueCompetition.competition_name}
                      </p>
                    )}
                  </div>
                </div>

                {statuses.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {statuses.map((status: string) => (
                      <span
                        key={status}
                        className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${getStandingStatusClasses(
                          status,
                        )}`}
                      >
                        {status}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {teamStanding && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[560px]">
                  {[
                    [
                      "League Position",
                      ordinal(teamStanding.position),
                    ],
                    [
                      "League Record",
                      `${teamStanding.won}-${teamStanding.lost}`,
                    ],
                    ["Points", teamStanding.points],
                    [
                      "NRR",
                      formatNrr(
                        teamStanding.net_run_rate,
                      ),
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/10 bg-black/10 px-4 py-5 backdrop-blur-sm"
                    >
                      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                        {label}
                      </p>

                      <p className="mt-2 text-2xl font-black text-white">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-6 text-sm text-slate-400">
              <p>
                <span className="font-black text-white">
                  {enrichedMatches.length}
                </span>{" "}
                matches
              </p>

              <p>
                <span className="font-black text-emerald-300">
                  {wins}
                </span>{" "}
                wins
              </p>

              <p>
                <span className="font-black text-red-300">
                  {losses}
                </span>{" "}
                losses
              </p>

              <p>
                <span className="font-black text-white">
                  {squad.length}
                </span>{" "}
                players used
              </p>
            </div>
          </div>
        </section>

        {/* PERFORMANCE LEADERS */}
        <section className="mt-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4af37]">
              Performance Leaders
            </p>

            <h2 className="mt-1 text-2xl font-black uppercase text-white">
              Season Leaders
            </h2>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* BATTING LEADERS */}
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
              <div className="border-b border-white/10 px-5 py-5 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                  Batting
                </p>

                <h3 className="mt-1 text-xl font-black uppercase text-white">
                  Run Leaders
                </h3>
              </div>

              {battingLeader && (
                <div className="border-b border-white/10 bg-gradient-to-r from-[#d4af37]/10 to-transparent px-5 py-6 sm:px-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">
                        Leading Run Scorer
                      </p>

                      <Link
                        href={`/players/${battingLeader.player_slug}?team=${team.team_id}&fromTeam=${team.team_id}`}
                        className="mt-2 block text-2xl font-black text-white transition hover:text-[#d4af37]"
                      >
                        {battingLeader.player_name}
                      </Link>

                      <p className="mt-2 text-sm text-slate-400">
                        {battingLeader.battingInnings} innings
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-4xl font-black text-white">
                        {battingLeader.runs}
                      </p>

                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        runs
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        Average
                      </p>

                      <p className="mt-1 font-black text-white">
                        {formatNumber(
                          battingLeader.average,
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        Strike Rate
                      </p>

                      <p className="mt-1 font-black text-white">
                        {formatNumber(
                          battingLeader.strikeRate,
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        Highest
                      </p>

                      <p className="mt-1 font-black text-white">
                        {battingLeader.highestScore}
                        {battingLeader.highestNotOut
                          ? "*"
                          : ""}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                {topBatters.slice(1).map((player, index) => (
                  <Link
                    key={player.player_id}
                    href={`/players/${player.player_slug}?team=${team.team_id}&fromTeam=${team.team_id}`}
                    className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-white/10 px-5 py-4 transition last:border-b-0 hover:bg-white/[0.02] sm:px-6"
                  >
                    <span className="text-sm font-black text-slate-500">
                      {index + 2}
                    </span>

                    <div>
                      <p className="font-bold text-white">
                        {player.player_name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Avg {formatNumber(player.average)} · SR{" "}
                        {formatNumber(player.strikeRate)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-black text-white">
                        {player.runs}
                      </p>

                      <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
                        runs
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              {battingLeaderboard.length > 5 && (
                <details className="border-t border-white/10">
                  <summary className="cursor-pointer list-none px-5 py-4 text-center text-sm font-bold text-[#d4af37] transition hover:bg-white/[0.02] sm:px-6">
                    View full batting leaderboard
                  </summary>

                  <div className="overflow-x-auto border-t border-white/10">
                    <table className="w-full min-w-[650px] text-left">
                      <thead className="bg-white/[0.02]">
                        <tr className="text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                          <th className="px-5 py-3 sm:px-6">
                            Player
                          </th>
                          <th className="px-3 py-3 text-right">
                            Inns
                          </th>
                          <th className="px-3 py-3 text-right">
                            Runs
                          </th>
                          <th className="px-3 py-3 text-right">
                            Avg
                          </th>
                          <th className="px-3 py-3 text-right">
                            SR
                          </th>
                          <th className="px-5 py-3 text-right sm:px-6">
                            HS
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {battingLeaderboard.map(
                          (player) => (
                            <tr
                              key={player.player_id}
                              className="border-t border-white/10"
                            >
                              <td className="px-5 py-4 sm:px-6">
                                <Link
                                  href={`/players/${player.player_slug}?team=${team.team_id}&fromTeam=${team.team_id}`}
                                  className="font-semibold text-white transition hover:text-[#d4af37]"
                                >
                                  {player.player_name}
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
                                  player.average,
                                )}
                              </td>

                              <td className="px-3 py-4 text-right text-slate-300">
                                {formatNumber(
                                  player.strikeRate,
                                )}
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
                </details>
              )}
            </section>

            {/* BOWLING LEADERS */}
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
              <div className="border-b border-white/10 px-5 py-5 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                  Bowling
                </p>

                <h3 className="mt-1 text-xl font-black uppercase text-white">
                  Wicket Leaders
                </h3>
              </div>

              {bowlingLeader && (
                <div className="border-b border-white/10 bg-gradient-to-r from-[#d4af37]/10 to-transparent px-5 py-6 sm:px-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">
                        Leading Wicket Taker
                      </p>

                      <Link
                        href={`/players/${bowlingLeader.player_slug}?team=${team.team_id}&fromTeam=${team.team_id}`}
                        className="mt-2 block text-2xl font-black text-white transition hover:text-[#d4af37]"
                      >
                        {bowlingLeader.player_name}
                      </Link>

                      <p className="mt-2 text-sm text-slate-400">
                        {bowlingLeader.bowlingInnings} innings
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-4xl font-black text-white">
                        {bowlingLeader.wickets}
                      </p>

                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        wickets
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        Average
                      </p>

                      <p className="mt-1 font-black text-white">
                        {formatNumber(
                          bowlingLeader.average,
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        Economy
                      </p>

                      <p className="mt-1 font-black text-white">
                        {formatNumber(
                          bowlingLeader.economy,
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        Best
                      </p>

                      <p className="mt-1 font-black text-white">
                        {bowlingLeader.bestRuns !== null
                          ? `${bowlingLeader.bestWickets}/${bowlingLeader.bestRuns}`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                {topBowlers.slice(1).map((player, index) => (
                  <Link
                    key={player.player_id}
                    href={`/players/${player.player_slug}?team=${team.team_id}&fromTeam=${team.team_id}`}
                    className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-white/10 px-5 py-4 transition last:border-b-0 hover:bg-white/[0.02] sm:px-6"
                  >
                    <span className="text-sm font-black text-slate-500">
                      {index + 2}
                    </span>

                    <div>
                      <p className="font-bold text-white">
                        {player.player_name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Avg {formatNumber(player.average)} · Econ{" "}
                        {formatNumber(player.economy)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-black text-white">
                        {player.wickets}
                      </p>

                      <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
                        wickets
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              {bowlingLeaderboard.length > 5 && (
                <details className="border-t border-white/10">
                  <summary className="cursor-pointer list-none px-5 py-4 text-center text-sm font-bold text-[#d4af37] transition hover:bg-white/[0.02] sm:px-6">
                    View full bowling leaderboard
                  </summary>

                  <div className="overflow-x-auto border-t border-white/10">
                    <table className="w-full min-w-[650px] text-left">
                      <thead className="bg-white/[0.02]">
                        <tr className="text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                          <th className="px-5 py-3 sm:px-6">
                            Player
                          </th>
                          <th className="px-3 py-3 text-right">
                            Inns
                          </th>
                          <th className="px-3 py-3 text-right">
                            Wkts
                          </th>
                          <th className="px-3 py-3 text-right">
                            Avg
                          </th>
                          <th className="px-3 py-3 text-right">
                            Econ
                          </th>
                          <th className="px-5 py-3 text-right sm:px-6">
                            Best
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {bowlingLeaderboard.map(
                          (player) => (
                            <tr
                              key={player.player_id}
                              className="border-t border-white/10"
                            >
                              <td className="px-5 py-4 sm:px-6">
                                <Link
                                  href={`/players/${player.player_slug}?team=${team.team_id}&fromTeam=${team.team_id}`}
                                  className="font-semibold text-white transition hover:text-[#d4af37]"
                                >
                                  {player.player_name}
                                </Link>
                              </td>

                              <td className="px-3 py-4 text-right text-slate-300">
                                {player.bowlingInnings}
                              </td>

                              <td className="px-3 py-4 text-right font-black text-white">
                                {player.wickets}
                              </td>

                              <td className="px-3 py-4 text-right text-slate-300">
                                {formatNumber(
                                  player.average,
                                )}
                              </td>

                              <td className="px-3 py-4 text-right text-slate-300">
                                {formatNumber(
                                  player.economy,
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
                </details>
              )}
            </section>
          </div>
        </section>

        {/* SEASON JOURNEY */}
<section className="mt-8">
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4af37]">
        Season Journey
      </p>

      <h2 className="mt-1 text-2xl font-black uppercase text-white">
        Recent Matches
      </h2>
    </div>

    <Link
      href={`/matches?team=${team.team_id}`}
      className="text-sm font-bold text-[#d4af37] transition hover:text-[#e4c452]"
    >
      View all {team.team_name} matches →
    </Link>
  </div>

  <div className="mt-5 grid gap-3 lg:grid-cols-2">
    {recentMatches.map((entry) => (
      <Link
        key={`${entry.match_id}-${entry.source_match_id}`}
        href={`/matches/${entry.match_id}?fromTeam=${team.team_id}`}
        className="group rounded-2xl border border-white/10 bg-[#0b1220] p-5 transition hover:border-[#d4af37]/30 hover:bg-[#0d1626]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#d4af37]">
                {formatMatchDate(
                  entry.match?.match_date ?? null,
                )}
              </p>

              <span className="text-slate-700">
                •
              </span>

              <p className="text-[10px] text-slate-500">
                {entry.competition?.competition_name}
              </p>
            </div>

            <h3 className="mt-3 text-lg font-black text-white transition group-hover:text-[#d4af37]">
              {entry.match?.fixture_label}
            </h3>
          </div>

          {entry.result && (
            <span
              className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${getResultClasses(
                entry.result,
              )}`}
            >
              {entry.result}
            </span>
          )}
        </div>

        <div className="mt-5 flex items-end justify-between gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Score
            </p>

            <p className="mt-1 text-lg font-black text-white">
              {formatScore(
                entry.dcc_score,
                entry.dcc_wickets,
              )}

              <span className="mx-2 text-slate-700">
                –
              </span>

              {formatScore(
                entry.opponent_score,
                entry.opponent_wickets,
              )}
            </p>
          </div>

          <span className="text-xs font-semibold text-slate-500 transition group-hover:text-[#d4af37]">
            View match →
          </span>
        </div>
      </Link>
    ))}
  </div>
</section>

        {/* LEAGUE TABLE */}
        {leagueTable.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
            <div className="border-b border-white/10 px-5 py-5 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                League Standing
              </p>

              <h2 className="mt-1 text-xl font-black uppercase text-white">
                {primaryLeagueCompetition?.competition_name}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-white/[0.02]">
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-5 py-3 sm:px-6">
                      Pos
                    </th>
                    <th className="px-4 py-3">
                      Team
                    </th>
                    <th className="px-4 py-3 text-right">
                      P
                    </th>
                    <th className="px-4 py-3 text-right">
                      W
                    </th>
                    <th className="px-4 py-3 text-right">
                      T
                    </th>
                    <th className="px-4 py-3 text-right">
                      L
                    </th>
                    <th className="px-4 py-3 text-right">
                      NR
                    </th>
                    <th className="px-4 py-3 text-right">
                      Pts
                    </th>
                    <th className="px-5 py-3 text-right sm:px-6">
                      NRR
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {leagueTable.map((standing) => (
                    <tr
                      key={`${standing.competition_id}-${standing.team_name}`}
                      className={`border-t border-white/10 ${
                        standing.is_dunmurry
                          ? "bg-[#d4af37]/10"
                          : ""
                      }`}
                    >
                      <td className="px-5 py-4 font-bold text-white sm:px-6">
                        {standing.position}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={
                              standing.is_dunmurry
                                ? "font-black text-[#d4af37]"
                                : "font-semibold text-white"
                            }
                          >
                            {standing.team_name}
                          </span>

                          {standing.status && (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${getStandingStatusClasses(
                                standing.status,
                              )}`}
                            >
                              {standing.status}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right text-slate-300">
                        {standing.played}
                      </td>

                      <td className="px-4 py-4 text-right text-slate-300">
                        {standing.won}
                      </td>

                      <td className="px-4 py-4 text-right text-slate-300">
                        {standing.tied}
                      </td>

                      <td className="px-4 py-4 text-right text-slate-300">
                        {standing.lost}
                      </td>

                      <td className="px-4 py-4 text-right text-slate-300">
                        {standing.no_result}
                      </td>

                      <td className="px-4 py-4 text-right font-black text-white">
                        {standing.points}
                      </td>

                      <td className="px-5 py-4 text-right text-slate-300 sm:px-6">
                        {formatNrr(
                          standing.net_run_rate,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* PLAYERS USED */}
<section className="mt-8">
  <div className="flex items-end justify-between gap-4">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4af37]">
        Players
      </p>

      <h2 className="mt-1 text-2xl font-black uppercase text-white">
        Players Used
      </h2>
    </div>

    <p className="text-sm text-slate-400">
      <span className="font-black text-white">
        {squad.length}
      </span>{" "}
      players
    </p>
  </div>

  {/* TOP 12 BY APPEARANCES */}
  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {squad.slice(0, 12).map((player) => (
      <Link
        key={player.player_id}
        href={`/players/${player.player_slug}?team=${team.team_id}&fromTeam=${team.team_id}`}
        className="group rounded-xl border border-white/10 bg-[#0b1220] p-4 transition hover:border-[#d4af37]/30 hover:bg-[#0e1828]"
      >
        <p className="font-bold text-white transition group-hover:text-[#d4af37]">
          {player.player_name}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {player.appearances.size}{" "}
            {player.appearances.size === 1
              ? "appearance"
              : "appearances"}
          </p>

          <span className="text-xs text-slate-600 transition group-hover:text-[#d4af37]">
            →
          </span>
        </div>
      </Link>
    ))}
  </div>

  {/* REMAINING PLAYERS */}
  {squad.length > 12 && (
    <details className="mt-4">
      <summary className="cursor-pointer list-none rounded-xl border border-white/10 bg-[#0b1220] px-5 py-4 text-center text-sm font-bold text-[#d4af37] transition hover:border-[#d4af37]/30 hover:bg-[#0e1828]">
        View all {squad.length} players →
      </summary>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {squad.slice(12).map((player) => (
          <Link
            key={player.player_id}
            href={`/players/${player.player_slug}?team=${team.team_id}&fromTeam=${team.team_id}`}
            className="group rounded-xl border border-white/10 bg-[#0b1220] p-4 transition hover:border-[#d4af37]/30 hover:bg-[#0e1828]"
          >
            <p className="font-bold text-white transition group-hover:text-[#d4af37]">
              {player.player_name}
            </p>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {player.appearances.size}{" "}
                {player.appearances.size === 1
                  ? "appearance"
                  : "appearances"}
              </p>

              <span className="text-xs text-slate-600 transition group-hover:text-[#d4af37]">
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </details>
  )}
</section>
</div>
</section>
  );
}