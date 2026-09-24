"use client";

import { useState, useTransition } from "react";
import {
  addPlayerToSelection,
  createMatchSelection,
  publishMatchSelection,
  removePlayerFromSelection,
  reopenMatchSelection,
  setSelectionBattingPosition,
  setSelectionCaptain,
  setSelectionWicketkeeper,
} from "./actions";

type Player = {
  player_id: string;
  player_name: string;
};

type SelectedPlayer = Player & {
  batting_position: number | null;
  is_captain: boolean;
  is_wicketkeeper: boolean;
};

type AvailabilityStatus =
  | "Available"
  | "Unavailable"
  | "Not Responded"
  | null;

type PlayerAvailability = {
  player_id: string;
  status: AvailabilityStatus;
};

type TeamSelectionManagerProps = {
  matchId: string;
  teamId: string;
  teamName: string;
  selectionId: number | null;
  selectionStatus: "Draft" | "Published" | null;
  players: Player[];
  selectedPlayers: SelectedPlayer[];
  availability: PlayerAvailability[];
};

type ActionResult = {
  ok: boolean;
  message: string;
};

function availabilityClasses(status: AvailabilityStatus) {
  if (status === "Available") {
    return "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300";
  }

  if (status === "Unavailable") {
    return "border-red-400/20 bg-red-400/[0.08] text-red-300";
  }

  if (status === "Not Responded") {
    return "border-amber-400/20 bg-amber-400/[0.08] text-amber-300";
  }

  return "border-white/10 bg-white/[0.04] text-zinc-500";
}

function availabilityLabel(status: AvailabilityStatus) {
  return status ?? "No Poll";
}

