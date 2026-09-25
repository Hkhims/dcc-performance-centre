"use client";

import { useState, useTransition } from "react";
import {
  closeMatchAvailability,
  openTeamMatchAvailability,
  reopenMatchAvailability,
} from "./actions";

type AvailabilityControlsProps = {
  matchId: string;
  teamId: string;
  pollId: number | null;
  status: string | null;
};

export default function AvailabilityControls({
  matchId,
  teamId,
  pollId,
  status,
}: AvailabilityControlsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction() {
    setMessage(null);

    startTransition(async () => {
      let result;

      if (!pollId) {
        result = await openTeamMatchAvailability(
          matchId,
          teamId,
        );
      } else if (status === "Open") {
        result = await closeMatchAvailability(
          pollId,
          teamId,
          matchId,
        );
      } else {
        result = await reopenMatchAvailability(
          pollId,
          teamId,
          matchId,
        );
      }

      setMessage(result.message);
    });
  }

  const buttonLabel = !pollId
    ? "Open Availability"
    : status === "Open"
      ? "Close Availability"
      : "Reopen Availability";

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={runAction}
        disabled={isPending}
        className="inline-flex rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Working..." : buttonLabel}
      </button>

      {message ? (
        <p className="mt-3 text-sm text-zinc-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}