"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addLiveOppositionPlayerAction,
  endOverAction,
  endInningsAction,
  recordScoringDeliveryAction,
  saveDeliveryEnrichmentAction,
  undoLastBallAction,
} from "./actions";
import type {
  ContactType,
  DeliveryLength,
  DeliveryLine,
  ShotIntent,
  ShotType,
} from "@/lib/app-scorer/delivery-enrichment";
type ParticipantOption = {
  participantId: string;
  displayName: string;
};
type ScorerControlsProps = {
  scoringSessionId: string;
  inningsId: string;
  strikerParticipantId: string | null;
  nonStrikerParticipantId: string | null;
  bowlerParticipantId: string | null;
  previousOverBowlerParticipantId: string | null;
  battingParticipants: ParticipantOption[];
  bowlingParticipants: ParticipantOption[];
  canAddBattingOppositionPlayer: boolean;
  canAddBowlingOppositionPlayer: boolean;
  overReadyToEnd: boolean;
  endRecommendation: {
    recommended: boolean;
    reason:
      | "TARGET_REACHED"
      | "BALL_LIMIT_REACHED"
      | "ALL_OUT"
      | null;
  };
  canUndo: boolean;
};
type ExtraPanel =
  | "WIDE"
  | "NO_BALL"
  | "BYE"
  | "LEG_BYE"
  | "WICKET"
  | null;
