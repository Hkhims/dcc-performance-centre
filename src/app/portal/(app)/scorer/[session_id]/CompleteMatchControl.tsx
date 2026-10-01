"use client";

import { useState, useTransition } from "react";

import { completeMatchAction } from "./actions";

type CompleteMatchControlProps = {
  scoringSessionId: string;
  firstInningsId: string;
  secondInningsId: string;
};

export default function CompleteMatchControl({
  scoringSessionId,
  firstInningsId,
  secondInningsId,
}: CompleteMatchControlProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCompleteMatch() {
    const confirmed = window.confirm(
      "Complete this match? The final result will be saved.",
    );

    if (!confirmed) {
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const result = await completeMatchAction(
        scoringSessionId,
        firstInningsId,
        secondInningsId,
      );

      if (!result.ok) {
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={handleCompleteMatch}
        disabled={isPending}
        className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Completing Match..." : "Complete Match"}
      </button>

      {message ? (
        <p className="mt-3 text-sm text-red-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}