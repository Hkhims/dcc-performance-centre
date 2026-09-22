"use client";

import { useMemo, useState } from "react";

import {
  createMatchImportCorrection,
  resolveMatchImportCorrection,
  supersedeMatchImportCorrection,
} from "./actions";

type PlayerPerformance = {
  source_match_id?: string;
  runs?: number | null;
  fours?: number | null;
  sixes?: number | null;
  wides?: number | null;
  batted?: boolean;
  bowled?: boolean;
  catches?: number | null;
  maidens?: number | null;
  team_id?: string;
  wickets?: number | null;
  no_balls?: number | null;
  run_outs?: number | null;
  player_id?: string;
  stumpings?: number | null;
  is_not_out?: boolean | null;
  balls_faced?: number | null;
  bowling_balls?: number | null;
  runs_conceded?: number | null;
  dismissal_type?: string | null;
  batting_position?: number | null;
  external_player_name?: string;
  parser_notes?: unknown[];
};

type Correction = {
  id: number;
  entity_type: string;
  entity_key: string;
  field_name: string;
  original_value: unknown;
  corrected_value: unknown;
  reason: string;
  status: string;
  json_path: string[] | null;
};

type Props = {
  matchImportId: number;
  performances: PlayerPerformance[];
  corrections: Correction[];
  playerPayloadKey: "dcc_players" | "player_performances";
  isLatestImport: boolean;
  importStatus: string;
};

type EditableField = {
  key:
    | "runs"
    | "balls_faced"
    | "fours"
    | "sixes"
    | "batting_position"
    | "bowling_balls"
    | "maidens"
    | "runs_conceded"
    | "wickets"
    | "wides"
    | "no_balls"
    | "catches"
    | "stumpings"
    | "run_outs";
  label: string;
};

const editableFields: EditableField[] = [
  { key: "runs", label: "Runs" },
  { key: "balls_faced", label: "Balls faced" },
  { key: "fours", label: "Fours" },
  { key: "sixes", label: "Sixes" },
  { key: "batting_position", label: "Batting position" },
  { key: "bowling_balls", label: "Bowling balls" },
  { key: "maidens", label: "Maidens" },
  { key: "runs_conceded", label: "Runs conceded" },
  { key: "wickets", label: "Wickets" },
  { key: "wides", label: "Wides" },
  { key: "no_balls", label: "No balls" },
  { key: "catches", label: "Catches" },
  { key: "stumpings", label: "Stumpings" },
  { key: "run_outs", label: "Run outs" },
];

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function playerName(
  player: PlayerPerformance | undefined,
  index: number,
) {
  return (
    player?.external_player_name?.trim() ||
    `Player ${index + 1}`
  );
}

function playerEntityKey(
  player: PlayerPerformance,
  index: number,
) {
  return (
    player.player_id?.trim() ||
    player.external_player_name?.trim() ||
    `player-${index}`
  );
}