type NoBallMode = "BAT" | "BYE" | "LEG_BYE";
const RUN_BUTTONS = [0, 1, 2, 3, 4, 6] as const;
const NO_BALL_BAT_RUNS = [0, 1, 2, 3, 4, 6] as const;
const RUNNING_EXTRAS = [1, 2, 3, 4] as const;
export default function ScorerControls({
  scoringSessionId,
  inningsId,
  strikerParticipantId,
  nonStrikerParticipantId,
  bowlerParticipantId,
  previousOverBowlerParticipantId,
  battingParticipants,
  bowlingParticipants,
  canAddBattingOppositionPlayer,
  canAddBowlingOppositionPlayer,
  overReadyToEnd,
  endRecommendation,
  canUndo,
}: ScorerControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [extraPanel, setExtraPanel] =
    useState<ExtraPanel>(null);
  const [noBallMode, setNoBallMode] =
    useState<NoBallMode>("BAT");
  const [pendingLabel, setPendingLabel] =
    useState<string | null>(null);
  const [latestDeliveryEventId, setLatestDeliveryEventId] =
    useState<string | null>(null);
  const [showDeliveryDetails, setShowDeliveryDetails] = useState(false);
  const [deliveryLine, setDeliveryLine] = useState<DeliveryLine | "">("");
  const [deliveryLength, setDeliveryLength] = useState<DeliveryLength | "">("");
  const [shotType, setShotType] = useState<ShotType | "">("");
  const [shotIntent, setShotIntent] = useState<ShotIntent | "">("");
  const [contactType, setContactType] = useState<ContactType | "">("");
  const [scorerNote, setScorerNote] = useState("");
  const [incomingBatterId, setIncomingBatterId] = useState("");
  const [confirmedIncomingBatterId, setConfirmedIncomingBatterId] =
    useState<string | null>(null);
  const [nextBowlerId, setNextBowlerId] = useState("");
  const [confirmedNextBowlerId, setConfirmedNextBowlerId] =
    useState<string | null>(null);
  const [wicketType, setWicketType] = useState<
    "BOWLED" | "LBW" | "CAUGHT" | "STUMPED" | "CAUGHT_AND_BOWLED" | "RUN_OUT" | "HIT_WICKET"
  >("BOWLED");
  const [dismissedBatterId, setDismissedBatterId] = useState(
    strikerParticipantId ?? "",
  );
  const [fielderId, setFielderId] = useState("");
  const [liveOppositionName, setLiveOppositionName] = useState("");
  const [wicketDeliveryKind, setWicketDeliveryKind] = useState<
    "LEGAL" | "WIDE" | "NO_BALL"
  >("LEGAL");
  const [wicketRunKind, setWicketRunKind] = useState<
    "BAT" | "BYE" | "LEG_BYE"
  >("BAT");
  const [wicketRuns, setWicketRuns] = useState(0);
  function record(
    label: string,
    input: Parameters<
      typeof recordScoringDeliveryAction
    >[2],
  ) {
    setMessage(null);
    setPendingLabel(label);
    startTransition(async () => {
      const result =
        await recordScoringDeliveryAction(
          scoringSessionId,
          inningsId,
          {
            ...input,
            strikerParticipantId:
              strikerParticipantId ??
              (nonStrikerParticipantId
                ? confirmedIncomingBatterId ?? undefined
                : undefined),
            nonStrikerParticipantId:
              nonStrikerParticipantId ??
              (strikerParticipantId
                ? confirmedIncomingBatterId ?? undefined
                : undefined),
            bowlerParticipantId:
              bowlerParticipantId ?? confirmedNextBowlerId ?? undefined,
          },
        );
      setMessage(result.message);
      setMessageIsError(!result.ok);
      setPendingLabel(null);
      if (result.ok) {
        setLatestDeliveryEventId(result.deliveryEventId ?? null);
        setShowDeliveryDetails(false);
        resetDeliveryDetails();
        setExtraPanel(null);
        setNoBallMode("BAT");
        router.refresh();
      }
    });
  }
  function resetDeliveryDetails() {
    setDeliveryLine("");
    setDeliveryLength("");
    setShotType("");
    setShotIntent("");
    setContactType("");
    setScorerNote("");
  }

  function saveLatestDeliveryDetails() {
    if (!latestDeliveryEventId) {
      setMessage("There is no delivery available to add details to.");
      setMessageIsError(true);
      return;
    }

    setMessage(null);
    setPendingLabel("SAVE_DETAILS");

    startTransition(async () => {
      const result = await saveDeliveryEnrichmentAction(
        scoringSessionId,
        inningsId,
        latestDeliveryEventId,
        {
          deliveryLine: deliveryLine || undefined,
          deliveryLength: deliveryLength || undefined,
          shotType: shotType || undefined,
          shotIntent: shotIntent || undefined,
          contactType: contactType || undefined,
          scorerNote: scorerNote || undefined,
        },
      );

      setMessage(result.message);
      setMessageIsError(!result.ok);
      setPendingLabel(null);

      if (result.ok) {
        setShowDeliveryDetails(false);
        router.refresh();
      }
    });
  }

  function togglePanel(panel: Exclude<ExtraPanel, null>) {
    setMessage(null);
    setExtraPanel((current) =>
      current === panel ? null : panel,
    );
    if (panel === "NO_BALL") {
      setNoBallMode("BAT");
    }
  }
  function runServerAction(
    label: string,
    action: () => Promise<{ ok: boolean; message: string }>,
  ) {
    setMessage(null);
    setPendingLabel(label);
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      setMessageIsError(!result.ok);
      setPendingLabel(null);
      if (result.ok) router.refresh();
    });
  }
  function addLiveOppositionPlayer() {
    const name = liveOppositionName.trim();
    if (!name) {
      setMessage("Enter the opposition player's name.");
      setMessageIsError(true);
      return;
    }
    runServerAction("ADD_OPPOSITION", () =>
      addLiveOppositionPlayerAction(scoringSessionId, name),
    );
    setLiveOppositionName("");
  }
  function recordWicket() {
    if (!dismissedBatterId) {
      setMessage("Choose the dismissed batter.");
      setMessageIsError(true);
      return;
    }
    const unknownFielder = fielderId === "__UNKNOWN__";
    const needsKnownFielder = wicketType === "STUMPED";
    if (needsKnownFielder && (!fielderId || unknownFielder)) {
      setMessage("Choose the wicketkeeper for a stumping.");
      setMessageIsError(true);
      return;
    }
    if (
      (wicketType === "CAUGHT" || wicketType === "RUN_OUT") &&
      !fielderId
    ) {
      setMessage("Choose a fielder or Unknown / Not sure.");
      setMessageIsError(true);
      return;
    }
    if (
      wicketDeliveryKind === "WIDE" &&
      wicketType !== "STUMPED" &&
      wicketType !== "RUN_OUT"
    ) {
      setMessage("Only stumped or run out can be recorded from a wide.");
      setMessageIsError(true);
      return;
    }
    if (
      wicketDeliveryKind === "NO_BALL" &&
      wicketType !== "RUN_OUT"
    ) {
      setMessage("Only run out can be recorded from a no-ball.");
      setMessageIsError(true);
      return;
    }
    if (wicketType !== "RUN_OUT" && wicketRuns !== 0) {
      setMessage("Runs with a wicket are currently supported for run-outs only.");
      setMessageIsError(true);
      return;
    }
    let wicket:
      | { type: "BOWLED" | "LBW" | "HIT_WICKET" | "CAUGHT_AND_BOWLED"; dismissedBatterId: string }
      | { type: "CAUGHT"; dismissedBatterId: string; fielderId?: string }
      | { type: "STUMPED"; dismissedBatterId: string; fielderId: string }
      | { type: "RUN_OUT"; dismissedBatterId: string; fielderIds: string[] };
    if (wicketType === "CAUGHT") {
      wicket = unknownFielder
        ? { type: "CAUGHT", dismissedBatterId }
        : { type: "CAUGHT", dismissedBatterId, fielderId };
    } else if (wicketType === "STUMPED") {
      wicket = { type: "STUMPED", dismissedBatterId, fielderId };
    } else if (wicketType === "RUN_OUT") {
      wicket = {
        type: "RUN_OUT",
        dismissedBatterId,
        fielderIds: unknownFielder ? [] : [fielderId],
      };
    } else {
      wicket = { type: wicketType, dismissedBatterId };
    }
    if (wicketDeliveryKind === "WIDE") {
      record("WICKET_WIDE", {
        batRuns: 0,
        extras: { wides: wicketRuns + 1 },
        completedRuns: wicketRuns,
        wicket,
      });
      return;
    }
    if (wicketDeliveryKind === "NO_BALL") {
      const extras =
        wicketRunKind === "BYE"
          ? { noBalls: 1, ...(wicketRuns > 0 ? { byes: wicketRuns } : {}) }
          : wicketRunKind === "LEG_BYE"
            ? { noBalls: 1, ...(wicketRuns > 0 ? { legByes: wicketRuns } : {}) }
            : { noBalls: 1 };
      record("WICKET_NO_BALL", {
        batRuns: wicketRunKind === "BAT" ? wicketRuns as 0 | 1 | 2 | 3 | 4 : 0,
        extras,
        completedRuns: wicketRuns,
        wicket,
      });
      return;
    }
    const extras =
      wicketRunKind === "BYE" && wicketRuns > 0
        ? { byes: wicketRuns }
        : wicketRunKind === "LEG_BYE" && wicketRuns > 0
          ? { legByes: wicketRuns }
          : undefined;
    record("WICKET_LEGAL", {
      batRuns: wicketRunKind === "BAT" ? wicketRuns as 0 | 1 | 2 | 3 | 4 : 0,
      extras,
      completedRuns: extras ? wicketRuns : undefined,
      wicket,
    });
  }
  const missingBatter =
    strikerParticipantId === null || nonStrikerParticipantId === null;
  const missingBowler = bowlerParticipantId === null;
  const excludedBatterId =
    strikerParticipantId ?? nonStrikerParticipantId;
  const availableIncomingBatters = battingParticipants.filter(
    (participant) =>
      participant.participantId !== excludedBatterId,
  );
  return (
    <div className="mt-8">
      {missingBatter ? (
        <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
          <p className="font-semibold text-amber-300">Incoming batter required</p>
          {confirmedIncomingBatterId ? (
            <div className="mt-3">
              <div className="rounded-xl border border-amber-400/20 bg-black/20 px-4 py-3">
                <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                  Confirmed batsman
                </span>
                <p className="mt-1 font-semibold text-white">
                  {battingParticipants.find(
                    (participant) =>
                      participant.participantId === confirmedIncomingBatterId,
                  )?.displayName ?? "Selected batsman"}
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setConfirmedIncomingBatterId(null);
                  setMessage(null);
                }}
                className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-zinc-200 disabled:opacity-50"
              >
                Change batsman
              </button>
            </div>
          ) : (
            <>
              <select
                value={incomingBatterId}
                onChange={(event) => {
                  setIncomingBatterId(event.target.value);
                  setMessage(null);
                }}
                className="mt-3 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white"
              >
                <option value="">Choose batsman</option>
                {availableIncomingBatters.map((participant) => (
                  <option key={participant.participantId} value={participant.participantId}>
                    {participant.displayName}
                  </option>
                ))}
              </select>
              {incomingBatterId ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setConfirmedIncomingBatterId(incomingBatterId);
                      setMessage("Batsman confirmed.");
                      setMessageIsError(false);
                    }}
                    className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50"
                  >
                    Confirm batsman
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setIncomingBatterId("");
                      setMessage(null);
                    }}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-zinc-200 disabled:opacity-50"
                  >
                    Choose other batsman
                  </button>
                </div>
              ) : null}
              {canAddBattingOppositionPlayer ? (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Player missing?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={liveOppositionName}
                      onChange={(event) => setLiveOppositionName(event.target.value)}
                      placeholder="Opposition player name"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white"
                    />
                    <button
                      type="button"
                      disabled={isPending || !liveOppositionName.trim()}
                      onClick={addLiveOppositionPlayer}
                      className="rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-3 text-sm font-bold text-amber-300 disabled:opacity-40"
                    >
                      Add player
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {missingBowler ? (
        <div className="mb-5 rounded-2xl border border-sky-400/30 bg-sky-400/[0.06] p-4">
          <p className="font-semibold text-sky-300">Next bowler required</p>
          {confirmedNextBowlerId ? (
            <div className="mt-3">
              <div className="rounded-xl border border-sky-400/20 bg-black/20 px-4 py-3">
                <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                  Confirmed bowler
                </span>
                <p className="mt-1 font-semibold text-white">
                  {bowlingParticipants.find(
                    (participant) =>
                      participant.participantId === confirmedNextBowlerId,
                  )?.displayName ?? "Selected bowler"}
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setConfirmedNextBowlerId(null);
                  setMessage(null);
                }}
                className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-zinc-200 disabled:opacity-50"
              >
                Change bowler
              </button>
            </div>
          ) : (
            <>
              <select
                value={nextBowlerId}
                onChange={(event) => {
                  setNextBowlerId(event.target.value);
                  setMessage(null);
                }}
                className="mt-3 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white"
              >
                <option value="">Choose bowler</option>
                {bowlingParticipants.map((participant) => {
                  const bowledPreviousOver =
                    participant.participantId === previousOverBowlerParticipantId;
                  return (
                    <option
                      key={participant.participantId}
                      value={participant.participantId}
                      disabled={bowledPreviousOver}
                    >
                      {participant.displayName}
                      {bowledPreviousOver ? " — bowled previous over" : ""}
                    </option>
                  );
                })}
              </select>
              {nextBowlerId ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setConfirmedNextBowlerId(nextBowlerId);
                      setMessage("Bowler confirmed.");
                      setMessageIsError(false);
                    }}
                    className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50"
                  >
                    Confirm bowler
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setNextBowlerId("");
                      setMessage(null);
                    }}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-zinc-200 disabled:opacity-50"
                  >
                    Choose other bowler
                  </button>
                </div>
              ) : null}
              {canAddBowlingOppositionPlayer ? (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Player missing?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={liveOppositionName}
                      onChange={(event) => setLiveOppositionName(event.target.value)}
                      placeholder="Opposition player name"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white"
                    />
                    <button
                      type="button"
                      disabled={isPending || !liveOppositionName.trim()}
                      onClick={addLiveOppositionPlayer}
                      className="rounded-xl border border-sky-400/30 bg-sky-400/[0.08] px-4 py-3 text-sm font-bold text-sky-300 disabled:opacity-40"
                    >
                      Add player
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {latestDeliveryEventId ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setShowDeliveryDetails((current) => !current)}
          className="mb-5 w-full rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm font-bold text-amber-300 disabled:opacity-50"
        >
          {showDeliveryDetails
            ? "Close delivery details"
            : "Add details to last ball"}
        </button>
      ) : null}

      {latestDeliveryEventId && showDeliveryDetails ? (
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="font-semibold text-white">Delivery details</p>
          <p className="mt-1 text-sm text-zinc-400">
            Optional — scoring can continue without these details.
          </p>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Line</label>
          <select value={deliveryLine} onChange={(event) => setDeliveryLine(event.target.value as DeliveryLine | "")} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white">
            <option value="">Not recorded</option>
            <option value="WIDE_OUTSIDE_OFF">Wide outside off</option>
            <option value="OUTSIDE_OFF">Outside off</option>
            <option value="OFF_STUMP">Off stump</option>
            <option value="MIDDLE_STUMP">Middle stump</option>
            <option value="LEG_STUMP">Leg stump</option>
            <option value="OUTSIDE_LEG">Outside leg</option>
          </select>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Length</label>
          <select value={deliveryLength} onChange={(event) => setDeliveryLength(event.target.value as DeliveryLength | "")} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white">
            <option value="">Not recorded</option>
            <option value="YORKER">Yorker</option>
            <option value="FULL">Full</option>
            <option value="GOOD_LENGTH">Good length</option>
            <option value="BACK_OF_LENGTH">Back of a length</option>
            <option value="SHORT">Short</option>
            <option value="FULL_TOSS">Full toss</option>
          </select>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Shot</label>
          <select value={shotType} onChange={(event) => setShotType(event.target.value as ShotType | "")} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white">
            <option value="">Not recorded</option>
            <option value="NO_SHOT">No shot</option>
            <option value="LEAVE">Leave</option>
            <option value="DEFENCE">Defence</option>
            <option value="DRIVE">Drive</option>
            <option value="PUNCH">Punch</option>
            <option value="CUT">Cut</option>
            <option value="PULL">Pull</option>
            <option value="HOOK">Hook</option>
            <option value="FLICK_CLIP">Flick / clip</option>
            <option value="GLANCE">Glance</option>
            <option value="SWEEP">Sweep</option>
            <option value="REVERSE_SWEEP">Reverse sweep</option>
            <option value="SLOG">Slog</option>
            <option value="SLOG_SWEEP">Slog sweep</option>
            <option value="RAMP_SCOOP">Ramp / scoop</option>
            <option value="OTHER">Other</option>
          </select>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Intent</label>
          <select value={shotIntent} onChange={(event) => setShotIntent(event.target.value as ShotIntent | "")} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white">
            <option value="">Not recorded</option>
            <option value="GROUNDED">Grounded</option>
            <option value="LOFTED">Lofted</option>
          </select>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Contact</label>
          <select value={contactType} onChange={(event) => setContactType(event.target.value as ContactType | "")} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white">
            <option value="">Not recorded</option>
            <option value="CLEAN">Clean</option>
            <option value="EDGED">Edged</option>
            <option value="INSIDE_EDGE">Inside edge</option>
            <option value="MISTIMED">Mistimed</option>
            <option value="BEATEN">Beaten</option>
            <option value="TOP_EDGE">Top edge</option>
          </select>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Scorer note</label>
          <textarea value={scorerNote} onChange={(event) => setScorerNote(event.target.value)} maxLength={250} rows={3} placeholder="Optional note about this delivery" className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-white" />

          <button type="button" disabled={isPending} onClick={saveLatestDeliveryDetails} className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-black transition hover:bg-amber-300 disabled:opacity-50">
            {isPending && pendingLabel === "SAVE_DETAILS" ? "Saving details…" : "Save delivery details"}
          </button>
        </div>
      ) : null}

      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Runs off the bat
      </p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {RUN_BUTTONS.map((runs) => {
          const label = `BAT_${runs}`;
          return (
            <button
              key={runs}
              type="button"
              onClick={() =>
                record(label, {
                  batRuns: runs,
                  boundary: runs === 4 ? "FOUR" : runs === 6 ? "SIX" : undefined,
                })
              }
              disabled={
                isPending ||
                overReadyToEnd ||
                (missingBatter && !confirmedIncomingBatterId) ||
                (missingBowler && !confirmedNextBowlerId)
              }
              className="flex h-20 items-center justify-center rounded-2xl bg-amber-400 text-3xl font-black text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:h-24"
            >
              {isPending && pendingLabel === label
                ? "…"
                : runs}
            </button>
          );
        })}
      </div>
      <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Extras
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ExtraButton
          label="Wide"
          active={extraPanel === "WIDE"}
          disabled={isPending ||
            overReadyToEnd ||
            (missingBatter && !confirmedIncomingBatterId) ||
            (missingBowler && !confirmedNextBowlerId)}
          onClick={() => togglePanel("WIDE")}
        />
        <ExtraButton
          label="No Ball"
          active={extraPanel === "NO_BALL"}
          disabled={isPending ||
            overReadyToEnd ||
            (missingBatter && !confirmedIncomingBatterId) ||
            (missingBowler && !confirmedNextBowlerId)}
          onClick={() => togglePanel("NO_BALL")}
        />
        <ExtraButton
          label="Bye"
          active={extraPanel === "BYE"}
          disabled={isPending ||
            overReadyToEnd ||
            (missingBatter && !confirmedIncomingBatterId) ||
            (missingBowler && !confirmedNextBowlerId)}
          onClick={() => togglePanel("BYE")}
        />
        <ExtraButton
          label="Leg Bye"
          active={extraPanel === "LEG_BYE"}
          disabled={isPending ||
            overReadyToEnd ||
            (missingBatter && !confirmedIncomingBatterId) ||
            (missingBowler && !confirmedNextBowlerId)}
          onClick={() => togglePanel("LEG_BYE")}
        />
      </div>
      {extraPanel === "WIDE" ? (
        <SelectionPanel
          title="Wide"
          description="Choose the outcome. Running wides change ends according to the runs physically completed."
        >
          <ChoiceButton
            label="1 wide"
            disabled={isPending}
            onClick={() =>
              record("WIDE_1", {
                batRuns: 0,
                extras: { wides: 1 },
                completedRuns: 0,
              })
            }
          />
          {[1, 2, 3, 4].map((completedRuns) => {
            const totalWides = completedRuns + 1;
            return (
              <ChoiceButton
                key={completedRuns}
                label={`${totalWides} wides · ${completedRuns} run${
                  completedRuns === 1 ? "" : "s"
                }`}
                disabled={isPending}
                onClick={() =>
                  record(
                    `WIDE_${totalWides}_RUN_${completedRuns}`,
                    {
                      batRuns: 0,
                      extras: { wides: totalWides },
                      completedRuns,
                    },
                  )
                }
              />
            );
          })}
          <ChoiceButton
            label="5 wides · boundary"
            disabled={isPending}
            onClick={() =>
              record("WIDE_5_BOUNDARY", {
                batRuns: 0,
                extras: { wides: 5 },
                completedRuns: 0,
              })
            }
          />
        </SelectionPanel>
      ) : null}
      {extraPanel === "NO_BALL" ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="font-semibold text-white">No Ball</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            One no-ball penalty is added automatically. Choose
            whether the additional runs came off the bat, as byes,
            or as leg-byes.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <ModeButton
              label="Off Bat"
              active={noBallMode === "BAT"}
              disabled={isPending}
              onClick={() => setNoBallMode("BAT")}
            />
            <ModeButton
              label="Byes"
              active={noBallMode === "BYE"}
              disabled={isPending}
              onClick={() => setNoBallMode("BYE")}
            />
            <ModeButton
              label="Leg Byes"
              active={noBallMode === "LEG_BYE"}
              disabled={isPending}
              onClick={() => setNoBallMode("LEG_BYE")}
            />
          </div>
          {noBallMode === "BAT" ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {NO_BALL_BAT_RUNS.map((batRuns) => (
                <ChoiceButton
                  key={batRuns}
                  label={
                    batRuns === 0
                      ? "No ball only"
                      : `NB + ${batRuns} off bat`
                  }
                  disabled={isPending}
                  onClick={() =>
                    record(`NO_BALL_BAT_${batRuns}`, {
                      batRuns,
                      extras: { noBalls: 1 },
                    })
                  }
                />
              ))}
            </div>
          ) : null}
          {noBallMode === "BYE" ? (
            <NoBallRunningExtras
              kind="BYE"
              title="Bye"
              disabled={isPending}
              record={record}
            />
          ) : null}
          {noBallMode === "LEG_BYE" ? (
            <NoBallRunningExtras
              kind="LEG_BYE"
              title="Leg Bye"
              disabled={isPending}
              record={record}
            />
          ) : null}
        </div>
      ) : null}
      {extraPanel === "BYE" ? (
        <RunningExtraPanel
          title="Bye"
          kind="BYE"
          disabled={isPending}
          record={record}
        />
      ) : null}
      {extraPanel === "LEG_BYE" ? (
        <RunningExtraPanel
          title="Leg Bye"
          kind="LEG_BYE"
          disabled={isPending}
          record={record}
        />
      ) : null}

      {endRecommendation.recommended && endRecommendation.reason ? (
  <div className="mt-7 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4">
    <p className="font-semibold text-emerald-300">
      Innings ready to end
    </p>

    <p className="mt-1 text-sm text-zinc-400">
      {endRecommendation.reason === "ALL_OUT"
        ? "10 wickets have fallen."
        : endRecommendation.reason === "TARGET_REACHED"
          ? "The target has been reached."
          : "The scheduled ball limit has been reached."}
    </p>

    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        const confirmed = window.confirm(
          "End this innings? You will not be able to continue scoring this innings after confirmation.",
        );

        if (!confirmed) return;

        runServerAction("END_INNINGS", () =>
          endInningsAction(scoringSessionId, inningsId),
        );
      }}
      className="mt-4 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50"
    >
      {pendingLabel === "END_INNINGS" ? "Ending innings…" : "End Innings"}
    </button>
  </div>
) : null}

      <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Wicket & corrections
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          disabled={isPending ||
            overReadyToEnd ||
            (missingBatter && !confirmedIncomingBatterId) ||
            (missingBowler && !confirmedNextBowlerId)}
          onClick={() => togglePanel("WICKET")}
          className="rounded-xl border border-rose-400/30 bg-rose-400/[0.08] px-4 py-3 text-sm font-bold text-rose-300 disabled:opacity-40"
        >
          WICKET
        </button>
        <button
          type="button"
          disabled={isPending || !overReadyToEnd}
          onClick={() =>
            runServerAction("END_OVER", () =>
              endOverAction(scoringSessionId, inningsId),
            )
          }
          className="rounded-xl border border-sky-400/30 bg-sky-400/[0.08] px-4 py-3 text-sm font-bold text-sky-300 disabled:opacity-40"
        >
          {pendingLabel === "END_OVER" ? "…" : "End Over"}
        </button>
        <button
          type="button"
          disabled={isPending || !canUndo}
          onClick={() =>
            runServerAction("UNDO", async () => {
              const result = await undoLastBallAction(
                scoringSessionId,
                inningsId,
              );

              if (result.ok) {
                setLatestDeliveryEventId(null);
                setShowDeliveryDetails(false);
                resetDeliveryDetails();
              }

              return result;
            })
          }
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-zinc-200 disabled:opacity-40"
        >
          {pendingLabel === "UNDO" ? "…" : "Undo Last Ball"}
        </button>
      </div>
      {extraPanel === "WICKET" ? (
        <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-4">
          <p className="font-semibold text-white">Record wicket</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Record the complete delivery outcome. Cricket-invalid combinations are blocked before persistence and validated again by the engine.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select
              value={wicketType}
              onChange={(event) => {
                const nextType = event.target.value as typeof wicketType;
                setWicketType(nextType);
                if (nextType !== "RUN_OUT") {
                  setWicketRuns(0);
                }
                if (nextType !== "STUMPED" && nextType !== "RUN_OUT") {
                  setWicketDeliveryKind("LEGAL");
                }
              }}
              className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm"
            >
              <option value="BOWLED">Bowled</option>
              <option value="LBW">LBW</option>
              <option value="CAUGHT">Caught</option>
              <option value="STUMPED">Stumped</option>
              <option value="CAUGHT_AND_BOWLED">Caught & Bowled</option>
              <option value="RUN_OUT">Run Out</option>
              <option value="HIT_WICKET">Hit Wicket</option>
            </select>
            <select
              value={dismissedBatterId}
              onChange={(event) => setDismissedBatterId(event.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm"
            >
              <option value="">Dismissed batter</option>
              {[strikerParticipantId, nonStrikerParticipantId]
                .filter((id): id is string => Boolean(id))
                .map((id) => (
                  <option key={id} value={id}>
                    {battingParticipants.find((p) => p.participantId === id)?.displayName ?? id}
                  </option>
                ))}
            </select>
            {(wicketType === "CAUGHT" ||
              wicketType === "STUMPED" ||
              wicketType === "RUN_OUT") ? (
              <select
                value={fielderId}
                onChange={(event) => setFielderId(event.target.value)}
                className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm sm:col-span-2"
              >
                <option value="">
                  {wicketType === "STUMPED" ? "Choose wicketkeeper" : "Choose fielder"}
                </option>
                {wicketType === "CAUGHT" || wicketType === "RUN_OUT" ? (
                  <option value="__UNKNOWN__">Unknown / Not sure</option>
                ) : null}
                {bowlingParticipants.map((participant) => (
                  <option key={participant.participantId} value={participant.participantId}>
                    {participant.displayName}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {(wicketType === "STUMPED" || wicketType === "RUN_OUT") ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Delivery
              </p>
              <div className="grid grid-cols-3 gap-2">
                <ModeButton
                  label="Legal ball"
                  active={wicketDeliveryKind === "LEGAL"}
                  disabled={isPending}
                  onClick={() => {
                    setWicketDeliveryKind("LEGAL");
                    if (wicketType !== "RUN_OUT") setWicketRuns(0);
                  }}
                />
                <ModeButton
                  label="Wide"
                  active={wicketDeliveryKind === "WIDE"}
                  disabled={isPending}
                  onClick={() => {
                    setWicketDeliveryKind("WIDE");
                    if (wicketType !== "RUN_OUT") setWicketRuns(0);
                  }}
                />
                <ModeButton
                  label="No Ball"
                  active={wicketDeliveryKind === "NO_BALL"}
                  disabled={isPending || wicketType !== "RUN_OUT"}
                  onClick={() => setWicketDeliveryKind("NO_BALL")}
                />
              </div>
            </div>
          ) : null}
          {wicketType === "RUN_OUT" ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              {wicketDeliveryKind !== "WIDE" ? (
                <>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Runs came from
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <ModeButton label="Bat" active={wicketRunKind === "BAT"} disabled={isPending} onClick={() => setWicketRunKind("BAT")} />
                    <ModeButton label="Byes" active={wicketRunKind === "BYE"} disabled={isPending} onClick={() => setWicketRunKind("BYE")} />
                    <ModeButton label="Leg Byes" active={wicketRunKind === "LEG_BYE"} disabled={isPending} onClick={() => setWicketRunKind("LEG_BYE")} />
                  </div>
                </>
              ) : null}
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Runs completed before wicket
              </p>
              <div className="grid grid-cols-5 gap-2">
                {[0, 1, 2, 3, 4].map((runs) => (
                  <button
                    key={runs}
                    type="button"
                    disabled={isPending}
                    onClick={() => setWicketRuns(runs)}
                    className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                      wicketRuns === runs
                        ? "border-amber-400 bg-amber-400 text-black"
                        : "border-white/10 bg-white/[0.03] text-zinc-300"
                    }`}
                  >
                    {runs}
                  </button>
                ))}
              </div>
              {wicketDeliveryKind === "WIDE" ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Team wides: {wicketRuns + 1} (one wide penalty + {wicketRuns} completed).
                </p>
              ) : null}
            </div>
          ) : null}
          {wicketType === "STUMPED" && wicketDeliveryKind === "WIDE" ? (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
              Stumped from a wide records one wide, no legal ball, and a bowler wicket.
            </p>
          ) : null}
          <button
            type="button"
            onClick={recordWicket}
            disabled={isPending}
            className="mt-4 w-full rounded-xl bg-rose-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            Record Wicket
          </button>
        </div>
      ) : null}
      {message ? (
        <p
          className={`mt-4 text-sm ${
            messageIsError
              ? "text-rose-300"
              : "text-emerald-300"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
function ExtraButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
          : "border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
      }`}
    >
      {label}
    </button>
  );
}
function ModeButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "bg-amber-400 text-black"
          : "border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
      }`}
    >
      {label}
    </button>
  );
}
function SelectionPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        {description}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {children}
      </div>
    </div>
  );
}
function ChoiceButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
function RunningExtraPanel({
  title,
  kind,
  disabled,
  record,
}: {
  title: string;
  kind: "BYE" | "LEG_BYE";
  disabled: boolean;
  record: (
    label: string,
    input: Parameters<
      typeof recordScoringDeliveryAction
    >[2],
  ) => void;
}) {
  const extrasKey =
    kind === "BYE" ? "byes" : "legByes";
  return (
    <SelectionPanel
      title={title}
      description="Choose runs completed. A boundary four is separate because the batters did not physically run four."
    >
      {RUNNING_EXTRAS.map((runs) => (
        <ChoiceButton
          key={runs}
          label={`${runs} ${title.toLowerCase()}${
            runs === 1 ? "" : "s"
          }`}
          disabled={disabled}
          onClick={() =>
            record(`${kind}_${runs}`, {
              batRuns: 0,
              extras: { [extrasKey]: runs },
              completedRuns: runs,
            })
          }
        />
      ))}
      <ChoiceButton
        label={`4 ${title.toLowerCase()}s · boundary`}
        disabled={disabled}
        onClick={() =>
          record(`${kind}_4_BOUNDARY`, {
            batRuns: 0,
            extras: { [extrasKey]: 4 },
            completedRuns: 0,
          })
        }
      />
    </SelectionPanel>
  );
}
function NoBallRunningExtras({
  kind,
  title,
  disabled,
  record,
}: {
  kind: "BYE" | "LEG_BYE";
  title: string;
  disabled: boolean;
  record: (
    label: string,
    input: Parameters<
      typeof recordScoringDeliveryAction
    >[2],
  ) => void;
}) {
  const extrasKey =
    kind === "BYE" ? "byes" : "legByes";
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {RUNNING_EXTRAS.map((runs) => (
        <ChoiceButton
          key={runs}
          label={`NB + ${runs} ${title.toLowerCase()}${
            runs === 1 ? "" : "s"
          }`}
          disabled={disabled}
          onClick={() =>
            record(`NO_BALL_${kind}_${runs}`, {
              batRuns: 0,
              extras: {
                noBalls: 1,
                [extrasKey]: runs,
              },
              completedRuns: runs,
            })
          }
        />
      ))}
      <ChoiceButton
        label={`NB + 4 ${title.toLowerCase()}s · boundary`}
        disabled={disabled}
        onClick={() =>
          record(`NO_BALL_${kind}_4_BOUNDARY`, {
            batRuns: 0,
            extras: {
              noBalls: 1,
              [extrasKey]: 4,
            },
            completedRuns: 0,
          })
        }
      />
    </div>
  );
}
