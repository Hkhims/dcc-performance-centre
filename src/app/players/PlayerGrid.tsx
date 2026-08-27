"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Player = {
  player_id: string;
  player_name: string;
  player_slug: string | null;
  active: boolean;
};

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function PlayerGrid({
  players,
}: {
  players: Player[];
}) {
  const [search, setSearch] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("ALL");

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return players.filter((player) => {
      const matchesSearch =
        !query ||
        player.player_name
          .toLowerCase()
          .includes(query);

      const matchesLetter =
        selectedLetter === "ALL" ||
        player.player_name
          .trim()
          .toUpperCase()
          .startsWith(selectedLetter);

      return matchesSearch && matchesLetter;
    });
  }, [players, search, selectedLetter]);

  const availableLetters = useMemo(() => {
    return new Set(
      players
        .map((player) =>
          player.player_name
            .trim()
            .charAt(0)
            .toUpperCase(),
        )
        .filter(Boolean),
    );
  }, [players]);

  return (
    <>
      {/* SEARCH + PLAYER COUNT */}
      <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <input
          type="search"
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Search players..."
          className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-5 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-[#d4af37]/60 lg:max-w-md"
        />

        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          <span className="font-black text-white">
            {filteredPlayers.length}
          </span>{" "}
          of{" "}
          <span className="font-black text-white">
            {players.length}
          </span>{" "}
          players
        </p>
      </div>

      {/* A–Z QUICK FILTER */}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedLetter("ALL")}
          className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] transition ${
            selectedLetter === "ALL"
              ? "border-[#d4af37]/40 bg-[#d4af37]/10 text-[#d4af37]"
              : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
          }`}
        >
          All
        </button>

        {alphabet.map((letter) => {
          const isAvailable =
            availableLetters.has(letter);

          const isActive =
            selectedLetter === letter;

          return (
            <button
              key={letter}
              type="button"
              disabled={!isAvailable}
              onClick={() =>
                setSelectedLetter(letter)
              }
              className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] transition ${
                isActive
                  ? "border-[#d4af37]/40 bg-[#d4af37]/10 text-[#d4af37]"
                  : isAvailable
                    ? "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                    : "cursor-not-allowed border-white/5 text-slate-700"
              }`}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {/* PLAYER GRID */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredPlayers.map((player) => {
          const href = player.player_slug
            ? `/players/${player.player_slug}`
            : "#";

          const initials = player.player_name
            .split(" ")
            .filter(Boolean)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <Link
              key={player.player_id}
              href={href}
              title={player.player_name}
              aria-label={`View ${player.player_name}`}
              className={`group rounded-xl border border-white/10 bg-[#0b1220] p-5 transition ${
                player.player_slug
                  ? "hover:border-[#d4af37]/40 hover:bg-[#0d1626]"
                  : "pointer-events-none opacity-60"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#111a2a] text-sm font-black text-[#d4af37]">
                  {initials}
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

      {/* EMPTY STATE */}
      {filteredPlayers.length === 0 && (
        <div className="mt-8 rounded-xl border border-white/10 bg-[#0b1220] p-8 text-center">
          <p className="font-semibold text-white">
            No players found
          </p>

          <p className="mt-2 text-sm text-slate-400">
            Try changing the search term or
            selecting a different letter.
          </p>
        </div>
      )}
    </>
  );
}