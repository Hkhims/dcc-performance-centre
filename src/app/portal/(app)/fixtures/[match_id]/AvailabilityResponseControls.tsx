"use client";

import { useState, useTransition } from "react";
import {
  clearMyMatchAvailability,
  setMyMatchAvailability,
} from "./actions";

type AvailabilityStatus =
  | "Available"
  | "Unavailable"
  | "Not Responded";

type AvailabilityResponseControlsProps = {
  matchId: string;
  pollId: number;
  currentStatus: AvailabilityStatus;
  pollStatus: "Open" | "Closed";
};

export default function AvailabilityResponseControls({
  matchId,
  pollId,
  currentStatus,
  pollStatus,
}: AvailabilityResponseControlsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submitAvailability(
    status: "Available" | "Unavailable",
  ) {
    setMessage(null);
    setIsError(false);

    startTransition(async () => {
      const result = await setMyMatchAvailability(
        matchId,
        pollId,
        status,
      );

      setMessage(result.message);
      setIsError(!result.ok);
    });
  }

  function clearAvailability() {
    setMessage(null);
    setIsError(false);

    startTransition(async () => {
      const result = await clearMyMatchAvailability(
        matchId,
        pollId,
      );

      setMessage(result.message);
      setIsError(!result.ok);
    });
  }

  const statusClasses =
    currentStatus === "Available"
      ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300"
      : currentStatus === "Unavailable"
        ? "border-red-400/30 bg-red-400/[0.08] text-red-300"
        : "border-amber-400/30 bg-amber-400/[0.08] text-amber-300";

  return (
    <div className="mt-5">
      <div
        className={`rounded-xl border p-4 ${statusClasses}`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
          Your response
        </p>

        <p className="mt-1 text-lg font-bold">
          {currentStatus}
        </p>
      </div>

      {pollStatus === "Open" ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                submitAvailability("Available")
              }
              className={`rounded-xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                currentStatus === "Available"
                  ? "border-emerald-400 bg-emerald-400 text-black"
                  : "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-300 hover:bg-emerald-400/[0.12]"
              }`}
            >
              Available
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                submitAvailability("Unavailable")
              }
              className={`rounded-xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                currentStatus === "Unavailable"
                  ? "border-red-400 bg-red-400 text-black"
                  : "border-red-400/30 bg-red-400/[0.06] text-red-300 hover:bg-red-400/[0.12]"
              }`}
            >
              Unavailable
            </button>
          </div>

          {currentStatus !== "Not Responded" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={clearAvailability}
              className="mt-3 text-sm font-semibold text-zinc-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear response
            </button>
          ) : null}

          {isPending ? (
            <p className="mt-3 text-sm text-zinc-400">
              Saving your response…
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          Availability is closed for this fixture. Your response
          can no longer be changed.
        </p>
      )}

      {message && !isPending ? (
        <p
          role="status"
          className={`mt-3 text-sm ${
            isError ? "text-red-300" : "text-emerald-300"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}