"use server";



import { revalidatePath } from "next/cache";

import {

  publishCompletedAppScorerMatch,

  getScorerSnapshot,

  recordDelivery,

  recordInningsEnded,

  recordPlayingConditionsChanged,

  recordOverEnded,

  recordBatterEntered,

  abandonAppScorerMatch,

  recordBreakStarted,

  recordBreakEnded,

  undoLastBall,

} from "@/lib/app-scorer/scoring-service";

import { deriveMatchState } from "@/lib/cricket-engine/match-engine";

import { saveDeliveryEnrichment } from "@/lib/app-scorer/delivery-enrichment-service";

import type { DeliveryEnrichment } from "@/lib/app-scorer/delivery-enrichment";

import type { DeliveryBoundary } from "@/lib/cricket-engine/types";

import { createClient } from "@/lib/supabase/server";

import type { BreakReason } from "@/lib/cricket-engine/types";



type ScorerActionResult = {

  ok: boolean;

  message: string;

  deliveryEventId?: string;

};



type BatRuns = 0 | 1 | 2 | 3 | 4 | 5 | 6;



type DeliveryExtrasInput = {

  wides?: number;

  noBalls?: number;

  byes?: number;

  legByes?: number;

};



type WicketInput =

  | { type: "BOWLED" | "LBW" | "HIT_WICKET" | "CAUGHT_AND_BOWLED"; dismissedBatterId: string }

  | { type: "CAUGHT"; dismissedBatterId: string; fielderId?: string }

  | { type: "STUMPED"; dismissedBatterId: string; fielderId: string }

  | { type: "RUN_OUT"; dismissedBatterId: string; fielderIds: string[] };



type RecordScoringDeliveryInput = {

  batRuns: BatRuns;

  boundary?: DeliveryBoundary;

  extras?: DeliveryExtrasInput;

  completedRuns?: number;

  wicket?: WicketInput;

  strikerParticipantId?: string;

  nonStrikerParticipantId?: string;

  bowlerParticipantId?: string;

};



function errorMessage(error: unknown) {

  return error instanceof Error ? error.message : "Something went wrong.";

}



async function requireSignedInUser() {

  const supabase = await createClient();



  const { data: claimsData, error: claimsError } =

    await supabase.auth.getClaims();



  return {

    signedIn:

      !claimsError && Boolean(claimsData?.claims?.sub),

  };

}



function positiveWholeNumber(value: number | undefined) {

  return (

    value !== undefined &&

    Number.isInteger(value) &&

    value > 0

  );

}



function validateDeliveryInput(

  input: RecordScoringDeliveryInput,

): string | null {

  if (![0, 1, 2, 3, 4, 5, 6].includes(input.batRuns)) {

    return "Invalid bat-runs value.";

  }



  if (

    input.completedRuns !== undefined &&

    (!Number.isInteger(input.completedRuns) ||

      input.completedRuns < 0)

  ) {

    return "Completed runs must be a non-negative whole number.";

  }



  const extras = input.extras ?? {};

  const hasWide = extras.wides !== undefined;

  const hasNoBall = extras.noBalls !== undefined;

  const hasByes = extras.byes !== undefined;

  const hasLegByes = extras.legByes !== undefined;



  for (const value of [

    extras.wides,

    extras.noBalls,

    extras.byes,

    extras.legByes,

  ]) {

    if (value !== undefined && !positiveWholeNumber(value)) {

      return "Extras must be positive whole numbers.";

    }

  }



  if (hasWide) {

    if (hasNoBall || hasByes || hasLegByes) {

      return "A wide cannot be combined with another extra type.";

    }



    if (input.batRuns !== 0) {

      return "A wide cannot also contain bat runs.";

    }

  }



  if (hasByes && hasLegByes) {

    return "A delivery cannot contain both byes and leg-byes.";

  }



  if ((hasByes || hasLegByes) && input.batRuns !== 0) {

    return "Byes and leg-byes cannot also contain bat runs.";

  }



  if (hasNoBall && extras.noBalls !== 1) {

    return "A no-ball must contain one no-ball penalty run.";

  }



  if (

    !hasWide &&

    !hasNoBall &&

    !hasByes &&

    !hasLegByes &&

    input.completedRuns !== undefined

  ) {

    return "Completed-run metadata is only needed for extras.";

  }



  if (input.wicket && !input.wicket.dismissedBatterId.trim()) {

    return "A dismissed batter is required.";

  }



  if (

    input.wicket &&

    input.wicket.type === "STUMPED" &&

    !input.wicket.fielderId.trim()

  ) {

    return "A fielder is required for this dismissal.";

  }



  if (

    input.wicket?.type === "RUN_OUT" &&

    input.wicket.fielderIds.some((fielderId) => !fielderId.trim())

  ) {

    return "Run-out fielder IDs must be valid.";

  }



  if (

    input.wicket &&

    hasWide &&

    !["STUMPED", "RUN_OUT"].includes(input.wicket.type)

  ) {

    return "Only stumped or run out can be recorded from a wide.";

  }



  if (

    input.wicket &&

    hasNoBall &&

    input.wicket.type !== "RUN_OUT"

  ) {

    return "Only run out can be recorded from a no-ball.";

  }



  return null;

}



