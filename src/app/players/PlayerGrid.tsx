"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Player = {
  player_id: string;
  player_name: string;
  player_slug: string | null;
  active: boolean;
};

export default function PlayerGrid({
  players,
}: {
  players: Player[];
}) {
  const [search, setSearch] = useState("");

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return players;

    return players.filter((player) =>
      player.player_name.toLowerCase().includes(query),
    );
  }, [players, search]);

  return (
    <>
      <div className="mt-10">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search players..."
          className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-5 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-[#d4af37]/60 sm:max-w-md"
        />
      </div>

      <p className="mt-5 text-sm text-slate-500">
        Showing {filteredPlayers.length} of {players.length} players
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredPlayers.map((player) => {
          const href = player.player_slug
            ? `/players/${player.player_slug}`
            : "#";

          return (
            <Link
              key={player.player_id}
              href={href}
              className={`group rounded-xl border border-white/10 bg-[#0b1220] p-5 transition ${
                player.player_slug
                  ? "hover:border-[#d4af37]/40 hover:bg-[#0d1626]"
                  : "pointer-events-none opacity-60"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#111a2a] text-sm font-black text-[#d4af37]">
                  {player.player_name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-white">
                    {player.player_name}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {filteredPlayers.length === 0 && (
        <div className="mt-8 rounded-xl border border-white/10 bg-[#0b1220] p-8 text-center">
          <p className="text-slate-400">
            No players found for “{search}”.
          </p>
        </div>
      )}
    </>
  );
}