export default function PlayerPerformanceCorrections({
  matchImportId,
  performances,
  corrections,
  playerPayloadKey,
  isLatestImport,
  importStatus,
}: Props) {
  const [playerIndex, setPlayerIndex] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [correctedValue, setCorrectedValue] = useState("");
  const [reason, setReason] = useState("");
  const [replacementValue, setReplacementValue] = useState("");
  const [replacementReason, setReplacementReason] = useState("");
  const [resolutionReason, setResolutionReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const canCorrect =
    isLatestImport &&
    (importStatus === "Imported" ||
      importStatus === "Needs Review");

  const selectedIndex =
    playerIndex === "" ? null : Number(playerIndex);

  const selectedPlayer =
    selectedIndex === null
      ? undefined
      : performances[selectedIndex];

  const selectedField = editableFields.find(
    (field) => field.key === fieldName,
  );

  const importedValue =
    selectedPlayer && selectedField
      ? selectedPlayer[selectedField.key]
      : undefined;

  const selectedJsonPath =
    selectedIndex !== null && selectedField
      ? [
          playerPayloadKey,
          String(selectedIndex),
          selectedField.key,
        ]
      : null;

  const activeCorrection = useMemo(() => {
    if (!selectedJsonPath) {
      return undefined;
    }

    return corrections.find(
      (correction) =>
        correction.status === "Active" &&
        correction.json_path?.length ===
          selectedJsonPath.length &&
        correction.json_path.every(
          (part, index) =>
            part === selectedJsonPath[index],
        ),
    );
  }, [corrections, selectedJsonPath]);

  const reviewedValue = activeCorrection
    ? activeCorrection.corrected_value
    : importedValue;

  function resetMessages() {
    setMessage("");
    setError("");
  }

  function resetLifecycleInputs() {
    setReplacementValue("");
    setReplacementReason("");
    setResolutionReason("");
  }

  function resetAllInputs() {
    setCorrectedValue("");
    setReason("");
    resetLifecycleInputs();
  }

  function parseNonNegativeInteger(rawValue: string): number {
    const trimmed = rawValue.trim();

    if (!trimmed) {
      throw new Error("Enter a corrected value.");
    }

    const parsed = Number(trimmed);

    if (!Number.isFinite(parsed)) {
      throw new Error("The corrected value must be a number.");
    }

    if (!Number.isInteger(parsed)) {
      throw new Error(
        "The corrected value must be a whole number.",
      );
    }

    if (parsed < 0) {
      throw new Error(
        "The corrected value cannot be negative.",
      );
    }

    return parsed;
  }

  async function runCorrection() {
    resetMessages();

    if (
      selectedIndex === null ||
      !selectedPlayer ||
      !selectedField ||
      !selectedJsonPath
    ) {
      setError("Choose a player and field first.");
      return;
    }

    if (importedValue === undefined) {
      setError(
        "That field is not present in the imported player record.",
      );
      return;
    }

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setError("Enter a correction reason.");
      return;
    }

    let parsedValue: number;

    try {
      parsedValue = parseNonNegativeInteger(correctedValue);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Enter a valid corrected value.",
      );
      return;
    }

    setPending(true);

    try {
      const result = await createMatchImportCorrection(
        matchImportId,
        "player_performance",
        playerEntityKey(
          selectedPlayer,
          selectedIndex,
        ),
        selectedField.key,
        selectedJsonPath,
        importedValue,
        parsedValue,
        trimmedReason,
      );

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setMessage(result.message);
      resetAllInputs();
    } finally {
      setPending(false);
    }
  }

  async function runSupersede() {
    resetMessages();

    if (!activeCorrection) {
      setError("There is no active correction to replace.");
      return;
    }

    const trimmedReason = replacementReason.trim();

    if (!trimmedReason) {
      setError(
        "Enter a reason for replacing the correction.",
      );
      return;
    }

    let parsedValue: number;

    try {
      parsedValue = parseNonNegativeInteger(replacementValue);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Enter a valid replacement value.",
      );
      return;
    }

    setPending(true);

    try {
      const result = await supersedeMatchImportCorrection(
        matchImportId,
        activeCorrection.id,
        parsedValue,
        trimmedReason,
      );

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setMessage(result.message);
      resetLifecycleInputs();
    } finally {
      setPending(false);
    }
  }

  async function runResolve() {
    resetMessages();

    if (!activeCorrection) {
      setError("There is no active correction to resolve.");
      return;
    }

    const trimmedReason = resolutionReason.trim();

    if (!trimmedReason) {
      setError("Enter a resolution reason.");
      return;
    }

    setPending(true);

    try {
      const result = await resolveMatchImportCorrection(
        matchImportId,
        activeCorrection.id,
        trimmedReason,
      );

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setMessage(result.message);
      resetLifecycleInputs();
    } finally {
      setPending(false);
    }
  }

  if (performances.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
      <div>
        <p className="text-sm font-semibold text-amber-400">
          Player corrections
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          Review player statistics
        </h2>
        <p className="mt-3 max-w-4xl leading-7 text-zinc-400">
          Correct imported player statistics while preserving
          the original parser payload and complete audit
          history. Player identity changes are handled
          separately and are not available here.
        </p>
      </div>

      {!canCorrect ? (
        <div className="mt-5 rounded-xl border border-zinc-700 bg-black/20 p-4 text-sm leading-6 text-zinc-400">
          Player corrections are read-only because this import
          is either historical or no longer awaiting review.
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-zinc-300">
            Player
          </span>
          <select
            value={playerIndex}
            disabled={!canCorrect || pending}
            onChange={(event) => {
              setPlayerIndex(event.target.value);
              setFieldName("");
              resetAllInputs();
              resetMessages();
            }}
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white outline-none transition focus:border-amber-400/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Choose player</option>
            {performances.map((player, index) => (
              <option
                key={
                  player.player_id ??
                  `${player.external_player_name ?? "player"}-${index}`
                }
                value={index}
              >
                {playerName(player, index)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-300">
            Field
          </span>
          <select
            value={fieldName}
            disabled={
              !canCorrect ||
              pending ||
              selectedIndex === null
            }
            onChange={(event) => {
              setFieldName(event.target.value);
              resetAllInputs();
              resetMessages();
            }}
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white outline-none transition focus:border-amber-400/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Choose field</option>
            {editableFields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedPlayer && selectedField ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/15 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
              Imported value
            </p>
            <p className="mt-2 text-lg font-semibold">
              {displayValue(importedValue)}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
              Reviewed value
            </p>
            <p className="mt-2 text-lg font-semibold">
              {displayValue(reviewedValue)}
            </p>
          </div>
        </div>
      ) : null}

      {selectedPlayer &&
      selectedField &&
      importedValue === undefined ? (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100">
          This statistic is not present in the imported player
          record, so it cannot be corrected through the audited
          correction path.
        </div>
      ) : null}

      {canCorrect &&
      selectedPlayer &&
      selectedField &&
      importedValue !== undefined ? (
        activeCorrection ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
              <p className="text-sm font-semibold text-amber-300">
                Active correction #{activeCorrection.id}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Replace this correction to keep the audit chain,
                or resolve it to return the reviewed value to
                the imported statistic.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/15 p-5">
                <h3 className="font-semibold">
                  Replace correction
                </h3>

                <label className="mt-4 block">
                  <span className="text-sm text-zinc-400">
                    New corrected value
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={replacementValue}
                    disabled={pending}
                    onChange={(event) =>
                      setReplacementValue(event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white outline-none transition focus:border-amber-400/50"
                  />
                </label>

                <label className="mt-4 block">
                  <span className="text-sm text-zinc-400">
                    Reason
                  </span>
                  <textarea
                    value={replacementReason}
                    disabled={pending}
                    onChange={(event) =>
                      setReplacementReason(event.target.value)
                    }
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white outline-none transition focus:border-amber-400/50"
                  />
                </label>

                <button
                  type="button"
                  disabled={pending}
                  onClick={runSupersede}
                  className="mt-4 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending
                    ? "Saving..."
                    : "Replace correction"}
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/15 p-5">
                <h3 className="font-semibold">
                  Resolve correction
                </h3>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Resolving removes this correction from the
                  effective reviewed values without deleting its
                  audit record.
                </p>

                <label className="mt-4 block">
                  <span className="text-sm text-zinc-400">
                    Resolution reason
                  </span>
                  <textarea
                    value={resolutionReason}
                    disabled={pending}
                    onChange={(event) =>
                      setResolutionReason(event.target.value)
                    }
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white outline-none transition focus:border-amber-400/50"
                  />
                </label>

                <button
                  type="button"
                  disabled={pending}
                  onClick={runResolve}
                  className="mt-4 rounded-xl border border-red-400/30 bg-red-400/[0.08] px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending
                    ? "Saving..."
                    : "Resolve correction"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <div className="grid gap-5 lg:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">
                  Corrected value
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={correctedValue}
                  disabled={pending}
                  onChange={(event) =>
                    setCorrectedValue(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white outline-none transition focus:border-amber-400/50"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-zinc-300">
                  Correction reason
                </span>
                <textarea
                  value={reason}
                  disabled={pending}
                  onChange={(event) =>
                    setReason(event.target.value)
                  }
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e15] px-4 py-3 text-white outline-none transition focus:border-amber-400/50"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={pending}
              onClick={runCorrection}
              className="mt-4 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending
                ? "Saving..."
                : "Record player correction"}
            </button>
          </div>
        )
      ) : null}

      {message ? (
        <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-red-400/25 bg-red-400/[0.07] p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
