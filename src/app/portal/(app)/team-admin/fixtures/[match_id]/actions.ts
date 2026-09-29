"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type StartMatchActionResult = {
  ok: boolean;
  message: string;
  scoringSessionId?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong.";
}

async function requireSignedInUser() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  return {
    supabase,
    signedIn:
      !claimsError && Boolean(claimsData?.claims?.sub),
  };
}

export async function startAppScorerMatch(
  matchId: string,
): Promise<StartMatchActionResult> {
  try {
    if (!matchId.trim()) {
      return { ok: false, message: "A valid match is required." };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return { ok: false, message: "You must be signed in." };
    }

    const { data, error } = await supabase.rpc(
      "start_app_scorer_match",
      { target_match_id: matchId },
    );

    if (error) {
      return { ok: false, message: error.message };
    }

    if (typeof data !== "string" || !data.trim()) {
      return {
        ok: false,
        message: "App Scorer did not return a scoring session ID.",
      };
    }

    revalidatePath(`/portal/team-admin/fixtures/${matchId}`);

    return {
      ok: true,
      message: "Match-day scoring session is ready.",
      scoringSessionId: data,
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}
