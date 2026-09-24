"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addPlayerToTeam,
  removePlayerFromTeam,
} from "./actions";

type Player = {
  player_id: string;
  player_name: string;
};

type TeamMember = {
  player_id: string;
  player_name: string;
};

type TeamMembershipManagerProps = {
  teamId: string;
  teamName: string;
  players: Player[];
  members: TeamMember[];
};

export default function TeamMembershipManager({
  teamId,
  teamName,
  players,
  members,
}: TeamMembershipManagerProps) {
  const [selectedPlayerId, setSelectedPlayerId] =
    useState("");
  const [message, setMessage] = useState<string | null>(
    null,
  );
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const memberIds = useMemo(
    () => new Set(members.map((member) => member.player_id)),
    [members],
  );

  const availablePlayers = useMemo(
    () =>
      players
        .filter(
          (player) => !memberIds.has(player.player_id),
        )
        .sort((a, b) =>
          a.player_name.localeCompare(b.player_name),
        ),
    [players, memberIds],
  );

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        a.player_name.localeCompare(b.player_name),
      ),
    [members],
  );

  function handleAddPlayer() {
    if (!selectedPlayerId || isPending) {
      return;
    }

    setMessage(null);
    setIsError(false);

    startTransition(async () => {
      const result = await addPlayerToTeam(
        teamId,
        selectedPlayerId,
      );

      setMessage(result.message);
      setIsError(!result.ok);

      if (result.ok) {
        setSelectedPlayerId("");
      }
    });
  }

  function handleRemovePlayer(
    playerId: string,
    playerName: string,
  ) {
    if (isPending) {
      return;
    }

    const confirmed = window.confirm(
      `Remove ${playerName} from ${teamName}?`,
    );

    if (!confirmed) {
      return;
    }

    setMessage(null);
    setIsError(false);

    startTransition(async () => {
      const result = await removePlayerFromTeam(
        teamId,
        playerId,
      );

      setMessage(result.message);
      setIsError(!result.ok);
    });
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={selectedPlayerId}
          onChange={(event) =>
            setSelectedPlayerId(event.target.value)
          }
          disabled={
            isPending || availablePlayers.length === 0
          }
          className="min-h-11 flex-1 rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">
            {availablePlayers.length > 0
              ? "Select a player"
              : "All active players are already added"}
          </option>

          {availablePlayers.map((player) => (
            <option
              key={player.player_id}
              value={player.player_id}
            >
              {player.player_name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleAddPlayer}
          disabled={!selectedPlayerId || isPending}
          className="min-h-11 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-5 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Updating..." : "Add Player"}
        </button>
      </div>

      {message ? (
        <p
          className={`mt-3 text-sm ${
            isError
              ? "text-red-300"
              : "text-emerald-300"
          }`}
        >
          {message}
        </p>
      ) : null}

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-white">
            Current Players
          </p>

          <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-zinc-400">
            {sortedMembers.length}{" "}
            {sortedMembers.length === 1
              ? "player"
              : "players"}
          </span>
        </div>

        {sortedMembers.length > 0 ? (
          <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
            {sortedMembers.map((member) => (
              <div
                key={member.player_id}
                className="flex items-center justify-between gap-4 bg-black/10 px-4 py-3"
              >
                <p className="text-sm font-medium text-zinc-200">
                  {member.player_name}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    handleRemovePlayer(
                      member.player_id,
                      member.player_name,
                    )
                  }
                  disabled={isPending}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 p-5">
            <p className="text-sm text-zinc-500">
              No players have been added to{" "}
              {teamName} yet.
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        Team membership controls the normal player group used
        when opening availability. It does not prevent a player
        outside this group from being selected for a match.
      </p>
    </div>
  );
}