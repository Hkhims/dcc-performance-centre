"use client";

import { useState, useTransition } from "react";
import {
  approveMatchImport,
  rejectMatchImport,
} from "./actions";

type ReviewActionsProps = {
  matchImportId: number;
  validationStatus: "Clean" | "Review Required" | "Blocked";
  importStatus:
    | "Imported"
    | "Needs Review"
    | "Approved"
    | "Rejected"
    | "Superseded";
  isLatestImport: boolean;
};

export default function ReviewActions({
  matchImportId,
  validationStatus,
  importStatus,
  isLatestImport,
}: ReviewActionsProps) {
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<
    "success" | "error" | null
  >(null);

  const [isPending, startTransition] = useTransition();

  const canReview =
    isLatestImport &&
    (importStatus === "Imported" || importStatus === "Needs Review");

  const canApprove =
    canReview &&
    validationStatus !== "Blocked";

  const canReject = canReview;

  function runApprove() {
    setMessage(null);
    setMessageType(null);

    startTransition(async () => {
      const result = await approveMatchImport(
        matchImportId,
        reviewNotes,
      );

      setMessage(result.message);
      setMessageType(result.ok ? "success" : "error");
    });
  }

  function runReject() {
    setMessage(null);
    setMessageType(null);

    if (!rejectionReason.trim()) {
      setMessage("Please enter a reason before rejecting this import.");
      setMessageType("error");
      return;
    }

    startTransition(async () => {
      const result = await rejectMatchImport(
        matchImportId,
        rejectionReason,
      );

      setMessage(result.message);
      setMessageType(result.ok ? "success" : "error");
    });
  }

  if (!canReview) {
    let explanation =
      "This import can no longer be reviewed.";

    if (!isLatestImport) {
      explanation =
        "This is an older import. Only the latest import for this match can be reviewed.";
    } else if (importStatus === "Approved") {
      explanation =
        "This import has already been approved.";
    } else if (importStatus === "Rejected") {
      explanation =
        "This import has already been rejected.";
    } else if (importStatus === "Superseded") {
      explanation =
        "This import has been superseded by a newer approved version.";
    }

    return (
      <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Review decision
        </p>

        <p className="mt-3 text-zinc-400">
          {explanation}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Review decision
        </p>

        <h2 className="mt-2 text-2xl font-bold">
          Approve or reject this import
        </h2>

        <p className="mt-3 max-w-4xl leading-7 text-zinc-400">
          Approval publishes this reviewed import into the canonical DCC
          match and statistics tables. Rejection keeps it out of the
          canonical DCC record and requires a reason.
        </p>
      </div>

      {validationStatus === "Blocked" ? (
        <div className="mt-6 rounded-xl border border-red-400/25 bg-red-400/[0.07] p-4">
          <p className="font-semibold text-red-300">
            This import is blocked and cannot be approved.
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            It may still be rejected after review.
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
          <h3 className="text-lg font-semibold text-emerald-300">
            Approve import
          </h3>

          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Optional review notes can be stored with the approval for
            audit history.
          </p>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-zinc-300">
              Review notes
            </span>

            <textarea
              value={reviewNotes}
              onChange={(event) =>
                setReviewNotes(event.target.value)
              }
              disabled={!canApprove || isPending}
              rows={4}
              placeholder="Optional notes about this review..."
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <button
            type="button"
            onClick={runApprove}
            disabled={!canApprove || isPending}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Processing..." : "Approve import"}
          </button>
        </div>

        <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-5">
          <h3 className="text-lg font-semibold text-red-300">
            Reject import
          </h3>

          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Rejection does not delete the import. It remains in the
            audit history, but it will not be published as canonical
            DCC data.
          </p>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-zinc-300">
              Rejection reason
            </span>

            <textarea
              value={rejectionReason}
              onChange={(event) =>
                setRejectionReason(event.target.value)
              }
              disabled={!canReject || isPending}
              rows={4}
              placeholder="Required: explain why this import should not be published..."
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <button
            type="button"
            onClick={runReject}
            disabled={!canReject || isPending}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Processing..." : "Reject import"}
          </button>
        </div>
      </div>

      {message ? (
        <div
          className={`mt-6 rounded-xl border p-4 text-sm ${
            messageType === "success"
              ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200"
              : "border-red-400/25 bg-red-400/[0.07] text-red-200"
          }`}
        >
          {message}
        </div>
      ) : null}
    </section>
  );
}