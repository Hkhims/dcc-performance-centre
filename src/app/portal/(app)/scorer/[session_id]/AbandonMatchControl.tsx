"use client";

import { useState, useTransition } from "react";
import { abandonMatchAction } from "./actions";

type AbandonMatchControlProps = {
  scoringSessionId: string;
};

export default function AbandonMatchControl({
  scoringSessionId,
}: AbandonMatchControlProps) {
  const [open, setOpen] = useState(false);
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

    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await abandonMatchAction(
        scoringSessionId,
        cleanedReason,
      );

      if (!result.ok) setMessage(result.message);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-2 py-2 text-xs font-semibold text-zinc-500 transition hover:bg-white/5 hover:text-rose-300"
      >
        More match options ···
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-rose-200">Abandon match</p>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Use this only when the match cannot continue. Everything already scored will be preserved.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMessage(null);
          }}
          disabled={isPending}
          className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          aria-label="Close abandon match controls"
        >
          Close
        </button>
      </div>

      <label className="mt-4 block text-sm text-zinc-300">
        Reason
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={isPending}
          placeholder="e.g. Persistent rain"
          className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-rose-400/60"
        />
      </label>

      <button
        type="button"
        onClick={handleAbandon}
        disabled={isPending}
        className="mt-4 w-full rounded-xl bg-rose-500 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {isPending ? "Abandoning Match…" : "Confirm Abandonment"}
      </button>

      {message ? <p className="mt-3 text-sm text-rose-300">{message}</p> : null}
    </div>
  );
}
