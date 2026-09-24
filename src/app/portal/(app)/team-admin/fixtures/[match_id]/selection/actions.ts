"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SelectionActionResult = {
  ok: boolean;
  message: string;
  selectionId?: number;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

function revalidateSelection(matchId: string) {
  revalidatePath(
    `/portal/team-admin/fixtures/${matchId}/selection`,
  );
  revalidatePath("/portal/team-admin");
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

export async function createMatchSelection(
  matchId: string,
  teamId: string,
): Promise<SelectionActionResult> {
  try {
    if (!matchId.trim() || !teamId.trim()) {
      return {
        ok: false,
        message: "Match and team are required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in.",
      };
    }

    const { data, error } = await supabase.rpc(
      "create_match_selection",
      {
        target_match_id: matchId,
        target_team_id: teamId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateSelection(matchId);

    return {
      ok: true,
      message: "Team selection started successfully.",
      selectionId: Number(data),
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function addPlayerToSelection(
  matchId: string,
  selectionId: number,
  playerId: string,
): Promise<SelectionActionResult> {
  try {
    if (
      !matchId.trim() ||
      !Number.isInteger(selectionId) ||
      selectionId <= 0 ||
      !playerId.trim()
    ) {
      return {
        ok: false,
        message: "A valid selection and player are required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in.",
      };
    }

    const { error } = await supabase.rpc(
      "add_player_to_match_selection",
      {
        target_selection_id: selectionId,
        target_player_id: playerId,
        target_batting_position: null,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateSelection(matchId);

    return {
      ok: true,
      message: "Player added to the selection.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function removePlayerFromSelection(
  matchId: string,
  selectionId: number,
  playerId: string,
): Promise<SelectionActionResult> {
  try {
    if (
      !matchId.trim() ||
      !Number.isInteger(selectionId) ||
      selectionId <= 0 ||
      !playerId.trim()
    ) {
      return {
        ok: false,
        message: "A valid selection and player are required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in.",
      };
    }

    const { error } = await supabase.rpc(
      "remove_player_from_match_selection",
      {
        target_selection_id: selectionId,
        target_player_id: playerId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateSelection(matchId);

    return {
      ok: true,
      message: "Player removed from the selection.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function setSelectionBattingPosition(
  matchId: string,
  selectionId: number,
  playerId: string,
  battingPosition: number | null,
): Promise<SelectionActionResult> {
  try {
    if (
      !matchId.trim() ||
      !Number.isInteger(selectionId) ||
      selectionId <= 0 ||
      !playerId.trim() ||
      (battingPosition !== null &&
        (!Number.isInteger(battingPosition) ||
          battingPosition < 1))
    ) {
      return {
        ok: false,
        message: "A valid batting position is required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in.",
      };
    }

    const { error } = await supabase.rpc(
      "set_match_selection_batting_position",
      {
        target_selection_id: selectionId,
        target_player_id: playerId,
        target_batting_position: battingPosition,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateSelection(matchId);

    return {
      ok: true,
      message: "Batting position updated.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function setSelectionCaptain(
  matchId: string,
  selectionId: number,
  playerId: string,
): Promise<SelectionActionResult> {
  try {
    if (
      !matchId.trim() ||
      !Number.isInteger(selectionId) ||
      selectionId <= 0 ||
      !playerId.trim()
    ) {
      return {
        ok: false,
        message: "A valid captain is required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in.",
      };
    }

    const { error } = await supabase.rpc(
      "set_match_selection_captain",
      {
        target_selection_id: selectionId,
        target_player_id: playerId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateSelection(matchId);

    return {
      ok: true,
      message: "Captain updated.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function setSelectionWicketkeeper(
  matchId: string,
  selectionId: number,
  playerId: string,
): Promise<SelectionActionResult> {
  try {
    if (
      !matchId.trim() ||
      !Number.isInteger(selectionId) ||
      selectionId <= 0 ||
      !playerId.trim()
    ) {
      return {
        ok: false,
        message: "A valid wicketkeeper is required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in.",
      };
    }

    const { error } = await supabase.rpc(
      "set_match_selection_wicketkeeper",
      {
        target_selection_id: selectionId,
        target_player_id: playerId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateSelection(matchId);

    return {
      ok: true,
      message: "Wicketkeeper updated.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function publishMatchSelection(
  matchId: string,
  selectionId: number,
): Promise<SelectionActionResult> {
  try {
    if (
      !matchId.trim() ||
      !Number.isInteger(selectionId) ||
      selectionId <= 0
    ) {
      return {
        ok: false,
        message: "A valid selection is required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in.",
      };
    }

    const { error } = await supabase.rpc(
      "publish_match_selection",
      {
        target_selection_id: selectionId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateSelection(matchId);

    return {
      ok: true,
      message: "Team selection published successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function reopenMatchSelection(
  matchId: string,
  selectionId: number,
): Promise<SelectionActionResult> {
  try {
    if (
      !matchId.trim() ||
      !Number.isInteger(selectionId) ||
      selectionId <= 0
    ) {
      return {
        ok: false,
        message: "A valid selection is required.",
      };
    }

    const { supabase, signedIn } = await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message: "You must be signed in.",
      };
    }

    const { error } = await supabase.rpc(
      "reopen_match_selection",
      {
        target_selection_id: selectionId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateSelection(matchId);

    return {
      ok: true,
      message: "Team selection returned to Draft.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}