export default function TeamSelectionManager({
  matchId,
  teamId,
  teamName,
  selectionId,
  selectionStatus,
  players,
  selectedPlayers,
  availability,
}: TeamSelectionManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(true);
  const [playerSearch, setPlayerSearch] = useState("");

  const availabilityByPlayerId = new Map(
    availability.map((entry) => [
      entry.player_id,
      entry.status,
    ]),
  );

  const selectedPlayerIds = new Set(
    selectedPlayers.map((player) => player.player_id),
  );

  const orderedSelectedPlayers = [...selectedPlayers].sort(
    (a, b) => {
      if (
        a.batting_position !== null &&
        b.batting_position !== null
      ) {
        return a.batting_position - b.batting_position;
      }

      if (a.batting_position !== null) {
        return -1;
      }

      if (b.batting_position !== null) {
        return 1;
      }

      return a.player_name.localeCompare(b.player_name);
    },
  );

  const availableToAdd = players
    .filter((player) => !selectedPlayerIds.has(player.player_id))
    .filter((player) =>
      player.player_name
        .toLowerCase()
        .includes(playerSearch.trim().toLowerCase()),
    );

  function runAction(
    action: () => Promise<ActionResult>,
  ) {
    setMessage(null);

    startTransition(async () => {
      const result = await action();

      setMessageOk(result.ok);
      setMessage(result.message);
    });
  }

  if (!selectionId || !selectionStatus) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
          Team Selection
        </p>

        <h2 className="mt-2 text-2xl font-bold">
          Build the team for {teamName}
        </h2>

        <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
          Start a draft selection for this fixture. Availability
          can help inform your choices, but it does not control who
          may be selected.
        </p>

        {message ? (
          <p
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              messageOk
                ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
                : "border-red-400/20 bg-red-400/[0.08] text-red-300"
            }`}
          >
            {message}
          </p>
        ) : null}

        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            runAction(() =>
              createMatchSelection(matchId, teamId),
            )
          }
          className="mt-6 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Starting…" : "Start Team Selection"}
        </button>
      </section>
    );
  }

  const isDraft = selectionStatus === "Draft";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
              Team Selection
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {teamName}
            </h2>

            <p className="mt-3 text-zinc-400">
              {selectedPlayers.length}{" "}
              {selectedPlayers.length === 1
                ? "player"
                : "players"}{" "}
              selected.
            </p>
          </div>

          <span
            className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${
              isDraft
                ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-300"
                : "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
            }`}
          >
            {selectionStatus}
          </span>
        </div>

        {message ? (
          <p
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              messageOk
                ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
                : "border-red-400/20 bg-red-400/[0.08] text-red-300"
            }`}
          >
            {message}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Selected Players
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {isDraft ? "Build the team" : "Published team"}
            </h2>
          </div>

          {isDraft ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                runAction(() =>
                  publishMatchSelection(
                    matchId,
                    selectionId,
                  ),
                )
              }
              className="w-fit rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Working…" : "Publish Selection"}
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                runAction(() =>
                  reopenMatchSelection(
                    matchId,
                    selectionId,
                  ),
                )
              }
              className="w-fit rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-5 py-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Working…" : "Return to Draft"}
            </button>
          )}
        </div>

        {orderedSelectedPlayers.length > 0 ? (
          <div className="mt-6 space-y-3">
            {orderedSelectedPlayers.map((player) => {
              const availabilityStatus =
                availabilityByPlayerId.get(player.player_id) ??
                null;

              return (
                <article
                  key={player.player_id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">
                          {player.player_name}
                        </p>

                        {player.is_captain ? (
                          <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                            Captain
                          </span>
                        ) : null}

                        {player.is_wicketkeeper ? (
                          <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-xs font-semibold text-sky-300">
                            WK
                          </span>
                        ) : null}

                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${availabilityClasses(
                            availabilityStatus,
                          )}`}
                        >
                          {availabilityLabel(
                            availabilityStatus,
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-zinc-500">
                        Bat
                        <select
                          value={
                            player.batting_position ?? ""
                          }
                          disabled={!isDraft || isPending}
                          onChange={(event) => {
                            const value =
                              event.target.value === ""
                                ? null
                                : Number(
                                    event.target.value,
                                  );

                            runAction(() =>
                              setSelectionBattingPosition(
                                matchId,
                                selectionId,
                                player.player_id,
                                value,
                              ),
                            );
                          }}
                          className="rounded-lg border border-white/10 bg-[#0c1018] px-2 py-2 text-sm text-white disabled:opacity-50"
                        >
                          <option value="">—</option>

                          {Array.from(
                            {
                              length: Math.max(
                                15,
                                selectedPlayers.length,
                              ),
                            },
                            (_, index) => index + 1,
                          ).map((position) => (
                            <option
                              key={position}
                              value={position}
                            >
                              {position}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        disabled={
                          !isDraft ||
                          isPending ||
                          player.is_captain
                        }
                        onClick={() =>
                          runAction(() =>
                            setSelectionCaptain(
                              matchId,
                              selectionId,
                              player.player_id,
                            ),
                          )
                        }
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-amber-400/30 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Captain
                      </button>

                      <button
                        type="button"
                        disabled={
                          !isDraft ||
                          isPending ||
                          player.is_wicketkeeper
                        }
                        onClick={() =>
                          runAction(() =>
                            setSelectionWicketkeeper(
                              matchId,
                              selectionId,
                              player.player_id,
                            ),
                          )
                        }
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-sky-400/30 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        WK
                      </button>

                      <button
                        type="button"
                        disabled={!isDraft || isPending}
                        onClick={() =>
                          runAction(() =>
                            removePlayerFromSelection(
                              matchId,
                              selectionId,
                              player.player_id,
                            ),
                          )
                        }
                        className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-6">
            <p className="text-sm text-zinc-500">
              No players have been selected yet.
            </p>
          </div>
        )}
      </section>

      {isDraft ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
            DCC Players
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            Add players
          </h2>

          <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
            Any active DCC player may be selected. Team membership
            and availability are shown as useful context elsewhere,
            but neither is an eligibility restriction.
          </p>

          <input
            type="search"
            value={playerSearch}
            onChange={(event) =>
              setPlayerSearch(event.target.value)
            }
            placeholder="Search players…"
            className="mt-6 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/40"
          />

          {availableToAdd.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {availableToAdd.map((player) => {
                const availabilityStatus =
                  availabilityByPlayerId.get(
                    player.player_id,
                  ) ?? null;

                return (
                  <div
                    key={player.player_id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {player.player_name}
                      </p>

                      <span
                        className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${availabilityClasses(
                          availabilityStatus,
                        )}`}
                      >
                        {availabilityLabel(
                          availabilityStatus,
                        )}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        runAction(() =>
                          addPlayerToSelection(
                            matchId,
                            selectionId,
                            player.player_id,
                          ),
                        )
                      }
                      className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm text-zinc-500">
                No matching players available to add.
              </p>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}