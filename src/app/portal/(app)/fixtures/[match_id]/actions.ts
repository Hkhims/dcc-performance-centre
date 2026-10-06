"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type AvailabilityActionResult = {
  ok: boolean;
  message: string;
};

type AvailabilityStatus = "Available" | "Unavailable";

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

function isAvailabilityStatus(
  value: string,
): value is AvailabilityStatus {
  return value === "Available" || value === "Unavailable";
}

async function requireSignedInUser() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return {
      supabase,
      signedIn: false,
    };
  }

  return {
    supabase,
    signedIn: true,
  };
}

function revalidateFixture(matchId: string) {
  revalidatePath(`/portal/fixtures/${matchId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/cricket");
}

export async function setMyMatchAvailability(
  matchId: string,
  pollId: number,
  availabilityStatus: AvailabilityStatus,
): Promise<AvailabilityActionResult> {
  try {
    if (
      !matchId.trim() ||
      !Number.isInteger(pollId) ||
      pollId <= 0 ||
      !isAvailabilityStatus(availabilityStatus)
    ) {
      return {
        ok: false,
        message: "A valid availability response is required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message:
          "You must be signed in to update your availability.",
      };
    }

    const { error } = await supabase.rpc(
      "set_my_match_availability",
      {
        target_poll_id: pollId,
        target_availability_status: availabilityStatus,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateFixture(matchId);

    return {
      ok: true,
      message:
        availabilityStatus === "Available"
          ? "You are marked as available."
          : "You are marked as unavailable.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function clearMyMatchAvailability(
  matchId: string,
  pollId: number,
): Promise<AvailabilityActionResult> {
  try {
    if (
      !matchId.trim() ||
      !Number.isInteger(pollId) ||
      pollId <= 0
    ) {
      return {
        ok: false,
        message: "A valid availability poll is required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message:
          "You must be signed in to update your availability.",
      };
    }

    const { error } = await supabase.rpc(
      "clear_my_match_availability",
      {
        target_poll_id: pollId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateFixture(matchId);

    return {
      ok: true,
      message: "Your availability is now Not Responded.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}