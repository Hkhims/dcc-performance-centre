
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
    </main>
  );
}