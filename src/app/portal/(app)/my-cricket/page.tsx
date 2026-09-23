
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PortalAccess = {
  player_id: string | null;
  account_status: "Invited" | "Active" | "Disabled";
};

function formatAverage(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}

export default async function MyCricketPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_my_portal_access",
  );

  if (error) {
    throw new Error(
      `Unable to load player access: ${error.message}`,
    );
  }

  const access = (data?.[0] ?? null) as PortalAccess | null;

  if (
    !access ||
    access.account_status !== "Active" ||
    !access.player_id
  ) {
    redirect("/portal");
  }

  const { data: player, error: playerError } =
    await supabase
      .from("players")
      .select("player_id, player_name, player_slug")
      .eq("player_id", access.player_id)
      .single();

  if (playerError || !player) {
    throw new Error(
      playerError?.message ??
        "Your verified player profile could not be found.",
    );
  }

  const { data: performances, error: performanceError } =
    await supabase
      .from("player_match_performances")
      .select(`
        source_match_id,
        team_id,
        batted,
        runs,
        balls_faced,
        fours,
        sixes,
        is_not_out,
        bowled,
        bowling_balls,
        runs_conceded,
        wickets,
        catches,
        stumpings,
        run_outs
      `)
      .eq("player_id", access.player_id);

  if (performanceError) {
    throw new Error(performanceError.message);
  }

  const rows = performances ?? [];
  const { data: teams, error: teamsError } = await supabase
  .from("teams")
  .select("team_id, team_name, display_order")
  .order("display_order", { ascending: true });

if (teamsError) {
  throw new Error(
    `Unable to load DCC teams: ${teamsError.message}`,
  );
}

