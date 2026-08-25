import { supabase } from "@/lib/supabase";
import PlayerGrid from "./PlayerGrid";

export default async function PlayersPage() {
  const { data: players, error } = await supabase
    .from("players")
    .select("player_id, player_name, player_slug, active")
    .order("player_name", { ascending: true });

  if (error) {
    return (
      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
            2026 Season
          </p>

          <h1 className="mt-2 text-4xl font-black uppercase sm:text-5xl">
            Players
          </h1>

          <div className="mt-10 rounded-xl border border-red-500/30 bg-red-950/20 p-6">
            <p className="font-bold text-red-400">
              Unable to load players
            </p>

            <p className="mt-2 text-sm text-slate-300">
              {error.message}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
          2026 Season
        </p>

        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-black uppercase sm:text-5xl">
              Players
            </h1>

            <p className="mt-4 max-w-2xl text-slate-400">
              Explore Dunmurry Cricket Club players and their performances
              across the 2026 season.
            </p>
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            {players?.length ?? 0} Players
          </p>
        </div>

        <PlayerGrid players={players ?? []} />
      </div>
    </section>
  );
}