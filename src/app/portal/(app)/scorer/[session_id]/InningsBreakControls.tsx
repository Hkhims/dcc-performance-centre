"use client";

import { useState, useTransition } from "react";
import { startSecondInningsAction } from "./actions";

type ParticipantOption = {
  participantId: string;
  displayName: string;
};

type Props = {
  scoringSessionId: string;
  firstInningsId: string;
  firstInningsRuns: number;
  battingParticipants: ParticipantOption[];
  bowlingParticipants: ParticipantOption[];
};

export default function InningsBreakControls({
  scoringSessionId,
  firstInningsId,
  firstInningsRuns,
  battingParticipants,
  bowlingParticipants,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");

  function startSecondInnings() {
    setMessage(null);

    startTransition(async () => {
      const result = await startSecondInningsAction(
        scoringSessionId,
        firstInningsId,
        strikerId,
        nonStrikerId,
        bowlerId,
      );

      setMessage(result.message);
      setMessageIsError(!result.ok);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.06] p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
          Innings Break
        </p>

        <h2 className="mt-3 text-3xl font-bold">
          First innings: {firstInningsRuns}
        </h2>

        <p className="mt-2 text-lg font-semibold text-zinc-300">
          Target: {firstInningsRuns + 1}
        </p>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Choose the opening batters and opening bowler for the chase.
        </p>
      </div>

      {message ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            messageIsError
              ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-300"
              : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"
          }`}
        >
          {message}
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <h3 className="text-xl font-bold">
          Second innings opening configuration
        </h3>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-zinc-400">
              Striker
            </span>

            <select
              value={strikerId}
              onChange={(event) => setStrikerId(event.target.value)}
              disabled={isPending}
              className="rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-sm text-white"
            >
              <option value="">Choose striker</option>

              {battingParticipants.map((participant) => (
                <option
                  key={participant.participantId}
                  value={participant.participantId}
                >
                  {participant.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-zinc-400">
              Non-striker
            </span>

            <select
              value={nonStrikerId}
              onChange={(event) =>
                setNonStrikerId(event.target.value)
              }
              disabled={isPending}
              className="rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-sm text-white"
            >
              <option value="">Choose non-striker</option>

              {battingParticipants.map((participant) => (
                <option
                  key={participant.participantId}
                  value={participant.participantId}
                >
                  {participant.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-zinc-400">
              Opening bowler
            </span>

            <select
              value={bowlerId}
              onChange={(event) => setBowlerId(event.target.value)}
              disabled={isPending}
              className="rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-sm text-white"
            >
              <option value="">Choose opening bowler</option>

              {bowlingParticipants.map((participant) => (
                <option
                  key={participant.participantId}
                  value={participant.participantId}
                >
                  {participant.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={startSecondInnings}
          disabled={
            isPending ||
            !strikerId ||
            !nonStrikerId ||
            !bowlerId ||
            strikerId === nonStrikerId
          }
          className="mt-6 w-full rounded-xl bg-amber-400 px-5 py-3 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? "Starting Second Innings..."
            : "Start Second Innings"}
        </button>
      </div>
    </div>
  );
}