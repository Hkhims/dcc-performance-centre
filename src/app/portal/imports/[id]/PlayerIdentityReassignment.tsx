"use client";

import { useMemo, useState, useTransition } from "react";
import {
  reassignMatchImportPlayer,
  resolveMatchImportPlayerReassignment,
} from "./actions";

type DccPlayerOption = {
  playerId: string;
  playerName: string;
};

type PlayerIdentityCorrection = {
  id: number;
  status: string;
  entityType: string;
  fieldName: string;
  jsonPath: string[];
  correctedValue: unknown;
  reason: string | null;
};

type PlayerIdentityRow = {
  playerIndex: number;
  playerId: string;
  playerName: string;
  teamId: string | null;
  sourceMatchId: string | null;
  sourceIdentity: {
    provider: string | null;
    externalPlayerId: string | null;
    externalPlayerName: string | null;
  } | null;
};

type Props = {
  matchImportId: number;
  canReview: boolean;
  players: PlayerIdentityRow[];
  activePlayers: DccPlayerOption[];
  corrections: PlayerIdentityCorrection[];
};

type ActionMessage = {
  ok: boolean;
  message: string;
} | null;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function activeIdentityCorrection(
  corrections: PlayerIdentityCorrection[],
  playerIndex: number,
) {
  const expectedPath = [
    "dcc_players",
    String(playerIndex),
    "player_id",
  ];

  return (
    corrections.find(
      (correction) =>
        correction.status === "Active" &&
        correction.entityType === "player_identity" &&
        correction.fieldName === "player_id" &&
        correction.jsonPath.length === expectedPath.length &&
        correction.jsonPath.every(
          (segment, index) => segment === expectedPath[index],
        ),
    ) ?? null
  );
}

