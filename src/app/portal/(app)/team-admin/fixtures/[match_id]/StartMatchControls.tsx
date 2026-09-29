"use client";

import { useState, useTransition } from "react";
import { startAppScorerMatch } from "./actions";

type StartMatchControlsProps = {
  matchId: string;
  eligible: boolean;
};

export default function StartMatchControls({
  matchId,
  eligible,
}: StartMatchControlsProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [scoringSessionId, setScoringSessionId] =
    useState<string | null>(null);

  function startMatch() {
    setMessage(null);

    startTransition(async () => {
      const result = await startAppScorerMatch(matchId);
      setMessage(result.message);

      if (result.ok && result.scoringSessionId) {
        setScoringSessionId(result.scoringSessionId);
      }
    });
  }

  if (!eligible) {
    return (
      <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4">
        <p className="text-sm leading-6 text-zinc-400">
          App Scorer becomes available for a Scheduled Friendly
          or Warm-up after the DCC team has been Published.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={startMatch}
        disabled={isPending || scoringSessionId !== null}
        className="inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending
          ? "Starting…"
          : scoringSessionId
            ? "Match Started"
            : "Start Match →"}
      </button>

      {message ? (
        <p className={`mt-3 text-sm ${
          scoringSessionId ? "text-emerald-300" : "text-rose-300"
        }`}>
          {message}
        </p>
      ) : null}

      {scoringSessionId ? (
        <p className="mt-2 text-xs text-zinc-500">
          Scoring session: {scoringSessionId}
        </p>
      ) : null}
    </div>
  );
}
