"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ClaimReviewActions({
  claimId,
}: {
  claimId: number;
}) {
  const router = useRouter();

  const [reviewNote, setReviewNote] = useState("");
  const [submitting, setSubmitting] = useState<
    "Approved" | "Rejected" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function review(decision: "Approved" | "Rejected") {
    setErrorMessage("");
    setSubmitting(decision);

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "review_player_profile_claim",
      {
        target_claim_id: claimId,
        decision,
        decision_note: reviewNote.trim() || null,
      },
    );

    if (error) {
      setErrorMessage(
        "We couldn't complete this review. Refresh the page and check that the claim is still pending.",
      );
      setSubmitting(null);
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <label
        htmlFor={`review-note-${claimId}`}
        className="block text-sm font-medium text-zinc-300"
      >
        Review note (optional)
      </label>

      <textarea
        id={`review-note-${claimId}`}
        value={reviewNote}
        onChange={(event) => setReviewNote(event.target.value)}
        rows={3}
        placeholder="Add a note about this decision"
        className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/70"
      />

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => review("Approved")}
          className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "Approved"
            ? "Approving…"
            : "Approve claim"}
        </button>

        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => review("Rejected")}
          className="rounded-xl border border-red-400/30 px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "Rejected"
            ? "Rejecting…"
            : "Reject claim"}
        </button>
      </div>
    </div>
  );
}
