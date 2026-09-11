"use client";

import { useMemo, useState, useTransition } from "react";
import { createMatchImportCorrection } from "./actions";

type TeamEntry = {
  result?: string;
  team_id?: string;
  dcc_balls?: number | null;
  dcc_score?: number | null;
  dcc_wickets?: number | null;
  revised_overs?: number | null;
  competition_id?: string;
  opponent_balls?: number | null;
  opponent_score?: number | null;
  scheduled_overs?: number | null;
  opponent_wickets?: number | null;
  opponent_display_name?: string;
};

type Correction = {
  id: number;
  status: string;
  json_path: string[] | null;
};

type Props = {
  matchImportId: number;
  teamEntries: TeamEntry[];
  corrections: Correction[];
  isLatestImport: boolean;
  importStatus:
    | "Imported"
    | "Needs Review"
    | "Approved"
    | "Rejected"
    | "Superseded";
};

type EditableField = {
  key: keyof TeamEntry;
  label: string;
  type: "number" | "text";
};

const editableFields: EditableField[] = [
  {
    key: "result",
    label: "Result",
    type: "text",
  },
  {
    key: "dcc_score",
    label: "DCC score",
    type: "number",
  },
  {
    key: "dcc_wickets",
    label: "DCC wickets",
    type: "number",
  },
  {
    key: "dcc_balls",
    label: "DCC balls",
    type: "number",
  },
  {
    key: "opponent_score",
    label: "Opponent score",
    type: "number",
  },
  {
    key: "opponent_wickets",
    label: "Opponent wickets",
    type: "number",
  },
  {
    key: "opponent_balls",
    label: "Opponent balls",
    type: "number",
  },
  {
    key: "scheduled_overs",
    label: "Scheduled overs",
    type: "number",
  },
  {
    key: "revised_overs",
    label: "Revised overs",
    type: "number",
  },
];

function valueText(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  return String(value);
}

function teamDisplayName(teamId: string | undefined) {
  switch (teamId) {
    case "T01":
      return "DCC 1";
    case "T02":
      return "DCC 2";
    case "T03":
      return "DCC 3";
    case "T04":
      return "DCC 4";
    case "T05":
      return "Midweek 1";
    case "T06":
      return "Midweek 2";
    default:
      return teamId ?? "DCC team";
  }
}

