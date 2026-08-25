import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

function formatNumber(value: number, decimals = 2) {
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

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ player_slug: string }>;
}) {
  const { player_slug } = await params;

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("player_id, player_name, player_slug")
    .eq("player_slug", player_slug)
    .single();

  if (playerError || !player) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("player_profiles")
    .select("role")
    .eq("player_id", player.player_id)
    .maybeSingle();

  const { data: performances, error: performanceError } = await supabase
    .from("player_match_performances")
    .select(`
      source_match_id,
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
    .eq("player_id", player.player_id);

  if (performanceError) {
    throw new Error(performanceError.message);
  }

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("team_id, team_name, display_order")
    .order("display_order", { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const rows = performances ?? [];

  // -------------------------
  // MATCHES
  // -------------------------

  const matches = new Set(
    rows.map((row) => row.source_match_id),
  ).size;

  // -------------------------
  // TEAM APPEARANCES
  // -------------------------

  const teamAppearances =
    teams
      ?.map((team) => {
        const appearances = new Set(
          rows
            .filter((row) => row.team_id === team.team_id)
            .map((row) => row.source_match_id),
        ).size;

        return {
          team_id: team.team_id,
          team_name: team.team_name,
          appearances,
        };
      })
      .filter((team) => team.appearances > 0) ?? [];

  // -------------------------
  // BATTING
  // -------------------------

  const battingInnings = rows.filter((row) => row.batted);

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

  const battingStrikeRate =
    ballsFaced > 0 ? (runs / ballsFaced) * 100 : null;

  const fifties = battingInnings.filter(
    (row) => (row.runs ?? 0) >= 50 && (row.runs ?? 0) < 100,
  ).length;

  const hundreds = battingInnings.filter(
    (row) => (row.runs ?? 0) >= 100,
  ).length;

  const fours = battingInnings.reduce(
    (total, row) => total + (row.fours ?? 0),
    0,
  );

  const sixes = battingInnings.reduce(
    (total, row) => total + (row.sixes ?? 0),
    0,
  );

  const highestInnings = [...battingInnings].sort((a, b) => {
    const runDifference = (b.runs ?? 0) - (a.runs ?? 0);

    if (runDifference !== 0) return runDifference;

    if (b.is_not_out && !a.is_not_out) return 1;
    if (a.is_not_out && !b.is_not_out) return -1;

    return 0;
  })[0];

  const highestScore = highestInnings
    ? `${highestInnings.runs ?? 0}${
        highestInnings.is_not_out ? "*" : ""
      }`
    : "—";

  // -------------------------
  // BOWLING
  // -------------------------

  const bowlingInnings = rows.filter((row) => row.bowled);

  const bowlInnings = bowlingInnings.length;

  const bowlingBalls = bowlingInnings.reduce(
    (total, row) => total + (row.bowling_balls ?? 0),
    0,
  );

  const runsConceded = bowlingInnings.reduce(
    (total, row) => total + (row.runs_conceded ?? 0),
    0,
  );

  const wickets = bowlingInnings.reduce(
    (total, row) => total + (row.wickets ?? 0),
    0,
  );

  const maidens = bowlingInnings.reduce(
    (total, row) => total + (row.maidens ?? 0),
    0,
  );

  const bowlingAverage =
    wickets > 0 ? runsConceded / wickets : null;

  const economy =
    bowlingBalls > 0 ? runsConceded / (bowlingBalls / 6) : null;

  const bowlingStrikeRate =
    wickets > 0 ? bowlingBalls / wickets : null;

  const bestSpellRow = [...bowlingInnings].sort((a, b) => {
    const wicketDifference =
      (b.wickets ?? 0) - (a.wickets ?? 0);

    if (wicketDifference !== 0) return wicketDifference;

    return (a.runs_conceded ?? 0) - (b.runs_conceded ?? 0);
  })[0];

  const bestSpell = bestSpellRow
    ? `${bestSpellRow.wickets ?? 0}/${
        bestSpellRow.runs_conceded ?? 0
      }`
    : "—";

  // -------------------------
  // FIELDING
  // -------------------------

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

  const initials = getInitials(player.player_name);

  return (
    <section className="px-4 py-8 sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        {/* Back */}
        <Link
          href="/players"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to players
        </Link>

        {/* Profile Hero */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#101d32] via-[#0c1728] to-[#08111f]">
          <div className="grid min-h-[280px] md:grid-cols-[260px_1fr] lg:grid-cols-[290px_1fr]">
            {/* Portrait / future player photo area */}
            <div className="relative flex min-h-[210px] items-center justify-center border-b border-white/10 bg-white/[0.02] md:min-h-0 md:border-b-0 md:border-r">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.08),transparent_65%)]" />

              <div className="relative flex h-36 w-36 items-center justify-center rounded-full border border-[#d4af37]/40 bg-[#101827] shadow-2xl sm:h-40 sm:w-40">
                <span className="text-5xl font-black tracking-tight text-[#d4af37] sm:text-6xl">
                  {initials}
                </span>
              </div>
            </div>

            {/* Player identity */}
            <div className="flex items-center px-6 py-7 sm:px-8 lg:px-10">
              <div className="w-full">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
                  2026 Player Profile
                </p>

                <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl lg:text-4xl">
                  {player.player_name}
                </h1>

                {profile?.role && (
                  <p className="mt-2 text-sm font-medium text-blue-300">
                    {profile.role}
                  </p>
                )}

                {teamAppearances.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {teamAppearances.map((team) => (
                      <div
                        key={team.team_id}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#d4af37]/25 bg-[#d4af37]/5 px-3 py-2"
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#d4af37]">
                          {team.team_name}
                        </span>

                        <span className="rounded bg-white/5 px-2 py-0.5 text-xs font-bold text-white">
                          {team.appearances}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5 flex items-center gap-2 text-sm text-slate-400">
                  <span className="text-lg font-bold text-white">
                    {matches}
                  </span>
                  <span>{matches === 1 ? "match" : "matches"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {/* Batting */}
          <section className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                Batting
              </p>

              <h2 className="mt-1 text-lg font-black uppercase text-white">
                2026 Batting
              </h2>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {[
                ["Runs", runs],
                ["Innings", innings],
                [
                  "Average",
                  battingAverage !== null
                    ? formatNumber(battingAverage)
                    : "—",
                ],
                [
                  "Strike Rate",
                  battingStrikeRate !== null
                    ? formatNumber(battingStrikeRate)
                    : "—",
                ],
                ["Highest", highestScore],
                ["Not Outs", notOuts],
                ["50s / 100s", `${fifties} / ${hundreds}`],
                ["4s / 6s", `${fours} / ${sixes}`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-[#0e1727] p-4"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                    {label}
                  </p>

                  <p className="mt-2 text-xl font-black text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Bowling */}
          <section className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                Bowling
              </p>

              <h2 className="mt-1 text-lg font-black uppercase text-white">
                2026 Bowling
              </h2>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {[
                ["Wickets", wickets],
                ["Innings", bowlInnings],
                ["Overs", ballsToOvers(bowlingBalls)],
                [
                  "Average",
                  bowlingAverage !== null
                    ? formatNumber(bowlingAverage)
                    : "—",
                ],
                [
                  "Economy",
                  economy !== null
                    ? formatNumber(economy)
                    : "—",
                ],
                [
                  "Strike Rate",
                  bowlingStrikeRate !== null
                    ? formatNumber(bowlingStrikeRate)
                    : "—",
                ],
                ["Best Spell", bestSpell],
                ["Maidens", maidens],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-[#0e1727] p-4"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                    {label}
                  </p>

                  <p className="mt-2 text-xl font-black text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Fielding */}
          <section className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
                Fielding
              </p>

              <h2 className="mt-1 text-lg font-black uppercase text-white">
                2026 Fielding
              </h2>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
              {[
                ["Catches", catches],
                ["Stumpings", stumpings],
                ["Run Outs", runOuts],
                ["Total", catches + stumpings + runOuts],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-[#0e1727] p-4"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                    {label}
                  </p>

                  <p className="mt-2 text-xl font-black text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}