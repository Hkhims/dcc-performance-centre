"use client";

import { useState, useTransition } from "react";
import { abandonMatchAction } from "./actions";

type AbandonMatchControlProps = {
  scoringSessionId: string;
};

export default function AbandonMatchControl({
  scoringSessionId,
}: AbandonMatchControlProps) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAbandon() {
    const cleanedReason = reason.trim();

    if (!cleanedReason) {
      setMessage("Enter a reason for abandoning the match.");
      return;
    }

    const confirmed = window.confirm(
      "Abandon this match? The score and deliveries already recorded will be preserved, but no further scoring will be allowed.",
    );

    if (!confirmed) {
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const result = await abandonMatchAction(
        scoringSessionId,
        cleanedReason,
      );

      if (!result.ok) {
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5">
      <p className="text-sm font-semibold text-rose-200">
        Abandon match
      </p>

      <p className="mt-1 text-sm text-slate-400">
        Use this only when the match cannot continue. Recorded scoring
        will be preserved.
      </p>

      <label className="mt-4 block text-sm text-slate-300">
        Reason
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={isPending}
          placeholder="e.g. Persistent rain"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-rose-400/60"
        />
      </label>

      <button
        type="button"
        onClick={handleAbandon}
        disabled={isPending}
        className="mt-4 rounded-xl border border-rose-500/40 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Abandoning Match..." : "Abandon Match"}
      </button>

      {message ? (
        <p className="mt-3 text-sm text-rose-300">{message}</p>
      ) : null}
    </div>
  );
}