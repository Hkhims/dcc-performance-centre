"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordBatRunsAction } from "./actions";

type ScorerControlsProps = {
  scoringSessionId: string;
  inningsId: string;
};

export default function ScorerControls({
  scoringSessionId,
  inningsId,
}: ScorerControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function recordSingle() {
    setMessage(null);

    startTransition(async () => {
      const result = await recordBatRunsAction(
        scoringSessionId,
        inningsId,
        1,
      );

      setMessage(result.message);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Runs off the bat
      </p>

      <button
        type="button"
        onClick={recordSingle}
        disabled={isPending}
        className="flex h-24 w-24 items-center justify-center rounded-2xl bg-amber-400 text-4xl font-black text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "…" : "1"}
      </button>

      {message ? (
        <p
          className={`mt-4 text-sm ${
            message.includes("recorded")
              ? "text-emerald-300"
              : "text-rose-300"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
