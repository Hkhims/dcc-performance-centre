"use server";

import { revalidatePath } from "next/cache";
import {
  getScorerSnapshot,
  recordDelivery,
} from "@/lib/app-scorer/scoring-service";
import { createClient } from "@/lib/supabase/server";

type ScorerActionResult = {
  ok: boolean;
  message: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
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

export async function recordBatRunsAction(
  scoringSessionId: string,
  inningsId: string,
  batRuns: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): Promise<ScorerActionResult> {
  try {
    if (!scoringSessionId.trim() || !inningsId.trim()) {
      return {
        ok: false,
        message: "Scoring session and innings are required.",
      };
    }

    if (![0, 1, 2, 3, 4, 5, 6].includes(batRuns)) {
      return {
        ok: false,
        message: "Invalid bat-runs value.",
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

    if (snapshot.overReadyToEnd) {
      return {
        ok: false,
        message:
          "End the completed over before recording another delivery.",
      };
    }

    await recordDelivery({
      eventId: crypto.randomUUID(),
      scoringSessionId,
      inningsId,
      sequenceKey: snapshot.nextSequenceKey,
      strikerParticipantId:
        snapshot.strikerParticipantId,
      nonStrikerParticipantId:
        snapshot.nonStrikerParticipantId,
      bowlerParticipantId:
        snapshot.bowlerParticipantId,
      batRuns,
    });

    revalidatePath(
      `/portal/scorer/${scoringSessionId}`,
    );

    return {
      ok: true,
      message: `${batRuns} run${batRuns === 1 ? "" : "s"} recorded.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}
