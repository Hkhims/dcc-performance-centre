"use client";

import { useState, useTransition } from "react";
import {
  addDccPlayerAction,
  addOppositionPlayerAction,
  setDccParticipantStatusAction,
  setOppositionParticipantStatusAction,
  setTossAction,
  startInningsAction,
} from "./actions";

type Side = { sideId: string; displayName: string; sideType: string };
type Participant = {
  participantId: string;
  sideId: string;
  displayName: string;
  participantType: string;
  participantRole: string;
  participationStatus: string;
};

type DccPlayerOption = { playerId: string; playerName: string };

type Props = {
  scoringSessionId: string;
  sides: Side[];
  dccPlayers: DccPlayerOption[];
  participants: Participant[];
  tossWinnerSideId: string | null;
  tossDecision: string | null;
};

export default function MatchSetupControls({
  scoringSessionId,
  sides,
  dccPlayers,
  participants,
  tossWinnerSideId,
  tossDecision,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [oppositionName, setOppositionName] = useState("");
  const [dccPlayerId, setDccPlayerId] = useState("");
  const [selectedTossWinner, setSelectedTossWinner] =
    useState(tossWinnerSideId ?? "");
  const [selectedTossDecision, setSelectedTossDecision] =
    useState<"Bat" | "Bowl">(tossDecision === "Bowl" ? "Bowl" : "Bat");
  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");
  const [scheduledOvers, setScheduledOvers] = useState("20");

  const dccSide = sides.find((side) => side.sideType === "DCC_TEAM");
  const oppositionSide = sides.find((side) => side.sideType === "EXTERNAL");

  const dccParticipants = participants.filter(
    (p) =>
      p.sideId === dccSide?.sideId &&
      p.participantType === "DCC" &&
      p.participantRole === "PLAYING",
  );
  const oppositionParticipants = participants.filter(
    (p) => p.sideId === oppositionSide?.sideId && p.participantRole === "PLAYING",
  );

  const activeDccCount = dccParticipants.filter(
    (p) => p.participationStatus !== "REMOVED",
  ).length;
  const activeOppositionCount = oppositionParticipants.filter(
    (p) => p.participationStatus !== "REMOVED",
  ).length;

  const dccParticipantPlayerIds = new Set(
    dccParticipants
      .filter((p) => p.participationStatus !== "REMOVED")
      .map((p) => p.displayName.toLocaleLowerCase()),
  );
  const addableDccPlayers = dccPlayers.filter(
    (player) => !dccParticipantPlayerIds.has(player.playerName.toLocaleLowerCase()),
  );
  const squadsValid =
    activeDccCount >= 8 &&
    activeDccCount <= 15 &&
    activeOppositionCount >= 8 &&
    activeOppositionCount <= 15;

  const tossRecorded =
    tossWinnerSideId !== null && (tossDecision === "Bat" || tossDecision === "Bowl");

  let battingSideId: string | null = null;
  let bowlingSideId: string | null = null;

  if (tossRecorded) {
    const otherSide = sides.find((side) => side.sideId !== tossWinnerSideId);
    if (otherSide) {
      if (tossDecision === "Bat") {
        battingSideId = tossWinnerSideId;
        bowlingSideId = otherSide.sideId;
      } else {
        bowlingSideId = tossWinnerSideId;
        battingSideId = otherSide.sideId;
      }
    }
  }

  const eligible = participants.filter(
    (p) => p.participantRole === "PLAYING" && p.participationStatus !== "REMOVED",
  );
  const batters = eligible.filter((p) => p.sideId === battingSideId);
  const bowlers = eligible.filter((p) => p.sideId === bowlingSideId);

  function show(result: { ok: boolean; message: string }) {
    setMessage(result.message);
    setMessageIsError(!result.ok);
  }

  function changeDccStatus(id: string, status: "AVAILABLE" | "REMOVED") {
    setMessage(null);
    startTransition(async () => {
      show(await setDccParticipantStatusAction(scoringSessionId, id, status));
    });
  }

  function addDccPlayer() {
    setMessage(null);
    startTransition(async () => {
      const result = await addDccPlayerAction(scoringSessionId, dccPlayerId);
      show(result);
      if (result.ok) setDccPlayerId("");
    });
  }

  function changeOppositionStatus(
    id: string,
    status: "AVAILABLE" | "REMOVED",
  ) {
    setMessage(null);
    startTransition(async () => {
      show(
        await setOppositionParticipantStatusAction(
          scoringSessionId,
          id,
          status,
        ),
      );
    });
  }

  function addOppositionPlayer() {
    setMessage(null);
    startTransition(async () => {
      const result = await addOppositionPlayerAction(
        scoringSessionId,
        oppositionName,
      );
      show(result);
      if (result.ok) setOppositionName("");
    });
  }

  function recordToss() {
    setMessage(null);
    startTransition(async () => {
      show(
        await setTossAction(
          scoringSessionId,
          selectedTossWinner,
          selectedTossDecision,
        ),
      );
    });
  }

  function startInnings() {
    setMessage(null);
    startTransition(async () => {
      show(
        await startInningsAction(
          scoringSessionId,
          strikerId,
          nonStrikerId,
          bowlerId,
          Number(scheduledOvers),
        ),
      );
    });
  }

  return (
    <div className="space-y-6">
      {message ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          messageIsError
            ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-300"
            : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"
        }`}>
          {message}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
          1 · Match-day squad
        </p>
        <h2 className="mt-2 text-2xl font-bold">{dccSide?.displayName ?? "DCC"}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          These players came from the Published Team. Remove somebody only if
          they are not participating today.
        </p>
        <p className={`mt-3 text-sm font-semibold ${
          activeDccCount >= 8 && activeDccCount <= 15
            ? "text-emerald-300"
            : "text-amber-300"
        }`}>
          Match-day squad: {activeDccCount}/15 · minimum 8
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <select
            value={dccPlayerId}
            onChange={(event) => setDccPlayerId(event.target.value)}
            disabled={isPending || activeDccCount >= 15}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-sm text-white"
          >
            <option value="">Choose DCC player to add</option>
            {addableDccPlayers.map((player) => (
              <option key={player.playerId} value={player.playerId}>
                {player.playerName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addDccPlayer}
            disabled={isPending || !dccPlayerId || activeDccCount >= 15}
            className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold transition hover:bg-white/15 disabled:opacity-50"
          >
            Add DCC Player
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {dccParticipants.map((p) => {
            const removed = p.participationStatus === "REMOVED";
            return (
              <div
                key={p.participantId}
                className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${
                  removed ? "border-white/5 bg-black/10 text-zinc-600" : "border-white/10 bg-white/[0.025]"
                }`}
              >
                <span className={`text-sm font-medium ${removed ? "line-through" : ""}`}>
                  {p.displayName}
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    changeDccStatus(p.participantId, removed ? "AVAILABLE" : "REMOVED")
                  }
                  className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-50"
                >
                  {removed ? "Restore" : "Remove"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
          2 · Opposition
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          {oppositionSide?.displayName ?? "Opposition"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Add opposition players needed for this match. They remain match-scoped.
        </p>
        <p className={`mt-3 text-sm font-semibold ${
          activeOppositionCount >= 8 && activeOppositionCount <= 15
            ? "text-emerald-300"
            : "text-amber-300"
        }`}>
          Match-day squad: {activeOppositionCount}/15 · minimum 8
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={oppositionName}
            onChange={(event) => setOppositionName(event.target.value)}
            placeholder="Player name"
            disabled={isPending}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/50"
          />
          <button
            type="button"
            onClick={addOppositionPlayer}
            disabled={
              isPending ||
              !oppositionName.trim() ||
              activeOppositionCount >= 15
            }
            className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold transition hover:bg-white/15 disabled:opacity-50"
          >
            Add Player
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {oppositionParticipants.map((p) => {
            const removed = p.participationStatus === "REMOVED";
            return (
              <div
                key={p.participantId}
                className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${
                  removed
                    ? "border-white/5 bg-black/10 text-zinc-600"
                    : "border-white/10 bg-white/[0.025]"
                }`}
              >
                <span className={`text-sm font-medium ${removed ? "line-through" : ""}`}>
                  {p.displayName}
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    changeOppositionStatus(
                      p.participantId,
                      removed ? "AVAILABLE" : "REMOVED",
                    )
                  }
                  className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-50"
                >
                  {removed ? "Restore" : "Remove"}
                </button>
              </div>
            );
          })}
          {oppositionParticipants.length === 0 ? (
            <span className="text-sm text-zinc-600">No opposition players added yet.</span>
          ) : null}
        </div>
      </section>

      {!squadsValid ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
          Both teams need between 8 and 15 match-day players before the innings can start.
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
          3 · Toss
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-zinc-400">
            Toss winner
            <select
              value={selectedTossWinner}
              onChange={(event) => setSelectedTossWinner(event.target.value)}
              className="rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white"
            >
              <option value="">Choose team</option>
              {sides.map((side) => (
                <option key={side.sideId} value={side.sideId}>
                  {side.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-zinc-400">
            Decision
            <select
              value={selectedTossDecision}
              onChange={(event) =>
                setSelectedTossDecision(event.target.value === "Bowl" ? "Bowl" : "Bat")
              }
              className="rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white"
            >
              <option value="Bat">Bat</option>
              <option value="Bowl">Bowl</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={recordToss}
          disabled={isPending || !selectedTossWinner}
          className="mt-5 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold transition hover:bg-white/15 disabled:opacity-50"
        >
          {tossRecorded ? "Update Toss" : "Record Toss"}
        </button>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
          4 · Opening configuration
        </p>
        <h2 className="mt-2 text-2xl font-bold">Start the innings</h2>

        {!tossRecorded ? (
          <p className="mt-4 text-sm text-zinc-500">
            Record the toss first. The batting and bowling sides will then be determined automatically.
          </p>
        ) : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <PlayerSelect label="Striker" value={strikerId} setValue={setStrikerId} players={batters} />
              <PlayerSelect
                label="Non-striker"
                value={nonStrikerId}
                setValue={setNonStrikerId}
                players={batters.filter((p) => p.participantId !== strikerId)}
              />
              <PlayerSelect label="Opening bowler" value={bowlerId} setValue={setBowlerId} players={bowlers} />
              <label className="grid gap-2 text-sm text-zinc-400">
                Scheduled overs
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={scheduledOvers}
                  onChange={(event) => setScheduledOvers(event.target.value)}
                  className="rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={startInnings}
              disabled={
                isPending ||
                !squadsValid ||
                !strikerId ||
                !nonStrikerId ||
                !bowlerId ||
                batters.length < 2 ||
                bowlers.length < 1
              }
              className="mt-6 rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-black transition hover:bg-amber-300 disabled:opacity-50"
            >
              {isPending ? "Starting Innings…" : "Start Innings →"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function PlayerSelect({
  label,
  value,
  setValue,
  players,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  players: Participant[];
}) {
  return (
    <label className="grid gap-2 text-sm text-zinc-400">
      {label}
      <select
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white"
      >
        <option value="">Choose player</option>
        {players.map((player) => (
          <option key={player.participantId} value={player.participantId}>
            {player.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
