"use client";

import { useState, useTransition } from "react";
import type { BreakReason } from "@/lib/cricket-engine/types";
import { resumePlayAction, startBreakAction } from "./actions";

type BreakControlProps = {
  scoringSessionId: string;
  inningsId: string;
  activeBreak: {
    active: boolean;
    reason: BreakReason | null;
    note: string | null;
  };
};

const BREAK_REASONS: Array<{
  value: BreakReason;
  label: string;
}> = [
  { value: "RAIN", label: "Rain" },
  { value: "DRINKS", label: "Drinks" },
  { value: "INJURY", label: "Injury" },
  { value: "BAD_LIGHT", label: "Bad light" },
  { value: "GROUND_CONDITIONS", label: "Ground conditions" },
  { value: "OTHER", label: "Other" },
];

function breakReasonLabel(reason: BreakReason | null) {
  return (
    BREAK_REASONS.find((option) => option.value === reason)?.label ??
    "Break"
  );
}

export default function BreakControl({
  scoringSessionId,
  inningsId,
  activeBreak,
}: BreakControlProps) {
  const [reason, setReason] = useState<BreakReason>("RAIN");
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStartBreak() {
    setMessage(null);

    startTransition(async () => {
      const result = await startBreakAction(
        scoringSessionId,
        inningsId,
        reason,
        note,
      );

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      setShowForm(false);
      setNote("");
    });
  }

  function handleResumePlay() {
    setMessage(null);

    startTransition(async () => {
      const result = await resumePlayAction(
        scoringSessionId,
        inningsId,
      );

      if (!result.ok) {
        setMessage(result.message);
      }
    });
  }

  if (activeBreak.active) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">
          Break in Play
        </p>

        <h3 className="mt-2 text-xl font-black text-white">
          {breakReasonLabel(activeBreak.reason)}
        </h3>

        {activeBreak.note ? (
          <p className="mt-2 text-sm text-zinc-300">
            {activeBreak.note}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleResumePlay}
          disabled={isPending}
          className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Resuming..." : "Resume Play"}
        </button>

        {message ? (
          <p className="mt-3 text-sm text-rose-300">{message}</p>
        ) : null}
      </div>
    );
  }

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setShowForm(true);
        }}
        className="rounded-xl border border-amber-400/30 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/10"
      >
        Break
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
      <p className="text-sm font-bold text-white">Start a break</p>

      <label className="mt-4 block text-sm text-zinc-300">
        Reason
        <select
          value={reason}
          onChange={(event) =>
            setReason(event.target.value as BreakReason)
          }
          disabled={isPending}
          className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-amber-400/60"
        >
          {BREAK_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm text-zinc-300">
        Note <span className="text-zinc-500">(optional)</span>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={isPending}
          placeholder="e.g. Heavy rain"
          className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-amber-400/60"
        />
      </label>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={handleStartBreak}
          disabled={isPending}
          className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Starting Break..." : "Start Break"}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowForm(false);
            setMessage(null);
          }}
          disabled={isPending}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-rose-300">{message}</p>
      ) : null}
    </div>
  );
}