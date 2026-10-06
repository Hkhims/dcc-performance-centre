"use client";

import { useState, useTransition } from "react";
import {
  abandonMatchAction,
  adjustScheduledOversAction,
  endInningsEarlyAction,
} from "./actions";

type MatchOptionsControlProps = {
  scoringSessionId: string;
  inningsId: string;
  scheduledLegalBalls: number | null;
};

export default function MatchOptionsControl({
  scoringSessionId,
  inningsId,
  scheduledLegalBalls,
}: MatchOptionsControlProps) {
  const currentScheduledOvers =
    scheduledLegalBalls !== null
      ? scheduledLegalBalls / 6
      : null;

  const [open, setOpen] = useState(false);
  const [scheduledOvers, setScheduledOvers] = useState(
    currentScheduledOvers !== null
      ? String(currentScheduledOvers)
      : "",
  );
  const [abandonReason, setAbandonReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdjustScheduledOvers() {
    const parsedOvers = Number(scheduledOvers);

    if (
      !Number.isInteger(parsedOvers) ||
      parsedOvers <= 0
    ) {
      setMessage(
        "Enter a positive whole number of scheduled overs.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Change the scheduled innings length to ${parsedOvers} overs? The score and deliveries already recorded will not be changed.`,
    );

    if (!confirmed) return;

    setMessage(null);

    startTransition(async () => {
      const result = await adjustScheduledOversAction(
        scoringSessionId,
        inningsId,
        parsedOvers,
      );

      setMessage(result.message);

      if (result.ok) {
        setScheduledOvers(String(parsedOvers));
      }
    });
  }

  function handleEndInningsEarly(
    reason: "DECLARED" | "MANUAL",
  ) {
    const wording =
      reason === "DECLARED"
        ? "Declare this innings now?"
        : "End this innings early by agreement?";

    const confirmed = window.confirm(
      `${wording} This will complete the innings at the current score.`,
    );

    if (!confirmed) return;

    setMessage(null);

    startTransition(async () => {
      const result = await endInningsEarlyAction(
        scoringSessionId,
        inningsId,
        reason,
      );

      setMessage(result.message);
    });
  }

  function handleAbandon() {
    const cleanedReason = abandonReason.trim();

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

      setMessage(result.message);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-2 py-2 text-xs font-semibold text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
      >
        More match options ···
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-zinc-100">
            More match options
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Adjust the innings conditions or finish play early.
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
          aria-label="Close match options"
        >
          Close
        </button>
      </div>

      <div className="mt-5 border-t border-white/10 pt-5">
        <p className="font-bold text-zinc-100">
          Adjust scheduled overs
        </p>

        <p className="mt-1 text-sm leading-6 text-zinc-400">
          Use this when the agreed innings length changes. Existing
          scores and deliveries are preserved.
        </p>

        {currentScheduledOvers !== null ? (
          <p className="mt-2 text-xs font-semibold text-zinc-500">
            Current scheduled length: {currentScheduledOvers} overs
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block text-sm text-zinc-300">
            Revised overs
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={scheduledOvers}
              onChange={(event) =>
                setScheduledOvers(event.target.value)
              }
              disabled={isPending}
              className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-sky-400/60 sm:w-32"
            />
          </label>

          <button
            type="button"
            onClick={handleAdjustScheduledOvers}
            disabled={isPending}
            className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm font-black text-sky-200 transition hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Update Overs"}
          </button>
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-5">
        <p className="font-bold text-zinc-100">
          End innings early
        </p>

        <p className="mt-1 text-sm leading-6 text-zinc-400">
          Complete the innings before its normal end condition.
          Choose the reason that reflects what happened.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() =>
              handleEndInningsEarly("DECLARED")
            }
            disabled={isPending}
            className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Declare Innings
          </button>

          <button
            type="button"
            onClick={() =>
              handleEndInningsEarly("MANUAL")
            }
            disabled={isPending}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            End by Agreement
          </button>
        </div>
      </div>

      <div className="mt-5 border-t border-rose-500/20 pt-5">
        <p className="font-bold text-rose-200">
          Abandon match
        </p>

        <p className="mt-1 text-sm leading-6 text-zinc-400">
          Use this only when the match cannot continue. Everything
          already scored will be preserved.
        </p>

        <label className="mt-3 block text-sm text-zinc-300">
          Reason
          <input
            type="text"
            value={abandonReason}
            onChange={(event) =>
              setAbandonReason(event.target.value)
            }
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
          {isPending
            ? "Working…"
            : "Confirm Abandonment"}
        </button>
      </div>

      {message ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300">
          {message}
        </p>
      ) : null}
    </div>
  );
}