export default function MatchSummaryCorrections({
  matchImportId,
  teamEntries,
  corrections,
  isLatestImport,
  importStatus,
}: Props) {
  const [teamEntryIndex, setTeamEntryIndex] = useState(0);
  const [fieldKey, setFieldKey] =
    useState<EditableField["key"]>("result");
  const [correctedValue, setCorrectedValue] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<
    "success" | "error" | null
  >(null);

  const [isPending, startTransition] = useTransition();

  const canCorrect =
    isLatestImport &&
    (importStatus === "Imported" ||
      importStatus === "Needs Review");

  const selectedEntry = teamEntries[teamEntryIndex];

  const selectedField =
    editableFields.find((field) => field.key === fieldKey) ??
    editableFields[0];

  const originalValue = selectedEntry?.[fieldKey];

  const jsonPath = useMemo(
    () => [
      "team_entries",
      String(teamEntryIndex),
      String(fieldKey),
    ],
    [teamEntryIndex, fieldKey],
  );

  const activeCorrection = corrections.find(
    (correction) =>
      correction.status === "Active" &&
      correction.json_path?.length === jsonPath.length &&
      correction.json_path.every(
        (segment, index) => segment === jsonPath[index],
      ),
  );

  function handleFieldChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    setFieldKey(event.target.value as EditableField["key"]);
    setCorrectedValue("");
    setReason("");
    setMessage(null);
    setMessageType(null);
  }

  function handleTeamEntryChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    setTeamEntryIndex(Number(event.target.value));
    setCorrectedValue("");
    setReason("");
    setMessage(null);
    setMessageType(null);
  }

  function runCorrection() {
    setMessage(null);
    setMessageType(null);

    if (!selectedEntry) {
      setMessage("No DCC team entry is available.");
      setMessageType("error");
      return;
    }

    if (originalValue === undefined) {
      setMessage(
        "This field does not exist in the imported payload, so it cannot be corrected safely.",
      );
      setMessageType("error");
      return;
    }

    if (activeCorrection) {
      setMessage(
        "An active correction already exists for this field.",
      );
      setMessageType("error");
      return;
    }

    if (!correctedValue.trim()) {
      setMessage("Please enter the corrected value.");
      setMessageType("error");
      return;
    }

    if (!reason.trim()) {
      setMessage("Please enter a reason for the correction.");
      setMessageType("error");
      return;
    }

    let parsedCorrectedValue: unknown = correctedValue.trim();

    if (selectedField.type === "number") {
      const numericValue = Number(correctedValue);

      if (!Number.isFinite(numericValue)) {
        setMessage("Please enter a valid number.");
        setMessageType("error");
        return;
      }

      if (!Number.isInteger(numericValue)) {
        setMessage("Please enter a whole number.");
        setMessageType("error");
        return;
      }

      if (numericValue < 0) {
        setMessage("The corrected value cannot be negative.");
        setMessageType("error");
        return;
      }

      parsedCorrectedValue = numericValue;
    }

    startTransition(async () => {
      const result = await createMatchImportCorrection(
        matchImportId,
        "team_entry",
        selectedEntry.team_id ??
          `team-entry-${teamEntryIndex}`,
        String(fieldKey),
        jsonPath,
        originalValue,
        parsedCorrectedValue,
        reason,
      );

      setMessage(result.message);
      setMessageType(result.ok ? "success" : "error");

      if (result.ok) {
        setCorrectedValue("");
        setReason("");
      }
    });
  }

  if (teamEntries.length === 0) {
    return null;
  }

  return (
    <section className="mt-10 rounded-2xl border border-amber-400/20 bg-amber-400/[0.035] p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
          Match correction
        </p>

        <h2 className="mt-2 text-2xl font-bold">
          Record a match summary correction
        </h2>

        <p className="mt-3 max-w-4xl leading-7 text-zinc-400">
          Corrections do not alter the original imported NV Play
          payload. They are recorded separately in the audit trail and
          applied only when the reviewed import is approved.
        </p>
      </div>

      {!canCorrect ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-black/15 p-4 text-sm text-zinc-400">
          Corrections are available only for the latest import while it
          is awaiting review.
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-zinc-300">
                DCC team entry
              </span>

              <select
                value={teamEntryIndex}
                onChange={handleTeamEntryChange}
                disabled={isPending}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e14] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
              >
                {teamEntries.map((entry, index) => (
                  <option key={index} value={index}>
                    {teamDisplayName(entry.team_id)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-zinc-300">
                Field
              </span>

              <select
                value={fieldKey}
                onChange={handleFieldChange}
                disabled={isPending}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e14] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
              >
                {editableFields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="text-sm font-medium text-zinc-300">
                Imported value
              </p>

              <div className="mt-2 min-h-[46px] rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300">
                {valueText(originalValue)}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-zinc-300">
                Corrected value
              </span>

              <input
                type={
                  selectedField.type === "number"
                    ? "number"
                    : "text"
                }
                min={
                  selectedField.type === "number"
                    ? 0
                    : undefined
                }
                step={
                  selectedField.type === "number"
                    ? 1
                    : undefined
                }
                value={correctedValue}
                onChange={(event) =>
                  setCorrectedValue(event.target.value)
                }
                disabled={
                  isPending ||
                  Boolean(activeCorrection) ||
                  originalValue === undefined
                }
                placeholder="Enter corrected value"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          </div>

          {activeCorrection ? (
            <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-200">
              This field already has active correction #
              {activeCorrection.id}. Use the correction history below
              rather than creating a duplicate correction.
            </div>
          ) : null}

          {originalValue === undefined ? (
            <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-200">
              This field is not present in the stored parser payload.
              Because corrections are not allowed to invent missing JSON
              paths, this field cannot be corrected here.
            </div>
          ) : null}

          <label className="mt-6 block">
            <span className="text-sm font-medium text-zinc-300">
              Correction reason
            </span>

            <textarea
              value={reason}
              onChange={(event) =>
                setReason(event.target.value)
              }
              disabled={
                isPending ||
                Boolean(activeCorrection) ||
                originalValue === undefined
              }
              rows={3}
              placeholder="Required: explain why the imported value needs to be corrected..."
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <button
            type="button"
            onClick={runCorrection}
            disabled={
              isPending ||
              Boolean(activeCorrection) ||
              originalValue === undefined
            }
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending
              ? "Recording correction..."
              : "Record correction"}
          </button>

          {message ? (
            <div
              className={`mt-5 rounded-xl border p-4 text-sm ${
                messageType === "success"
                  ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200"
                  : "border-red-400/25 bg-red-400/[0.07] text-red-200"
              }`}
            >
              {message}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
