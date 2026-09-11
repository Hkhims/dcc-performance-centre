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

function revalidateImport(matchImportId: number) {
  revalidatePath("/portal/imports");
  revalidatePath(`/portal/imports/${matchImportId}`);
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

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
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

    revalidateImport(matchImportId);

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

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
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

    revalidateImport(matchImportId);

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

export async function createMatchImportCorrection(
  matchImportId: number,
  entityType: string,
  entityKey: string,
  fieldName: string,
  jsonPath: string[],
  originalValue: unknown,
  correctedValue: unknown,
  reason: string,
): Promise<ReviewActionResult> {
  try {
    if (!Number.isInteger(matchImportId) || matchImportId <= 0) {
      return {
        ok: false,
        message: "Invalid match import ID.",
      };
    }

    const cleanedEntityType = entityType.trim();
    const cleanedEntityKey = entityKey.trim();
    const cleanedFieldName = fieldName.trim();
    const cleanedReason = reason.trim();

    if (!cleanedEntityType) {
      return {
        ok: false,
        message: "Correction entity type is required.",
      };
    }

    if (!cleanedEntityKey) {
      return {
        ok: false,
        message: "Correction entity key is required.",
      };
    }

    if (!cleanedFieldName) {
      return {
        ok: false,
        message: "Correction field name is required.",
      };
    }

    if (
      !Array.isArray(jsonPath) ||
      jsonPath.length === 0 ||
      jsonPath.some(
        (segment) =>
          typeof segment !== "string" ||
          segment.trim().length === 0,
      )
    ) {
      return {
        ok: false,
        message: "A valid correction JSON path is required.",
      };
    }

    if (correctedValue === null || correctedValue === undefined) {
      return {
        ok: false,
        message: "A corrected value is required.",
      };
    }

    if (!cleanedReason) {
      return {
        ok: false,
        message: "A correction reason is required.",
      };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in to record a correction.",
      };
    }

    const { error } = await supabase.rpc(
      "create_match_import_correction",
      {
        target_match_import_id: matchImportId,
        target_entity_type: cleanedEntityType,
        target_entity_key: cleanedEntityKey,
        target_field_name: cleanedFieldName,
        target_json_path: jsonPath,
        target_original_value: originalValue,
        target_corrected_value: correctedValue,
        target_reason: cleanedReason,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateImport(matchImportId);

    return {
      ok: true,
      message: "Correction recorded successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function supersedeMatchImportCorrection(
  matchImportId: number,
  correctionId: number,
  correctedValue: unknown,
  reason: string,
): Promise<ReviewActionResult> {
  try {
    if (!Number.isInteger(matchImportId) || matchImportId <= 0) {
      return {
        ok: false,
        message: "Invalid match import ID.",
      };
    }

    if (!Number.isInteger(correctionId) || correctionId <= 0) {
      return {
        ok: false,
        message: "Invalid correction ID.",
      };
    }

    if (correctedValue === null || correctedValue === undefined) {
      return {
        ok: false,
        message: "A corrected value is required.",
      };
    }

    const cleanedReason = reason.trim();

    if (!cleanedReason) {
      return {
        ok: false,
        message: "A correction reason is required.",
      };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in to replace a correction.",
      };
    }

    const { error } = await supabase.rpc(
      "supersede_match_import_correction",
      {
        target_correction_id: correctionId,
        target_corrected_value: correctedValue,
        target_reason: cleanedReason,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateImport(matchImportId);

    return {
      ok: true,
      message: "Correction replaced successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function resolveMatchImportCorrection(
  matchImportId: number,
  correctionId: number,
  reason: string,
): Promise<ReviewActionResult> {
  try {
    if (!Number.isInteger(matchImportId) || matchImportId <= 0) {
      return {
        ok: false,
        message: "Invalid match import ID.",
      };
    }

    if (!Number.isInteger(correctionId) || correctionId <= 0) {
      return {
        ok: false,
        message: "Invalid correction ID.",
      };
    }

    const cleanedReason = reason.trim();

    if (!cleanedReason) {
      return {
        ok: false,
        message: "A resolution reason is required.",
      };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in to resolve a correction.",
      };
    }

    const { error } = await supabase.rpc(
      "resolve_match_import_correction",
      {
        target_correction_id: correctionId,
        target_reason: cleanedReason,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateImport(matchImportId);

    return {
      ok: true,
      message: "Correction resolved successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}