const teamAppearances = (teams ?? [])
  .map((team) => ({
    team_id: team.team_id,
    team_name: team.team_name,
    appearances: new Set(
      rows
        .filter((row) => row.team_id === team.team_id)
        .map((row) => row.source_match_id),
    ).size,
  }))
  .filter((team) => team.appearances > 0);
  // Match history: retrieve the matches this player represented DCC in.
  const sourceMatchIds = [
    ...new Set(
      rows
        .map((row) => row.source_match_id)
        .filter(Boolean),
    ),
  ];

  const { data: matchEntries, error: matchEntriesError } =
    sourceMatchIds.length > 0
      ? await supabase
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
          `)
          .in("source_match_id", sourceMatchIds)
      : { data: [], error: null };

  if (matchEntriesError) {
    throw new Error(
      `Unable to load match history: ${matchEntriesError.message}`,
    );
  }

  const relevantMatchEntries = (matchEntries ?? []).filter(
    (entry) =>
      rows.some(
        (row) =>
          row.source_match_id === entry.source_match_id &&
          row.team_id === entry.team_id,
      ),
  );
    const matchIds = [
    ...new Set(
      relevantMatchEntries
        .map((entry) => entry.match_id)
        .filter(Boolean),
    ),
  ];

  const competitionIds = [
    ...new Set(
      relevantMatchEntries
        .map((entry) => entry.competition_id)
        .filter(Boolean),
    ),
  ];

  const { data: matchDates, error: matchDatesError } =
    matchIds.length > 0
      ? await supabase
          .from("matches")
          .select("match_id, match_date")
          .in("match_id", matchIds)
      : { data: [], error: null };

  if (matchDatesError) {
    throw new Error(
      `Unable to load match dates: ${matchDatesError.message}`,
    );
  }

  const { data: competitions, error: competitionsError } =
    competitionIds.length > 0
      ? await supabase
          .from("competitions")
          .select("competition_id, competition_name")
          .in("competition_id", competitionIds)
      : { data: [], error: null };

  if (competitionsError) {
    throw new Error(
      `Unable to load competitions: ${competitionsError.message}`,
    );
  }
  const teamNameMap = new Map(
    (teams ?? []).map((team) => [
      team.team_id,
      team.team_name,
    ]),
  );

  const matchDateMap = new Map(
    (matchDates ?? []).map((match) => [
      match.match_id,
      match.match_date,
    ]),
  );

  const competitionNameMap = new Map(
    (competitions ?? []).map((competition) => [
      competition.competition_id,
      competition.competition_name,
    ]),
  );

  const matchEntryMap = new Map(
    relevantMatchEntries.map((entry) => [
      `${entry.source_match_id}__${entry.team_id}`,
      entry,
    ]),
  );

  const matchHistory = rows
    .map((performance) => {
      const matchEntry = matchEntryMap.get(
        `${performance.source_match_id}__${performance.team_id}`,
      );

      if (!matchEntry) {
        return null;
      }

      return {
        ...performance,
        match_id: matchEntry.match_id,
        match_date:
          matchDateMap.get(matchEntry.match_id) ?? null,
        team_name:
          teamNameMap.get(performance.team_id) ??
          performance.team_id,
        competition_name:
          competitionNameMap.get(
            matchEntry.competition_id,
          ) ?? "Competition",
        opponent: matchEntry.opponent_display_name,
        result: matchEntry.result,
        dcc_score: matchEntry.dcc_score,
        dcc_wickets: matchEntry.dcc_wickets,
        opponent_score: matchEntry.opponent_score,
        opponent_wickets: matchEntry.opponent_wickets,
      };
    })
    .filter((match) => match !== null)
    .sort((a, b) => {
      const dateA = a.match_date ?? "";
      const dateB = b.match_date ?? "";

      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }

      return b.source_match_id.localeCompare(
        a.source_match_id,
      );
    });

  const matches = new Set(
    rows.map((row) => row.source_match_id),
  ).size;

  const battingInnings = rows.filter((row) => row.batted);
  const bowlingInnings = rows.filter((row) => row.bowled);

  const innings = battingInnings.length;

  const runs = battingInnings.reduce(
    (total, row) => total + (row.runs ?? 0),
    0,
  );

  const ballsFaced = battingInnings.reduce(
    (total, row) => total + (row.balls_faced ?? 0),
    0,
  );

  const notOuts = battingInnings.filter(
    (row) => row.is_not_out === true,
  ).length;

  const dismissals = innings - notOuts;

  const battingAverage =
    dismissals > 0 ? runs / dismissals : null;

  const strikeRate =
    ballsFaced > 0 ? (runs / ballsFaced) * 100 : null;

  const highestInnings = [...battingInnings].sort(
    (a, b) =>
      (b.runs ?? 0) - (a.runs ?? 0) ||
      Number(Boolean(b.is_not_out)) -
        Number(Boolean(a.is_not_out)),
  )[0];

  const highestScore = highestInnings
    ? `${highestInnings.runs ?? 0}${
        highestInnings.is_not_out ? "*" : ""
      }`
    : "—";

  const fifties = battingInnings.filter(
    (row) =>
      (row.runs ?? 0) >= 50 &&
      (row.runs ?? 0) < 100,
  ).length;

  const hundreds = battingInnings.filter(
    (row) => (row.runs ?? 0) >= 100,
  ).length;

  const wickets = bowlingInnings.reduce(
    (total, row) => total + (row.wickets ?? 0),
    0,
  );

  const runsConceded = bowlingInnings.reduce(
    (total, row) => total + (row.runs_conceded ?? 0),
    0,
  );

  const bowlingBalls = bowlingInnings.reduce(
    (total, row) => total + (row.bowling_balls ?? 0),
    0,
  );

  const bowlingAverage =
    wickets > 0 ? runsConceded / wickets : null;

  const economy =
    bowlingBalls > 0
      ? runsConceded / (bowlingBalls / 6)
      : null;

  const catches = rows.reduce(
    (total, row) => total + (row.catches ?? 0),
    0,
  );

  const stumpings = rows.reduce(
    (total, row) => total + (row.stumpings ?? 0),
    0,
  );

  const runOuts = rows.reduce(
    (total, row) => total + (row.run_outs ?? 0),
    0,
  );

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
        Dunmurry Cricket Club
      </p>

      <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
        My Cricket
      </h1>

      <section className="mt-8 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#17243a] to-[#0b0e16] p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
          My player profile
        </p>

        <h2 className="mt-3 text-3xl font-black text-white">
          {player.player_name}
        </h2>

        <p className="mt-3 text-zinc-400">
          Your verified DCC player profile
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold">
            {matches} {matches === 1 ? "match" : "matches"}
          </span>

          <Link
            href={`/players/${player.player_slug}`}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-300"
          >
            View public profile
          </Link>
        </div>
      </section>
      {teamAppearances.length > 0 && (
  <section className="mt-10">
    <h2 className="text-2xl font-bold text-white">
      My Teams
    </h2>

    <p className="mt-2 text-sm text-zinc-400">
      Your appearances for each DCC team in 2026.
    </p>

    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {teamAppearances.map((team) => (
        <div
          key={team.team_id}
          className="rounded-xl border border-white/10 bg-white/[0.035] p-5"
        >
          <p className="text-sm font-semibold text-amber-400">
            {team.team_name}
          </p>

          <p className="mt-3 text-3xl font-black text-white">
            {team.appearances}
          </p>

          <p className="mt-1 text-xs text-zinc-400">
            {team.appearances === 1
              ? "appearance"
              : "appearances"}
          </p>
        </div>
      ))}
    </div>
  </section>
)}
      <section className="mt-10">
        <h2 className="text-2xl font-bold text-white">
          2026 Batting
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Runs" value={runs} />
          <StatCard label="Innings" value={innings} />
          <StatCard
            label="Average"
            value={formatAverage(battingAverage)}
          />
          <StatCard
            label="Strike rate"
            value={formatAverage(strikeRate)}
          />
          <StatCard label="Highest" value={highestScore} />
          <StatCard label="Not outs" value={notOuts} />
          <StatCard label="50s" value={fifties} />
          <StatCard label="100s" value={hundreds} />
        </div>
      </section>

      {bowlingInnings.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-white">
            2026 Bowling
          </h2>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Wickets" value={wickets} />
            <StatCard
              label="Average"
              value={formatAverage(bowlingAverage)}
            />
            <StatCard
              label="Economy"
              value={formatAverage(economy)}
            />
            <StatCard
              label="Overs"
              value={`${Math.floor(bowlingBalls / 6)}.${
                bowlingBalls % 6
              }`}
            />
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-2xl font-bold text-white">
          2026 Fielding
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Catches" value={catches} />
          <StatCard label="Stumpings" value={stumpings} />
          <StatCard label="Run outs" value={runOuts} />
          <StatCard
            label="Total"
            value={catches + stumpings + runOuts}
          />
        </div>
      </section>
      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
              2026 Season
            </p>
            <h2 className="mt-2 text-2xl font-bold text-white">
              Match History
            </h2>
          </div>

          <p className="text-sm text-zinc-400">
            {matchHistory.length}{" "}
            {matchHistory.length === 1
              ? "appearance"
              : "appearances"}
          </p>
        </div>

        {matchHistory.length === 0 ? (
          <p className="mt-5 rounded-xl border border-white/10 p-6 text-zinc-400">
            No match history is available yet.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {matchHistory.map((match) => (
              <Link
                key={`${match.source_match_id}-${match.team_id}`}
                href={`/matches/${match.match_id}?fromMyCricket=1`}
                className="block rounded-xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-amber-400/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                      {match.match_date
                        ? new Intl.DateTimeFormat("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          }).format(
                            new Date(
                              `${match.match_date}T00:00:00Z`,
                            ),
                          )
                        : "Date unavailable"}
                    </p>

                    <h3 className="mt-2 text-lg font-bold text-white">
                      {match.team_name} vs {match.opponent}
                    </h3>

                    <p className="mt-1 text-sm text-zinc-400">
                      {match.competition_name}
                    </p>
                  </div>

                  {match.result && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold">
                      {match.result}
                    </span>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {match.batted && (
                    <div className="rounded-lg bg-white/5 px-4 py-3">
                      <p className="text-xs text-zinc-400">
                        Batting
                      </p>
                      <p className="mt-1 text-lg font-bold">
                        {match.runs ?? 0}
                        {match.is_not_out ? "*" : ""}
                        {match.balls_faced !== null && (
                          <span className="ml-2 text-sm text-zinc-400">
                            ({match.balls_faced})
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {match.bowled && (
                    <div className="rounded-lg bg-white/5 px-4 py-3">
                      <p className="text-xs text-zinc-400">
                        Bowling
                      </p>
                      <p className="mt-1 text-lg font-bold">
                        {match.wickets ?? 0}/
                        {match.runs_conceded ?? 0}
                      </p>
                    </div>
                  )}

                  {(match.catches ?? 0) +
                    (match.stumpings ?? 0) +
                    (match.run_outs ?? 0) >
                    0 && (
                    <div className="rounded-lg bg-white/5 px-4 py-3">
                      <p className="text-xs text-zinc-400">
                        Fielding
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {[
                          (match.catches ?? 0) > 0
                            ? `${match.catches} catches`
                            : null,
                          (match.stumpings ?? 0) > 0
                            ? `${match.stumpings} stumpings`
                            : null,
                          (match.run_outs ?? 0) > 0
                            ? `${match.run_outs} run outs`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  )}
                </div>

                <p className="mt-5 text-sm font-semibold text-amber-400">
                  View full scorecard →
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}