function deliveryMessage(

  input: RecordScoringDeliveryInput,

) {

  if (input.wicket) {

    return `${input.wicket.type.replaceAll("_", " ")} wicket recorded.`;

  }



  const extras = input.extras ?? {};



  if (extras.wides) {

    return `${extras.wides} wide${

      extras.wides === 1 ? "" : "s"

    } recorded.`;

  }



  if (extras.noBalls && extras.byes) {

    return `No-ball + ${extras.byes} bye${

      extras.byes === 1 ? "" : "s"

    } recorded.`;

  }



  if (extras.noBalls && extras.legByes) {

    return `No-ball + ${extras.legByes} leg-bye${

      extras.legByes === 1 ? "" : "s"

    } recorded.`;

  }



  if (extras.noBalls) {

    return input.batRuns === 0

      ? "No-ball recorded."

      : `No-ball + ${input.batRuns} off the bat recorded.`;

  }



  if (extras.byes) {

    return `${extras.byes} bye${

      extras.byes === 1 ? "" : "s"

    } recorded.`;

  }



  if (extras.legByes) {

    return `${extras.legByes} leg-bye${

      extras.legByes === 1 ? "" : "s"

    } recorded.`;

  }



  return `${input.batRuns} run${

    input.batRuns === 1 ? "" : "s"

  } recorded.`;

}



