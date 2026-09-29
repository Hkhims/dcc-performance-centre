"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SetupActionResult = { ok: boolean; message: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function revalidateSetup(scoringSessionId: string) {
  revalidatePath(`/portal/scorer/${scoringSessionId}/setup`);
}

async function requireActiveUser() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return { supabase, ok: false as const, message: "You must be signed in." };
  }

  const { data: accessData, error: accessError } =
    await supabase.rpc("get_my_portal_access");

  if (accessError) {
    return {
      supabase,
      ok: false as const,
      message: `Unable to load Portal access: ${accessError.message}`,
    };
  }

  const access = accessData?.[0] ?? null;

  if (!access || access.account_status !== "Active") {
    return {
      supabase,
      ok: false as const,
      message: "Your Portal account is not active.",
    };
  }

  return { supabase, ok: true as const };
}

export async function setDccParticipantStatusAction(
  scoringSessionId: string,
  matchParticipantId: string,
  participationStatus: "AVAILABLE" | "REMOVED",
): Promise<SetupActionResult> {
  try {
    if (!scoringSessionId || !matchParticipantId) {
      return { ok: false, message: "Participant details are incomplete." };
    }

    const auth = await requireActiveUser();
    if (!auth.ok) return { ok: false, message: auth.message };

    const { error } = await auth.supabase.rpc(
      "set_app_scorer_dcc_participant_status",
      {
        target_scoring_session_id: scoringSessionId,
        target_match_participant_id: matchParticipantId,
        target_participation_status: participationStatus,
      },
    );

    if (error) return { ok: false, message: error.message };

    revalidateSetup(scoringSessionId);
    return {
      ok: true,
      message:
        participationStatus === "REMOVED"
          ? "Player removed from the match-day squad."
          : "Player restored to the match-day squad.",
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}


export async function addDccPlayerAction(
  scoringSessionId: string,
  dccPlayerId: string,
): Promise<SetupActionResult> {
  try {
    if (!scoringSessionId || !dccPlayerId) {
      return { ok: false, message: "Choose a DCC player to add." };
    }

    const auth = await requireActiveUser();
    if (!auth.ok) return { ok: false, message: auth.message };

    const { error } = await auth.supabase.rpc("add_app_scorer_dcc_player", {
      target_scoring_session_id: scoringSessionId,
      target_dcc_player_id: dccPlayerId,
    });

    if (error) return { ok: false, message: error.message };

    revalidateSetup(scoringSessionId);
    return { ok: true, message: "DCC player added to the match-day squad." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function setOppositionParticipantStatusAction(
  scoringSessionId: string,
  matchParticipantId: string,
  participationStatus: "AVAILABLE" | "REMOVED",
): Promise<SetupActionResult> {
  try {
    if (!scoringSessionId || !matchParticipantId) {
      return { ok: false, message: "Participant details are incomplete." };
    }

    const auth = await requireActiveUser();
    if (!auth.ok) return { ok: false, message: auth.message };

    const { error } = await auth.supabase.rpc(
      "set_app_scorer_opposition_participant_status",
      {
        target_scoring_session_id: scoringSessionId,
        target_match_participant_id: matchParticipantId,
        target_participation_status: participationStatus,
      },
    );

    if (error) return { ok: false, message: error.message };

    revalidateSetup(scoringSessionId);
    return {
      ok: true,
      message:
        participationStatus === "REMOVED"
          ? "Opposition player removed from the match-day squad."
          : "Opposition player restored to the match-day squad.",
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function addOppositionPlayerAction(
  scoringSessionId: string,
  displayName: string,
): Promise<SetupActionResult> {
  try {
    const normalisedName = displayName.trim();
    if (!normalisedName) {
      return { ok: false, message: "Enter the opposition player's name." };
    }

    const auth = await requireActiveUser();
    if (!auth.ok) return { ok: false, message: auth.message };

    const { error } = await auth.supabase.rpc(
      "add_app_scorer_opposition_player",
      {
        target_scoring_session_id: scoringSessionId,
        target_display_name: normalisedName,
      },
    );

    if (error) return { ok: false, message: error.message };

    revalidateSetup(scoringSessionId);
    return { ok: true, message: `${normalisedName} added.` };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function setTossAction(
  scoringSessionId: string,
  tossWinnerSideId: string,
  tossDecision: "Bat" | "Bowl",
): Promise<SetupActionResult> {
  try {
    if (!tossWinnerSideId) {
      return { ok: false, message: "Choose the toss winner." };
    }

    const auth = await requireActiveUser();
    if (!auth.ok) return { ok: false, message: auth.message };

    const { error } = await auth.supabase.rpc("set_app_scorer_toss", {
      target_scoring_session_id: scoringSessionId,
      target_toss_winner_side_id: tossWinnerSideId,
      target_toss_decision: tossDecision,
    });

    if (error) return { ok: false, message: error.message };

    revalidateSetup(scoringSessionId);
    return { ok: true, message: "Toss recorded." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function startInningsAction(
  scoringSessionId: string,
  strikerParticipantId: string,
  nonStrikerParticipantId: string,
  bowlerParticipantId: string,
  scheduledOvers: number,
): Promise<SetupActionResult> {
  try {
    if (!strikerParticipantId || !nonStrikerParticipantId || !bowlerParticipantId) {
      return {
        ok: false,
        message: "Choose the striker, non-striker and opening bowler.",
      };
    }

    if (strikerParticipantId === nonStrikerParticipantId) {
      return {
        ok: false,
        message: "Striker and non-striker must be different players.",
      };
    }

    if (!Number.isInteger(scheduledOvers) || scheduledOvers <= 0 || scheduledOvers > 100) {
      return {
        ok: false,
        message: "Scheduled overs must be a whole number between 1 and 100.",
      };
    }

    const auth = await requireActiveUser();
    if (!auth.ok) return { ok: false, message: auth.message };

    const [
      { data: sideRows, error: sideError },
      { data: participantRows, error: participantError },
    ] = await Promise.all([
      auth.supabase
        .from("match_sides")
        .select("side_id,display_name")
        .eq("scoring_session_id", scoringSessionId),
      auth.supabase
        .from("match_participants")
        .select("side_id,participant_role,participation_status")
        .eq("scoring_session_id", scoringSessionId),
    ]);

    if (sideError) return { ok: false, message: sideError.message };
    if (participantError) return { ok: false, message: participantError.message };

    for (const side of sideRows ?? []) {
      const activeCount = (participantRows ?? []).filter(
        (participant) =>
          participant.side_id === side.side_id &&
          participant.participant_role === "PLAYING" &&
          participant.participation_status !== "REMOVED",
      ).length;

      if (activeCount < 8 || activeCount > 15) {
        return {
          ok: false,
          message: `${side.display_name} must have between 8 and 15 match-day players before the innings can start. Current squad: ${activeCount}.`,
        };
      }
    }

    const { data, error } = await auth.supabase.rpc(
      "start_app_scorer_innings",
      {
        target_scoring_session_id: scoringSessionId,
        target_striker_participant_id: strikerParticipantId,
        target_non_striker_participant_id: nonStrikerParticipantId,
        target_bowler_participant_id: bowlerParticipantId,
        target_scheduled_balls: scheduledOvers * 6,
      },
    );

    if (error) return { ok: false, message: error.message };

    if (typeof data !== "string" || !data) {
      return { ok: false, message: "No innings ID was returned." };
    }

    revalidatePath(`/portal/scorer/${scoringSessionId}`);
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }

  redirect(`/portal/scorer/${scoringSessionId}`);
}