function PlayerIdentityEditor({
  matchImportId,
  canReview,
  player,
  activePlayers,
  correction,
}: {
  matchImportId: number;
  canReview: boolean;
  player: PlayerIdentityRow;
  activePlayers: DccPlayerOption[];
  correction: PlayerIdentityCorrection | null;
}) {
  const correctedPlayerId = correction
    ? stringValue(correction.correctedValue)
    : "";

  const reviewedPlayerId = correctedPlayerId || player.playerId;

  const reviewedPlayerName =
    activePlayers.find(
      (candidate) => candidate.playerId === reviewedPlayerId,
    )?.playerName ??
    (reviewedPlayerId === player.playerId
      ? player.playerName
      : reviewedPlayerId);

  const [replacementPlayerId, setReplacementPlayerId] =
    useState(reviewedPlayerId);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<ActionMessage>(null);
  const [isPending, startTransition] = useTransition();

  const sourceName =
    player.sourceIdentity?.externalPlayerName?.trim() ||
    player.sourceIdentity?.externalPlayerId?.trim() ||
    "Source player unavailable";

  const sourceProvider =
    player.sourceIdentity?.provider?.trim() || "NV Play";

  const hasReassignment = Boolean(correction);

  const submitReassignment = () => {
    const cleanedReason = reason.trim();

    if (!replacementPlayerId) {
      setMessage({
        ok: false,
        message: "Select the correct DCC player.",
      });
      return;
    }

    if (replacementPlayerId === reviewedPlayerId) {
      setMessage({
        ok: false,
        message:
          "Select a different player from the current reviewed player.",
      });
      return;
    }

    if (!cleanedReason) {
      setMessage({
        ok: false,
        message: "Enter a reason for the player reassignment.",
      });
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const result = await reassignMatchImportPlayer(
        matchImportId,
        player.playerIndex,
        replacementPlayerId,
        cleanedReason,
      );

      setMessage(result);

      if (result.ok) {
        setReason("");
      }
    });
  };

  const resolveReassignment = () => {
    if (!correction) {
      return;
    }

    const cleanedReason = reason.trim();

    if (!cleanedReason) {
      setMessage({
        ok: false,
        message:
          "Enter a reason for resolving the player reassignment.",
      });
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const result =
        await resolveMatchImportPlayerReassignment(
          matchImportId,
          correction.id,
          cleanedReason,
        );

      setMessage(result);

      if (result.ok) {
        setReason("");
      }
    });
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Source identity
          </p>

          <h3 className="mt-1 text-lg font-semibold text-slate-950">
            {sourceName}
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            {sourceProvider}
            {player.sourceIdentity?.externalPlayerId
              ? ` · ${player.sourceIdentity.externalPlayerId}`
              : ""}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 px-4 py-3 lg:min-w-64">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Reviewed DCC player
          </p>

          <p className="mt-1 font-semibold text-slate-950">
            {reviewedPlayerName}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {reviewedPlayerId}
          </p>

          {hasReassignment ? (
            <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Reassigned
            </span>
          ) : (
            <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              Parser identity
            </span>
          )}
        </div>
      </div>

      {hasReassignment ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">
            Match-specific identity correction active
          </p>

          <p className="mt-1 text-sm text-amber-900">
            Parser mapping:{" "}
            <span className="font-semibold">
              {player.playerName}
            </span>
            {" → "}
            Reviewed as:{" "}
            <span className="font-semibold">
              {reviewedPlayerName}
            </span>
          </p>

          {correction?.reason ? (
            <p className="mt-2 text-xs text-amber-800">
              Reason: {correction.reason}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Correct DCC player
          </span>

          <select
            value={replacementPlayerId}
            onChange={(event) => {
              setReplacementPlayerId(event.target.value);
              setMessage(null);
            }}
            disabled={!canReview || isPending}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
          >
            {activePlayers.map((candidate) => (
              <option
                key={candidate.playerId}
                value={candidate.playerId}
              >
                {candidate.playerName} ({candidate.playerId})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Reason
          </span>

          <input
            type="text"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setMessage(null);
            }}
            disabled={!canReview || isPending}
            placeholder={
              hasReassignment
                ? "Why is this identity being changed or resolved?"
                : "Why did a different DCC player actually play?"
            }
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submitReassignment}
          disabled={
            !canReview ||
            isPending ||
            !replacementPlayerId ||
            replacementPlayerId === reviewedPlayerId
          }
          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending
            ? "Saving..."
            : hasReassignment
              ? "Replace reassignment"
              : "Reassign player"}
        </button>

        {hasReassignment ? (
          <button
            type="button"
            onClick={resolveReassignment}
            disabled={!canReview || isPending}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Resolve reassignment
          </button>
        ) : null}

        {message ? (
          <p
            className={`text-sm font-medium ${
              message.ok ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {message.message}
          </p>
        ) : null}
      </div>

      {!canReview ? (
        <p className="mt-4 text-xs text-slate-500">
          Player identity changes are unavailable because this import
          can no longer be reviewed.
        </p>
      ) : null}
    </article>
  );
}

export default function PlayerIdentityReassignment({
  matchImportId,
  canReview,
  players,
  activePlayers,
  corrections,
}: Props) {
  const activeCorrectionsByPlayer = useMemo(() => {
    const result = new Map<
      number,
      PlayerIdentityCorrection | null
    >();

    players.forEach((player) => {
      result.set(
        player.playerIndex,
        activeIdentityCorrection(
          corrections,
          player.playerIndex,
        ),
      );
    });

    return result;
  }, [corrections, players]);

  if (players.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Player identity review
        </p>

        <h2 className="mt-1 text-xl font-semibold text-slate-950">
          Match-specific player reassignment
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Use this only when the person who actually represented DCC
          in this match is different from the DCC player linked to the
          NV Play identity. This changes the player for this match
          only. It does not alter the permanent NV Play mapping or the
          original source identity.
        </p>
      </div>

      {activePlayers.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No active DCC players are available for reassignment.
        </div>
      ) : (
        <div className="space-y-4">
          {players.map((player) => (
            <PlayerIdentityEditor
              key={`${player.sourceMatchId ?? "match"}-${player.playerIndex}`}
              matchImportId={matchImportId}
              canReview={canReview}
              player={player}
              activePlayers={activePlayers}
              correction={
                activeCorrectionsByPlayer.get(
                  player.playerIndex,
                ) ?? null
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}