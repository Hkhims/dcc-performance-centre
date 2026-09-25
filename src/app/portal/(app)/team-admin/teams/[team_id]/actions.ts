"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type TeamAdminActionResult = {
  ok: boolean;
  message: string;
  matchId?: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

function revalidateTeamPage(teamId: string) {
  revalidatePath("/portal/team-admin");
  revalidatePath(`/portal/team-admin/teams/${teamId}`);
}

function revalidateFixtureManagement(
  teamId: string,
  matchId?: string,
) {
  revalidateTeamPage(teamId);

  if (matchId) {
    revalidatePath(`/portal/team-admin/fixtures/${matchId}`);
    revalidatePath(
      `/portal/team-admin/fixtures/${matchId}/selection`,
    );
  }
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

export async function addPlayerToTeam(
  teamId: string,
  playerId: string,
): Promise<TeamAdminActionResult> {
  try {
    const cleanedTeamId = teamId.trim();
    const cleanedPlayerId = playerId.trim();

    if (!cleanedTeamId) {
      return {
        ok: false,
        message: "Invalid team ID.",
      };
    }

    if (!cleanedPlayerId) {
      return {
        ok: false,
        message: "A player is required.",
      };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message:
          "You must be signed in to manage team players.",
      };
    }

    const { error } = await supabase.rpc(
      "add_player_to_team",
      {
        target_team_id: cleanedTeamId,
        target_player_id: cleanedPlayerId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateTeamPage(cleanedTeamId);

    return {
      ok: true,
      message: "Player added to the team successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function removePlayerFromTeam(
  teamId: string,
  playerId: string,
): Promise<TeamAdminActionResult> {
  try {
    const cleanedTeamId = teamId.trim();
    const cleanedPlayerId = playerId.trim();

    if (!cleanedTeamId) {
      return {
        ok: false,
        message: "Invalid team ID.",
      };
    }

    if (!cleanedPlayerId) {
      return {
        ok: false,
        message: "A player is required.",
      };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message:
          "You must be signed in to manage team players.",
      };
    }

    const { error } = await supabase.rpc(
      "remove_player_from_team",
      {
        target_team_id: cleanedTeamId,
        target_player_id: cleanedPlayerId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateTeamPage(cleanedTeamId);

    return {
      ok: true,
      message: "Player from the team successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function createAdHocTeamMatch(
  teamId: string,
  season: number,
  matchDate: string,
  startDateTime: string | null,
  fixtureLabel: string,
  statsCategory: "Friendly" | "Warm-up",
  opponentDisplayName: string,
  venueName: string,
  homeAway: "Home" | "Away" | "Neutral" | "",
): Promise<TeamAdminActionResult> {
  try {
    const cleanedTeamId = teamId.trim();
    const cleanedMatchDate = matchDate.trim();
    const cleanedStartDateTime =
      startDateTime?.trim() || null;
    const cleanedFixtureLabel = fixtureLabel.trim();
    const cleanedOpponentDisplayName =
      opponentDisplayName.trim();
    const cleanedVenueName = venueName.trim();
    const cleanedHomeAway = homeAway.trim();

    if (!cleanedTeamId) {
      return {
        ok: false,
        message: "Invalid team ID.",
      };
    }

    if (!Number.isInteger(season) || season <= 0) {
      return {
        ok: false,
        message: "A valid season is required.",
      };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanedMatchDate)) {
      return {
        ok: false,
        message: "A valid match date is required.",
      };
    }

    if (!cleanedFixtureLabel) {
      return {
        ok: false,
        message: "A fixture label is required.",
      };
    }

    if (
      statsCategory !== "Friendly" &&
      statsCategory !== "Warm-up"
    ) {
      return {
        ok: false,
        message:
          "Ad-hoc team matches must be Friendly or Warm-up.",
      };
    }

    if (!cleanedOpponentDisplayName) {
      return {
        ok: false,
        message: "An opponent name is required.",
      };
    }

    if (
      cleanedHomeAway &&
      !["Home", "Away", "Neutral"].includes(
        cleanedHomeAway,
      )
    ) {
      return {
        ok: false,
        message:
          "Home/away must be Home, Away or Neutral.",
      };
    }

    if (
      cleanedStartDateTime &&
      Number.isNaN(
        new Date(cleanedStartDateTime).getTime(),
      )
    ) {
      return {
        ok: false,
        message: "The supplied start time is invalid.",
      };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message:
          "You must be signed in to create a match.",
      };
    }

    const { data, error } = await supabase.rpc(
      "create_ad_hoc_dcc_match",
      {
        target_team_id: cleanedTeamId,
        target_season: season,
        target_match_date: cleanedMatchDate,
        target_start_datetime: cleanedStartDateTime,
        target_fixture_label: cleanedFixtureLabel,
        target_stats_category: statsCategory,
        target_opponent_display_name:
          cleanedOpponentDisplayName,
        target_venue_name: cleanedVenueName || null,
        target_home_away: cleanedHomeAway || null,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    const matchId =
      typeof data === "string" ? data : null;

    if (!matchId) {
      return {
        ok: false,
        message:
          "The match was created but no match ID was returned.",
      };
    }

    revalidateFixtureManagement(
      cleanedTeamId,
      matchId,
    );

    return {
      ok: true,
      message: "Match created successfully.",
      matchId,
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function openTeamMatchAvailability(
  matchId: string,
  teamId: string,
): Promise<TeamAdminActionResult> {
  try {
    const cleanedMatchId = matchId.trim();
    const cleanedTeamId = teamId.trim();

    if (!cleanedMatchId) {
      return {
        ok: false,
        message: "Invalid match ID.",
      };
    }

    if (!cleanedTeamId) {
      return {
        ok: false,
        message: "Invalid team ID.",
      };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message:
          "You must be signed in to open match availability.",
      };
    }

    const { error } = await supabase.rpc(
      "open_team_match_availability",
      {
        target_match_id: cleanedMatchId,
        target_team_id: cleanedTeamId,
      },
    );

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateFixtureManagement(
      cleanedTeamId,
      cleanedMatchId,
    );

    return {
      ok: true,
      message: "Match availability opened successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function closeMatchAvailability(
  pollId: number,
  teamId: string,
  matchId?: string,
): Promise<TeamAdminActionResult> {
  try {
    if (!Number.isInteger(pollId) || pollId <= 0) {
      return {
        ok: false,
        message: "Invalid availability poll ID.",
      };
    }

    const cleanedTeamId = teamId.trim();
    const cleanedMatchId = matchId?.trim();

    if (!cleanedTeamId) {
      return {
        ok: false,
        message: "Invalid team ID.",
      };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message:
          "You must be signed in to close match availability.",
      };
    }

    const { error } = await supabase.rpc(
      "close_match_availability",
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

    revalidateFixtureManagement(
      cleanedTeamId,
      cleanedMatchId,
    );

    return {
      ok: true,
      message: "Match availability closed successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function reopenMatchAvailability(
  pollId: number,
  teamId: string,
  matchId?: string,
): Promise<TeamAdminActionResult> {
  try {
    if (!Number.isInteger(pollId) || pollId <= 0) {
      return {
        ok: false,
        message: "Invalid availability poll ID.",
      };
    }

    const cleanedTeamId = teamId.trim();
    const cleanedMatchId = matchId?.trim();

    if (!cleanedTeamId) {
      return {
        ok: false,
        message: "Invalid team ID.",
      };
    }

    const { supabase, signedIn } =
      await requireSignedInUser();

    if (!signedIn) {
      return {
        ok: false,
        message:
          "You must be signed in to reopen match availability.",
      };
    }

    const { error } = await supabase.rpc(
      "reopen_match_availability",
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

    revalidateFixtureManagement(
      cleanedTeamId,
      cleanedMatchId,
    );

    return {
      ok: true,
      message: "Match availability reopened successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}