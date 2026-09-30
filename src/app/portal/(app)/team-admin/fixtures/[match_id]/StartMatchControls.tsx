"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startAppScorerMatch } from "./actions";

type StartMatchControlsProps = {
  matchId: string;
  eligible: boolean;
  existingSessionId: string | null;
  hasActiveInnings: boolean;
};

export default function StartMatchControls({
  matchId,
  eligible,
  existingSessionId,
  hasActiveInnings,
}: StartMatchControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function openScorer() {
    setMessage(null);

    if (existingSessionId) {
      router.push(
        hasActiveInnings
          ? `/portal/scorer/${existingSessionId}`
          : `/portal/scorer/${existingSessionId}/setup`,
      );
      return;
    }

    startTransition(async () => {
      const result = await startAppScorerMatch(matchId);

      if (!result.ok || !result.scoringSessionId) {
        setMessage(result.message);
        return;
      }

      router.push(`/portal/scorer/${result.scoringSessionId}/setup`);
    });
  }

  if (!eligible && !existingSessionId) {
    return (
      <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4">
        <p className="text-sm leading-6 text-zinc-400">
          App Scorer becomes available for a Scheduled Friendly or Warm-up
          after the DCC team has been Published.
        </p>
      </div>
    );
  }

  const buttonLabel = existingSessionId
    ? hasActiveInnings
      ? "Resume Scoring →"
      : "Continue Match Setup →"
    : "Start Match →";

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={openScorer}
        disabled={isPending}
        className="inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Opening Match Setup…" : buttonLabel}
      </button>

      {message ? (
        <p className="mt-3 text-sm text-rose-300">{message}</p>
      ) : null}
    </div>
  );
}