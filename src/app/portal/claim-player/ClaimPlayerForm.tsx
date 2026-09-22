"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Player = {
  player_id: string;
  player_name: string;
};

export default function ClaimPlayerForm({
  players,
}: {
  players: Player[];
}) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return players;
    }

    return players.filter((player) =>
      player.player_name.toLowerCase().includes(query),
    );
  }, [players, search]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!selectedPlayerId) {
      setErrorMessage("Please select your DCC player profile.");
      return;
    }

    setSubmitting(true);

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "create_player_profile_claim",
      {
        target_player_id: selectedPlayerId,
      },
    );

    if (error) {
      setErrorMessage(
        "We couldn't submit your player-profile claim. Please refresh the page and try again.",
      );
      setSubmitting(false);
      return;
    }

    router.push("/portal");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      <label
        htmlFor="player-search"
        className="block text-sm font-medium text-zinc-200"
      >
        Find your player profile
      </label>

      <input
        id="player-search"
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setSelectedPlayerId("");
        }}
        placeholder="Search by player name"
        autoComplete="off"
        className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/70"
      />

      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-white/10 p-2">
        {filteredPlayers.length ? (
          filteredPlayers.map((player) => (
            <label
              key={player.player_id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                selectedPlayerId === player.player_id
                  ? "border-amber-400/60 bg-amber-400/10"
                  : "border-transparent hover:bg-white/5"
              }`}
            >
              <input
                type="radio"
                name="player-profile"
                value={player.player_id}
                checked={selectedPlayerId === player.player_id}
                onChange={() =>
                  setSelectedPlayerId(player.player_id)
                }
                className="accent-amber-400"
              />

              <span className="font-medium text-zinc-100">
                {player.player_name}
              </span>
            </label>
          ))
        ) : (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">
            No matching DCC player profile found.
          </p>
        )}
      </div>

      <p className="mt-4 text-sm leading-6 text-zinc-500">
        Select only your own player profile. Your request will be
        reviewed by a DCC administrator before the profile is linked
        to your account.
      </p>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
        >
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !selectedPlayerId}
        className="mt-6 w-full rounded-xl bg-amber-400 px-5 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? "Submitting claim…"
          : "Submit player-profile claim"}
      </button>
    </form>
  );
}
