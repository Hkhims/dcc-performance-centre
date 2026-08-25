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

  const rows = performances ?? [];

  // -------------------------
  // MATCHES
  // -------------------------

  const matches = new Set(rows.map((row) => row.source_match_id)).size;

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
    ? `${highestInnings.runs ?? 0}${highestInnings.is_not_out ? "*" : ""}`
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
    const wicketDifference = (b.wickets ?? 0) - (a.wickets ?? 0);

    if (wicketDifference !== 0) return wicketDifference;

    return (a.runs_conceded ?? 0) - (b.runs_conceded ?? 0);
  })[0];

  const bestSpell = bestSpellRow
    ? `${bestSpellRow.wickets ?? 0}/${bestSpellRow.runs_conceded ?? 0}`
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

  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-7xl">
        {/* Player header */}
        <div className="border-b border-white/10 pb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
            2026 Player Profile
          </p>

          <h1 className="mt-3 text-4xl font-black uppercase sm:text-6xl">
            {player.player_name}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {profile?.role && (
              <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-sm font-semibold text-blue-300">
                {profile.role}
              </span>
            )}

            <span className="rounded-full border border-white/10 bg-[#0b1220] px-4 py-2 text-sm text-slate-300">
              {matches} {matches === 1 ? "Match" : "Matches"}
            </span>
          </div>
        </div>

        {/* Batting */}
        <div className="py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
            Batting
          </p>

          <h2 className="mt-2 text-3xl font-black uppercase">
            2026 Batting
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-[#0b1220] p-6"
              >
                <p className="text-sm uppercase tracking-wide text-slate-400">
                  {label}
                </p>

                <p className="mt-3 text-4xl font-black text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Highest Score", highestScore],
              ["Not Outs", notOuts],
              ["50s", fifties],
              ["100s", hundreds],
              ["4s / 6s", `${fours} / ${sixes}`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-[#08101d] p-5"
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {label}
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bowling */}
        <div className="border-t border-white/10 py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
            Bowling
          </p>

          <h2 className="mt-2 text-3xl font-black uppercase">
            2026 Bowling
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Wickets", wickets],
              ["Bowling Innings", bowlInnings],
              [
                "Average",
                bowlingAverage !== null
                  ? formatNumber(bowlingAverage)
                  : "—",
              ],
              [
                "Economy",
                economy !== null ? formatNumber(economy) : "—",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-[#0b1220] p-6"
              >
                <p className="text-sm uppercase tracking-wide text-slate-400">
                  {label}
                </p>

                <p className="mt-3 text-4xl font-black text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Overs", ballsToOvers(bowlingBalls)],
              ["Maidens", maidens],
              ["Best Spell", bestSpell],
              [
                "Strike Rate",
                bowlingStrikeRate !== null
                  ? formatNumber(bowlingStrikeRate)
                  : "—",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-[#08101d] p-5"
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {label}
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Fielding */}
        <div className="border-t border-white/10 py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
            Fielding
          </p>

          <h2 className="mt-2 text-3xl font-black uppercase">
            2026 Fielding
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Catches", catches],
              ["Stumpings", stumpings],
              ["Run Outs", runOuts],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-[#0b1220] p-6"
              >
                <p className="text-sm uppercase tracking-wide text-slate-400">
                  {label}
                </p>

                <p className="mt-3 text-4xl font-black text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}