export async function recordScoringDeliveryAction(

  scoringSessionId: string,

  inningsId: string,

  input: RecordScoringDeliveryInput,

): Promise<ScorerActionResult> {

  try {

    if (!scoringSessionId.trim() || !inningsId.trim()) {

      return {

        ok: false,

        message: "Scoring session and innings are required.",

      };

    }



    const validationError = validateDeliveryInput(input);



    if (validationError) {

      return {

        ok: false,

        message: validationError,

      };

    }



    const { signedIn } = await requireSignedInUser();



    if (!signedIn) {

      return {

        ok: false,

        message: "You must be signed in.",

      };

    }



    const snapshot = await getScorerSnapshot(inningsId);



    if (snapshot.scoringSessionId !== scoringSessionId) {

      return {

        ok: false,

        message:

          "The innings does not belong to this scoring session.",

      };

    }



    if (snapshot.inningsStatus !== "InProgress") {

      return {

        ok: false,

        message: "This innings is not currently in progress.",

      };

    }



    const endRecommendation = snapshot.state.endRecommendation;



if (

  endRecommendation.recommended &&

  (

    endRecommendation.reason === "TARGET_REACHED" ||

    endRecommendation.reason === "BALL_LIMIT_REACHED" ||

    endRecommendation.reason === "ALL_OUT"

  )

) {

  return {

    ok: false,

    message:

      "End the innings or undo the previous delivery before recording another delivery.",

  };

}



    if (snapshot.overReadyToEnd) {

      return {

        ok: false,

        message:

          "End the completed over before recording another delivery.",

      };

    }



    const strikerParticipantId =

      input.strikerParticipantId ?? snapshot.strikerParticipantId;

    const nonStrikerParticipantId =

      input.nonStrikerParticipantId ?? snapshot.nonStrikerParticipantId;

    const bowlerParticipantId =

      input.bowlerParticipantId ?? snapshot.bowlerParticipantId;



    if (!strikerParticipantId || !nonStrikerParticipantId) {

      return {

        ok: false,

        message: "Choose the incoming batter before recording the next delivery.",

      };

    }



    if (!bowlerParticipantId) {

      return {

        ok: false,

        message: "Choose the next bowler before recording the next delivery.",

      };

    }



    if (

      snapshot.strikerParticipantId &&

      strikerParticipantId !== snapshot.strikerParticipantId

    ) {

      return { ok: false, message: "The selected striker does not match the current innings state." };

    }



    if (

      snapshot.nonStrikerParticipantId &&

      nonStrikerParticipantId !== snapshot.nonStrikerParticipantId

    ) {

      return { ok: false, message: "The selected non-striker does not match the current innings state." };

    }



    if (

      snapshot.bowlerParticipantId &&

      bowlerParticipantId !== snapshot.bowlerParticipantId

    ) {

      return { ok: false, message: "The selected bowler does not match the current innings state." };

    }



    if (

      snapshot.bowlerParticipantId === null &&

      snapshot.previousOverBowlerParticipantId !== null &&

      bowlerParticipantId === snapshot.previousOverBowlerParticipantId

    ) {

      return {

        ok: false,

        message: "The bowler who completed the previous over cannot bowl the next over.",

      };

    }



    const deliveryEventId = crypto.randomUUID();



    await recordDelivery({

      eventId: deliveryEventId,

      scoringSessionId,

      inningsId,

      sequenceKey: snapshot.nextSequenceKey,

      strikerParticipantId,

      nonStrikerParticipantId,

      bowlerParticipantId,

      batRuns: input.batRuns,

      boundary: input.boundary,

      extras: input.extras,

      running:

        input.completedRuns === undefined

          ? undefined

          : {

              completedRuns: input.completedRuns,

            },

      wicket: input.wicket,

    });



    revalidatePath(`/portal/scorer/${scoringSessionId}`);



    return {

      ok: true,

      message: deliveryMessage(input),

      deliveryEventId,

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}



export async function saveDeliveryEnrichmentAction(

  scoringSessionId: string,

  inningsId: string,

  deliveryEventId: string,

  enrichment: DeliveryEnrichment,

): Promise<ScorerActionResult> {

  try {

    if (

      !scoringSessionId.trim() ||

      !inningsId.trim() ||

      !deliveryEventId.trim()

    ) {

      return {

        ok: false,

        message:

          "Scoring session, innings and delivery are required.",

      };

    }



    const { signedIn } = await requireSignedInUser();



    if (!signedIn) {

      return {

        ok: false,

        message: "You must be signed in.",

      };

    }



    await saveDeliveryEnrichment({

      deliveryEventId,

      scoringSessionId,

      inningsId,

      enrichment,

    });



    revalidatePath(`/portal/scorer/${scoringSessionId}`);



    return {

      ok: true,

      message: "Delivery details saved.",

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}

export async function recordBatRunsAction(

  scoringSessionId: string,

  inningsId: string,

  batRuns: BatRuns,

): Promise<ScorerActionResult> {

  return recordScoringDeliveryAction(

    scoringSessionId,

    inningsId,

    { batRuns },

  );

}



export async function confirmIncomingBatterAction(

  scoringSessionId: string,

  inningsId: string,

  batterParticipantId: string,

  end: "STRIKER" | "NON_STRIKER",

): Promise<ScorerActionResult> {

  try {

    const { signedIn } = await requireSignedInUser();



    if (!signedIn) {

      return {

        ok: false,

        message: "You must be signed in.",

      };

    }



    const snapshot = await getScorerSnapshot(inningsId);



    if (snapshot.scoringSessionId !== scoringSessionId) {

      return {

        ok: false,

        message: "This innings does not belong to the scoring session.",

      };

    }



    await recordBatterEntered({

      eventId: crypto.randomUUID(),

      scoringSessionId,

      inningsId,

      sequenceKey: snapshot.nextSequenceKey,

      batterParticipantId,

      end,

    });

    revalidatePath(`/portal/scorer/${scoringSessionId}`);



    return {

      ok: true,

      message: "Batsman confirmed.",

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}



export async function endOverAction(

  scoringSessionId: string,

  inningsId: string,

): Promise<ScorerActionResult> {

  try {

    const { signedIn } = await requireSignedInUser();

    if (!signedIn) return { ok: false, message: "You must be signed in." };



    const snapshot = await getScorerSnapshot(inningsId);

    if (snapshot.scoringSessionId !== scoringSessionId) {

      return { ok: false, message: "The innings does not belong to this scoring session." };

    }

    if (!snapshot.overReadyToEnd) {

      return { ok: false, message: "The current over is not ready to end." };

    }



    await recordOverEnded({

      eventId: crypto.randomUUID(),

      scoringSessionId,

      inningsId,

      sequenceKey: snapshot.nextSequenceKey,

    });



    revalidatePath(`/portal/scorer/${scoringSessionId}`);

    return { ok: true, message: "Over ended. Choose the next bowler." };

  } catch (error) {

    return { ok: false, message: errorMessage(error) };

  }

}



export async function adjustScheduledOversAction(

  scoringSessionId: string,

  inningsId: string,

  scheduledOvers: number,

): Promise<ScorerActionResult> {

  try {

    const { signedIn } = await requireSignedInUser();



    if (!signedIn) {

      return {

        ok: false,

        message: "You must be signed in.",

      };

    }



    if (!Number.isInteger(scheduledOvers) || scheduledOvers <= 0) {

      return {

        ok: false,

        message: "Scheduled overs must be a positive whole number.",

      };

    }



    const snapshot = await getScorerSnapshot(inningsId);



    if (snapshot.scoringSessionId !== scoringSessionId) {

      return {

        ok: false,

        message:

          "The innings does not belong to this scoring session.",

      };

    }



    if (snapshot.inningsStatus !== "InProgress") {

      return {

        ok: false,

        message: "This innings is not currently in progress.",

      };

    }



    const scheduledLegalBalls = scheduledOvers * 6;

    const currentLegalBalls = snapshot.state.legalBalls;



    if (scheduledLegalBalls < currentLegalBalls) {

      const completedOvers = Math.floor(currentLegalBalls / 6);

      const ballsInOver = currentLegalBalls % 6;



      return {

        ok: false,

        message:

          `The revised limit cannot be below the ${completedOvers}.${ballsInOver} overs already bowled.`,

      };

    }



    if (

      snapshot.state.playingConditions.scheduledLegalBalls ===

      scheduledLegalBalls

    ) {

      return {

        ok: false,

        message: `The innings is already scheduled for ${scheduledOvers} overs.`,

      };

    }



    await recordPlayingConditionsChanged({

      eventId: crypto.randomUUID(),

      scoringSessionId,

      inningsId,

      sequenceKey: snapshot.nextSequenceKey,

      scheduledLegalBalls,

      currentLegalBalls,

    });



    revalidatePath(`/portal/scorer/${scoringSessionId}`);



    return {

      ok: true,

      message: `Scheduled overs changed to ${scheduledOvers}.`,

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}



export async function endInningsEarlyAction(

  scoringSessionId: string,

  inningsId: string,

  reason: "DECLARED" | "MANUAL",

): Promise<ScorerActionResult> {

  try {

    const { signedIn } = await requireSignedInUser();



    if (!signedIn) {

      return {

        ok: false,

        message: "You must be signed in.",

      };

    }



    if (reason !== "DECLARED" && reason !== "MANUAL") {

      return {

        ok: false,

        message: "Invalid early innings-end reason.",

      };

    }



    const snapshot = await getScorerSnapshot(inningsId);



    if (snapshot.scoringSessionId !== scoringSessionId) {

      return {

        ok: false,

        message:

          "The innings does not belong to this scoring session.",

      };

    }



    if (snapshot.inningsStatus !== "InProgress") {

      return {

        ok: false,

        message: "This innings is not currently in progress.",

      };

    }



    await recordInningsEnded({

      eventId: crypto.randomUUID(),

      scoringSessionId,

      inningsId,

      sequenceKey: snapshot.nextSequenceKey,

      reason,

    });



    revalidatePath(`/portal/scorer/${scoringSessionId}`);



    return {

      ok: true,

      message:

        reason === "DECLARED"

          ? "Innings declared."

          : "Innings ended early.",

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}



export async function endInningsAction(

  scoringSessionId: string,

  inningsId: string,

): Promise<ScorerActionResult> {

  try {

    const { signedIn } = await requireSignedInUser();



    if (!signedIn) {

      return {

        ok: false,

        message: "You must be signed in.",

      };

    }



    const snapshot = await getScorerSnapshot(inningsId);



    if (snapshot.scoringSessionId !== scoringSessionId) {

      return {

        ok: false,

        message:

          "The innings does not belong to this scoring session.",

      };

    }



    if (snapshot.inningsStatus !== "InProgress") {

      return {

        ok: false,

        message: "This innings is not currently in progress.",

      };

    }



    const recommendation = snapshot.state.endRecommendation;



    if (!recommendation.recommended || !recommendation.reason) {

      return {

        ok: false,

        message:

          "The innings does not currently have a recommended end condition.",

      };

    }



    await recordInningsEnded({

      eventId: crypto.randomUUID(),

      scoringSessionId,

      inningsId,

      sequenceKey: snapshot.nextSequenceKey,

      reason: recommendation.reason,

    });



    revalidatePath(`/portal/scorer/${scoringSessionId}`);



    return {

      ok: true,

      message: "Innings ended.",

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}



export async function completeMatchAction(
  scoringSessionId: string,
  firstInningsId: string,
  secondInningsId: string,
): Promise<ScorerActionResult> {
  try {
    const { signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in.",
      };
    }

    const [firstInningsSnapshot, secondInningsSnapshot] =
      await Promise.all([
        getScorerSnapshot(firstInningsId),
        getScorerSnapshot(secondInningsId),
      ]);

    if (
      firstInningsSnapshot.scoringSessionId !== scoringSessionId ||
      secondInningsSnapshot.scoringSessionId !== scoringSessionId
    ) {
      return {
        ok: false,
        message: "Both innings must belong to this scoring session.",
      };
    }

    if (
      firstInningsSnapshot.inningsStatus !== "Completed" ||
      secondInningsSnapshot.inningsStatus !== "Completed"
    ) {
      return {
        ok: false,
        message: "Both innings must be completed before completing the match.",
      };
    }

    const supabase = await createClient();

    const { data: inningsData, error: inningsError } = await supabase
      .from("scoring_innings")
      .select("innings_id,batting_side_id,bowling_side_id")
      .in("innings_id", [firstInningsId, secondInningsId]);

    if (inningsError) {
      return {
        ok: false,
        message: `Unable to load match innings: ${inningsError.message}`,
      };
    }

    const firstInnings = inningsData?.find(
      (innings) => innings.innings_id === firstInningsId,
    );

    const secondInnings = inningsData?.find(
      (innings) => innings.innings_id === secondInningsId,
    );

    if (!firstInnings || !secondInnings) {
      return {
        ok: false,
        message: "Unable to load both completed innings.",
      };
    }

    const matchState = deriveMatchState([
      {
        battingSideId: firstInnings.batting_side_id,
        bowlingSideId: firstInnings.bowling_side_id,
        runs: firstInningsSnapshot.runs,
        wickets: firstInningsSnapshot.wickets,
        completed: true,
      },
      {
        battingSideId: secondInnings.batting_side_id,
        bowlingSideId: secondInnings.bowling_side_id,
        runs: secondInningsSnapshot.runs,
        wickets: secondInningsSnapshot.wickets,
        completed: true,
      },
    ]);

    if (!matchState.completed || !matchState.result) {
      return {
        ok: false,
        message: "The completed innings did not produce a valid match result.",
      };
    }

    if (matchState.result.type === "ABANDONED") {
      return {
        ok: false,
        message: "Abandoned-match completion is not supported by this flow.",
      };
    }

    if (
      matchState.result.type === "WIN" &&
      matchState.result.method === "RUNS"
    ) {
      await publishCompletedAppScorerMatch({
        scoringSessionId,
        firstInningsId,
        secondInningsId,
        result: {
          resultType: "WIN",
          winnerSideId: matchState.result.winnerSideId,
          loserSideId: matchState.result.loserSideId,
          winMethod: "RUNS",
          runMargin: matchState.result.runMargin!,
          wicketMargin: null,
          abandonmentReason: null,
        },
      });
    } else if (
      matchState.result.type === "WIN" &&
      matchState.result.method === "CHASE"
    ) {
      await publishCompletedAppScorerMatch({
        scoringSessionId,
        firstInningsId,
        secondInningsId,
        result: {
          resultType: "WIN",
          winnerSideId: matchState.result.winnerSideId,
          loserSideId: matchState.result.loserSideId,
          winMethod: "CHASE",
          runMargin: null,
          wicketMargin: matchState.result.wicketMargin!,
          abandonmentReason: null,
        },
      });
    } else {
      await publishCompletedAppScorerMatch({
        scoringSessionId,
        firstInningsId,
        secondInningsId,
        result: {
          resultType: "TIE",
          winnerSideId: null,
          loserSideId: null,
          winMethod: null,
          runMargin: null,
          wicketMargin: null,
          abandonmentReason: null,
        },
      });
    }

    revalidatePath(`/portal/scorer/${scoringSessionId}`);

    return {
      ok: true,
      message: "Match completed and published.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function abandonMatchAction(

  scoringSessionId: string,

  abandonmentReason: string,

): Promise<ScorerActionResult> {

  try {

    const reason = abandonmentReason.trim();



    if (!reason) {

      return {

        ok: false,

        message: "Enter a reason for abandoning the match.",

      };

    }



    await abandonAppScorerMatch(scoringSessionId, reason);



    revalidatePath(`/portal/scorer/${scoringSessionId}`);



    return {

      ok: true,

      message: "Match abandoned.",

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}



export async function startSecondInningsAction(

  scoringSessionId: string,

  firstInningsId: string,

  strikerParticipantId: string,

  nonStrikerParticipantId: string,

  bowlerParticipantId: string,

): Promise<ScorerActionResult> {

  try {

    if (

      !strikerParticipantId ||

      !nonStrikerParticipantId ||

      !bowlerParticipantId

    ) {

      return {

        ok: false,

        message:

          "Choose the striker, non-striker and opening bowler.",

      };

    }



    if (strikerParticipantId === nonStrikerParticipantId) {

      return {

        ok: false,

        message:

          "Striker and non-striker must be different players.",

      };

    }



    const { signedIn } = await requireSignedInUser();



    if (!signedIn) {

      return {

        ok: false,

        message: "You must be signed in.",

      };

    }



    const firstInningsSnapshot =

      await getScorerSnapshot(firstInningsId);



    if (

      firstInningsSnapshot.scoringSessionId !==

      scoringSessionId

    ) {

      return {

        ok: false,

        message:

          "The innings does not belong to this scoring session.",

      };

    }



    if (firstInningsSnapshot.inningsStatus !== "Completed") {

      return {

        ok: false,

        message:

          "The first innings must be completed before the second innings can start.",

      };

    }



    const supabase = await createClient();



    const { data, error } = await supabase.rpc(

      "start_app_scorer_second_innings",

      {

        target_scoring_session_id: scoringSessionId,

        target_striker_participant_id:

          strikerParticipantId,

        target_non_striker_participant_id:

          nonStrikerParticipantId,

        target_bowler_participant_id:

          bowlerParticipantId,

        target_first_innings_runs:

          firstInningsSnapshot.runs,

      },

    );



    if (error) {

      return {

        ok: false,

        message: error.message,

      };

    }



    if (typeof data !== "string" || !data) {

      return {

        ok: false,

        message:

          "No second-innings ID was returned.",

      };

    }



    revalidatePath(

      `/portal/scorer/${scoringSessionId}`,

    );



    return {

      ok: true,

      message: "Second innings started.",

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}



export async function undoLastBallAction(

  scoringSessionId: string,

  inningsId: string,

): Promise<ScorerActionResult> {

  try {

    const { signedIn } = await requireSignedInUser();

    if (!signedIn) return { ok: false, message: "You must be signed in." };



    const snapshot = await getScorerSnapshot(inningsId);

    if (snapshot.scoringSessionId !== scoringSessionId) {

      return { ok: false, message: "The innings does not belong to this scoring session." };

    }



    await undoLastBall({

      correctionGroupId: crypto.randomUUID(),

      scoringSessionId,

      inningsId,

    });



    revalidatePath(`/portal/scorer/${scoringSessionId}`);

    return { ok: true, message: "Last ball undone." };

  } catch (error) {

    return { ok: false, message: errorMessage(error) };

  }

}



export async function startBreakAction(

  scoringSessionId: string,

  inningsId: string,

  reason: BreakReason,

  note?: string,

): Promise<ScorerActionResult> {

  try {

    const snapshot = await getScorerSnapshot(inningsId);



    if (snapshot.state.break.active) {

      return {

        ok: false,

        message: "A break is already in progress.",

      };

    }



    await recordBreakStarted({

      eventId: crypto.randomUUID(),

      scoringSessionId,

      inningsId,

      sequenceKey: snapshot.nextSequenceKey,

      reason,

      note,

    });



    revalidatePath(`/portal/scorer/${scoringSessionId}`);



    return {

      ok: true,

      message: "Break started.",

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}



export async function resumePlayAction(

  scoringSessionId: string,

  inningsId: string,

): Promise<ScorerActionResult> {

  try {

    const snapshot = await getScorerSnapshot(inningsId);



    if (!snapshot.state.break.active) {

      return {

        ok: false,

        message: "There is no active break to end.",

      };

    }



    await recordBreakEnded({

      eventId: crypto.randomUUID(),

      scoringSessionId,

      inningsId,

      sequenceKey: snapshot.nextSequenceKey,

    });



    revalidatePath(`/portal/scorer/${scoringSessionId}`);



    return {

      ok: true,

      message: "Play resumed.",

    };

  } catch (error) {

    return {

      ok: false,

      message: errorMessage(error),

    };

  }

}



export async function addLiveOppositionPlayerAction(

  scoringSessionId: string,

  displayName: string,

): Promise<ScorerActionResult> {

  try {

    const normalisedName = displayName.trim();

    if (!normalisedName) {

      return { ok: false, message: "Enter the opposition player's name." };

    }



    const { signedIn } = await requireSignedInUser();

    if (!signedIn) return { ok: false, message: "You must be signed in." };



    const supabase = await createClient();



    const { error } = await supabase.rpc(

      "add_app_scorer_opposition_player",

      {

        target_scoring_session_id: scoringSessionId,

        target_display_name: normalisedName,

      },

    );



    if (error) return { ok: false, message: error.message };



    revalidatePath(`/portal/scorer/${scoringSessionId}`);

    return { ok: true, message: `${normalisedName} added to the opposition squad.` };

  } catch (error) {

    return { ok: false, message: errorMessage(error) };

  }

}
