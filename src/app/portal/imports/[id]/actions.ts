"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ReviewActionResult = {
  ok: boolean;
  message: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

export async function approveMatchImport(
  matchImportId: number,
  reviewNotes: string,
): Promise<ReviewActionResult> {
  try {
    if (!Number.isInteger(matchImportId) || matchImportId <= 0) {
      return {
        ok: false,
        message: "Invalid match import ID.",
      };
    }

    const supabase = await createClient();

    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (claimsError || !claimsData?.claims?.sub) {
      return {
        ok: false,
        message: "You must be signed in to approve a match import.",
      };
    }

    const cleanedNotes = reviewNotes.trim();

    const { error } = await supabase.rpc("approve_match_import", {
      target_match_import_id: matchImportId,
      target_review_notes: cleanedNotes || null,
    });

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidatePath("/portal/imports");
    revalidatePath(`/portal/imports/${matchImportId}`);

    return {
      ok: true,
      message: "Match import approved successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function rejectMatchImport(
  matchImportId: number,
  rejectionReason: string,
): Promise<ReviewActionResult> {
  try {
    if (!Number.isInteger(matchImportId) || matchImportId <= 0) {
      return {
        ok: false,
        message: "Invalid match import ID.",
      };
    }

    const cleanedReason = rejectionReason.trim();

    if (!cleanedReason) {
      return {
        ok: false,
        message: "A rejection reason is required.",
      };
    }

    const supabase = await createClient();

    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (claimsError || !claimsData?.claims?.sub) {
      return {
        ok: false,
        message: "You must be signed in to reject a match import.",
      };
    }

    const { error } = await supabase.rpc("reject_match_import", {
      target_match_import_id: matchImportId,
      target_review_notes: cleanedReason,
    });

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidatePath("/portal/imports");
    revalidatePath(`/portal/imports/${matchImportId}`);

    return {
      ok: true,
      message: "Match import rejected successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}