import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const PROVIDER = "NV Play";
const SEASON = 2026;
const PARSER_VERSION = 3;

type JsonObject = Record<string, unknown>;

type SnapshotRow = {
  id: number;
  external_match_id: number;
  payload: JsonObject;
};

type ExternalMatchRow = {
  id: number;
  external_match_id: string;
  season: number;
  external_competition_id: string | null;
  external_competition_name: string | null;
  external_home_team_name: string | null;
  external_away_team_name: string | null;
  start_datetime: string | null;
  match_status: string | null;
  is_complete: boolean;
};

type CompetitionMapping = {
  competition_id: string;
  external_competition_id: string;
  external_competition_name: string | null;
};

type PlayerMapping = {
  player_id: string;
  external_player_id: string;
  external_player_name: string | null;
};

type TeamMapping = {
  team_id: string;
  external_team_id: string;
  external_team_name: string | null;
};

type OwnershipRow = {
  external_match_id: number;
  team_id: string;
};

type SpecialCase =
  | "Postponed / No Result"
  | "Forfeit"
  | null;

type PlayerPerformance = {
  player_id: string;
  team_id: string;

  external_player_ids: string[];
  external_player_name: string | null;

  batted: boolean;
  batting_position: number | null;
  runs: number | null;
  balls_faced: number | null;
  fours: number | null;
  sixes: number | null;
  dismissal_type: string | null;
  is_not_out: boolean | null;

  bowled: boolean;
  bowling_balls: number | null;
  maidens: number | null;
  runs_conceded: number | null;
  wickets: number | null;
  wides: number | null;
  no_balls: number | null;

  wickets_bowled: number;
  wickets_caught: number;
  wickets_lbw: number;
  wickets_stumped: number;
  wickets_caught_and_bowled: number;
  wickets_hit_wicket: number;

  catches: number;
  stumpings: number;
  run_outs: number;

  parser_notes: string[];
};

type ValidationState = {
  status: "Clean" | "Review Required" | "Blocked";
  issues: string[];
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function asObject(value: unknown): JsonObject | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as JsonObject;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0
    ? trimmed
    : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function asInteger(value: unknown): number | null {
  const numeric =
    asNumber(value);

  if (numeric === null) {
    return null;
  }

  return Math.trunc(numeric);
}

function oversToLegalBalls(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  const parts =
    text.split(".");

  if (parts.length > 2) {
    return null;
  }

  const completedOvers =
    Number(parts[0]);

  if (
    !Number.isInteger(completedOvers) ||
    completedOvers < 0
  ) {
    return null;
  }

  let ballsInCurrentOver = 0;

  if (parts.length === 2) {
    ballsInCurrentOver =
      Number(parts[1]);

    if (
      !Number.isInteger(ballsInCurrentOver) ||
      ballsInCurrentOver < 0 ||
      ballsInCurrentOver > 5
    ) {
      return null;
    }
  }

  return (
    completedOvers * 6 +
    ballsInCurrentOver
  );
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean"
    ? value
    : null;
}

function normaliseName(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[*†‡]+$/g, "")
    .trim()
    .toLowerCase();
}

function normaliseDismissalType(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  return value
    .replace(/\s+/g, " ")
    .trim();
}

function dateOnly(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return null;
  }

  return parsed
    .toISOString()
    .slice(0, 10);
}

function detectSpecialCase(
  match: JsonObject | null,
  inningsCount: number,
): SpecialCase {
  if (!match) {
    return null;
  }

  const result =
    asString(match.Result) ?? "";

  const matchStatus =
    asString(match.MatchStatus) ?? "";

  const hasScores =
    asBoolean(match.HasScores);

  const postponed =
    /match postponed/i.test(result);

  const noResult =
    /no result/i.test(matchStatus);

  if (
    postponed &&
    noResult &&
    hasScores === false &&
    inningsCount === 0
  ) {
    return "Postponed / No Result";
  }

  if (
    /unable to field a team/i.test(result)
  ) {
    return "Forfeit";
  }

  return null;
}

function resultForDccTeam(
  match: JsonObject,
  dccTeamName: string,
): string | null {
  const winningTeamName =
    asString(
      match.WinningTeamName,
    );

  const resultText =
    asString(match.Result);

  const isAbandoned =
    asBoolean(
      match.IsAbandoned,
    ) ?? false;

  if (isAbandoned) {
    return "No Result";
  }

  if (
    resultText &&
    /no result/i.test(
      resultText,
    )
  ) {
    return "No Result";
  }

  if (
    resultText &&
    /\btied\b/i.test(
      resultText,
    )
  ) {
    return "Tied";
  }

  if (
    resultText &&
    /match postponed/i.test(
      resultText,
    )
  ) {
    return "No Result";
  }

  if (
    winningTeamName
  ) {
    return (
      normaliseName(
        winningTeamName,
      ) ===
        normaliseName(
          dccTeamName,
        )
        ? "Won"
        : "Lost"
    );
  }

  if (
    resultText &&
    /\bdraw/i.test(
      resultText,
    )
  ) {
    return "Draw";
  }

  if (
    resultText &&
    /unable to field a team/i.test(
      resultText,
    )
  ) {
    const dccName =
      normaliseName(
        dccTeamName,
      );

    const resultName =
      normaliseName(
        resultText,
      );

    if (
      dccName &&
      resultName &&
      resultName.includes(
        dccName,
      )
    ) {
      return "Won";
    }
  }

  return null;
}

function createEmptyPerformance(
  playerId: string,
  teamId: string,
  externalPlayerId: string,
  externalPlayerName: string | null,
): PlayerPerformance {
  return {
    player_id:
      playerId,

    team_id:
      teamId,

    external_player_ids:
      [externalPlayerId],

    external_player_name:
      externalPlayerName,

    batted:
      false,

    batting_position:
      null,

    runs:
      null,

    balls_faced:
      null,

    fours:
      null,

    sixes:
      null,

    dismissal_type:
      null,

    is_not_out:
      null,

    bowled:
      false,

    bowling_balls:
      null,

    maidens:
      null,

    runs_conceded:
      null,

    wickets:
      null,

    wides:
      null,

    no_balls:
      null,

    wickets_bowled:
      0,

    wickets_caught:
      0,

    wickets_lbw:
      0,

    wickets_stumped:
      0,

    wickets_caught_and_bowled:
      0,

    wickets_hit_wicket:
      0,

    catches:
      0,

    stumpings:
      0,

    run_outs:
      0,

    parser_notes:
      [],
  };
}

function addExternalIdentity(
  performance: PlayerPerformance,
  externalPlayerId: string,
) {
  if (
    !performance.external_player_ids.includes(
      externalPlayerId,
    )
  ) {
    performance.external_player_ids.push(
      externalPlayerId,
    );
  }
}

function resolvePlayerId(
  externalPlayerId: string | null,
  playerMap: Map<string, string>,
): string | null {
  if (!externalPlayerId) {
    return null;
  }

  return (
    playerMap.get(
      externalPlayerId,
    ) ?? null
  );
}

function ensurePerformance(
  performanceMap: Map<
    string,
    PlayerPerformance
  >,
  playerId: string,
  teamId: string,
  externalPlayerId: string,
  externalPlayerName: string | null,
): PlayerPerformance {
  const key =
    `${teamId}:${playerId}`;

  const existing =
    performanceMap.get(key);

  if (existing) {
    addExternalIdentity(
      existing,
      externalPlayerId,
    );

    return existing;
  }

  const created =
    createEmptyPerformance(
      playerId,
      teamId,
      externalPlayerId,
      externalPlayerName,
    );

  performanceMap.set(
    key,
    created,
  );

  return created;
}

function incrementWicketBreakdown(
  performance: PlayerPerformance,
  dismissalType: string | null,
  caughtAndBowled: boolean,
) {
  const type =
    normaliseName(
      dismissalType,
    );

  if (!type) {
    return;
  }

  if (
    type === "bowled"
  ) {
    performance.wickets_bowled += 1;
    return;
  }

  if (
    type === "lbw"
  ) {
    performance.wickets_lbw += 1;
    return;
  }

  if (
    type === "stumped"
  ) {
    performance.wickets_stumped += 1;
    return;
  }

  if (
    type === "hit wicket"
  ) {
    performance.wickets_hit_wicket += 1;
    return;
  }

  if (
    type === "caught" &&
    caughtAndBowled
  ) {
    performance.wickets_caught_and_bowled += 1;
    return;
  }

  if (
    type === "caught"
  ) {
    performance.wickets_caught += 1;
  }
}

function validationRank(
  status:
    | "Clean"
    | "Review Required"
    | "Blocked",
): number {
  if (
    status === "Blocked"
  ) {
    return 3;
  }

  if (
    status === "Review Required"
  ) {
    return 2;
  }

  return 1;
}

function raiseValidation(
  validation: ValidationState,
  requestedStatus:
    | "Review Required"
    | "Blocked",
  issue: string,
) {
  if (
    validationRank(
      requestedStatus,
    ) >
    validationRank(
      validation.status,
    )
  ) {
    validation.status =
      requestedStatus;
  }

  if (
    !validation.issues.includes(
      issue,
    )
  ) {
    validation.issues.push(
      issue,
    );
  }
}

Deno.serve(async (req) => {
  let currentStage =
    "initialising";

  try {
    if (
      req.method !== "POST"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Method not allowed",
        },
        405,
      );
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Supabase environment variables are missing",
        },
        500,
      );
    }

    const supabase =
      createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        },
      );

    // =====================================================
    // Competition mappings
    // =====================================================

    currentStage =
      "loading competition mappings";

    const competitionResult =
      await supabase
        .from(
          "external_competition_mappings",
        )
        .select(
          "competition_id, external_competition_id, external_competition_name",
        )
        .eq(
          "provider",
          PROVIDER,
        )
        .eq(
          "season",
          SEASON,
        )
        .eq(
          "status",
          "Confirmed",
        );

    if (
      competitionResult.error
    ) {
      throw new Error(
        competitionResult.error.message,
      );
    }

    const competitionMappings =
      (competitionResult.data ??
        []) as CompetitionMapping[];

    const competitionMap =
      new Map<
        string,
        CompetitionMapping
      >();

    for (
      const mapping
      of competitionMappings
    ) {
      competitionMap.set(
        mapping.external_competition_id,
        mapping,
      );
    }

    // =====================================================
    // Player mappings
    // =====================================================

    currentStage =
      "loading player mappings";

    const playerResult =
      await supabase
        .from(
          "player_external_identities",
        )
        .select(
          "player_id, external_player_id, external_player_name",
        )
        .eq(
          "provider",
          PROVIDER,
        )
        .eq(
          "status",
          "Confirmed",
        );

    if (
      playerResult.error
    ) {
      throw new Error(
        playerResult.error.message,
      );
    }

    const playerMappings =
      (playerResult.data ??
        []) as PlayerMapping[];

    const playerMap =
      new Map<string, string>();

    for (
      const mapping
      of playerMappings
    ) {
      playerMap.set(
        mapping.external_player_id,
        mapping.player_id,
      );
    }

    // =====================================================
    // Team mappings
    // =====================================================

    currentStage =
      "loading team mappings";

    const teamResult =
      await supabase
        .from(
          "external_team_mappings",
        )
        .select(
          "team_id, external_team_id, external_team_name",
        )
        .eq(
          "provider",
          PROVIDER,
        )
        .eq(
          "status",
          "Confirmed",
        );

    if (
      teamResult.error
    ) {
      throw new Error(
        teamResult.error.message,
      );
    }

    const teamMappings =
      (teamResult.data ??
        []) as TeamMapping[];

    const teamByName =
      new Map<
        string,
        TeamMapping
      >();

    for (
      const mapping
      of teamMappings
    ) {
      const key =
        normaliseName(
          mapping.external_team_name,
        );

      if (key) {
        teamByName.set(
          key,
          mapping,
        );
      }
    }

    // =====================================================
    // Match ownership
    // =====================================================

    currentStage =
      "loading external match ownership";

    const ownershipResult =
      await supabase
        .from(
          "external_match_teams",
        )
        .select(
          "external_match_id, team_id",
        );

    if (
      ownershipResult.error
    ) {
      throw new Error(
        ownershipResult.error.message,
      );
    }

    const ownershipRows =
      (ownershipResult.data ??
        []) as OwnershipRow[];

    const ownershipMap =
      new Map<
        number,
        string[]
      >();

    for (
      const ownership
      of ownershipRows
    ) {
      const current =
        ownershipMap.get(
          ownership.external_match_id,
        ) ?? [];

      if (
        !current.includes(
          ownership.team_id,
        )
      ) {
        current.push(
          ownership.team_id,
        );
      }

      ownershipMap.set(
        ownership.external_match_id,
        current,
      );
    }

    // =====================================================
    // External matches
    // =====================================================

    currentStage =
      "loading external matches";

    const externalMatchResult =
      await supabase
        .from(
          "external_matches",
        )
        .select(
          `
          id,
          external_match_id,
          season,
          external_competition_id,
          external_competition_name,
          external_home_team_name,
          external_away_team_name,
          start_datetime,
          match_status,
          is_complete
          `,
        )
        .eq(
          "provider",
          PROVIDER,
        )
        .eq(
          "season",
          SEASON,
        );

    if (
      externalMatchResult.error
    ) {
      throw new Error(
        externalMatchResult.error.message,
      );
    }

    const externalMatches =
      (externalMatchResult.data ??
        []) as ExternalMatchRow[];

    const externalMatchMap =
      new Map<
        number,
        ExternalMatchRow
      >();

    for (
      const match
      of externalMatches
    ) {
      externalMatchMap.set(
        match.id,
        match,
      );
    }

    // =====================================================
    // Existing imports
    // =====================================================

    currentStage =
      "loading existing imports";

    const existingImportResult =
      await supabase
        .from(
          "match_imports",
        )
        .select(
          "snapshot_id",
        );

    if (
      existingImportResult.error
    ) {
      throw new Error(
        existingImportResult.error.message,
      );
    }

    const importedSnapshotIds =
      new Set<number>(
        (
          existingImportResult.data ??
          []
        ).map(
          (
            row: {
              snapshot_id: number;
            },
          ) =>
            row.snapshot_id,
        ),
      );

    // =====================================================
    // Snapshots
    // =====================================================

    currentStage =
      "loading snapshots";

    const snapshotResult =
      await supabase
        .from(
          "external_match_snapshots",
        )
        .select(
          "id, external_match_id, payload",
        )
        .order(
          "id",
          {
            ascending: true,
          },
        );

    if (
      snapshotResult.error
    ) {
      throw new Error(
        snapshotResult.error.message,
      );
    }

    const snapshots =
      (snapshotResult.data ??
        []) as SnapshotRow[];

    let snapshotsSeen = 0;
    let alreadyImported = 0;
    let importsCreated = 0;

    let cleanImports = 0;
    let reviewImports = 0;
    let blockedImports = 0;

    const failures: {
      snapshotId: number;
      externalMatchId: number;
      error: string;
    }[] = [];

    // =====================================================
    // Parse snapshots
    // =====================================================

    for (
      const snapshot
      of snapshots
    ) {
      snapshotsSeen += 1;

      if (
        importedSnapshotIds.has(
          snapshot.id,
        )
      ) {
        alreadyImported += 1;
        continue;
      }

      try {
        const externalMatch =
          externalMatchMap.get(
            snapshot.external_match_id,
          );

        if (
          !externalMatch
        ) {
          throw new Error(
            "External match row not found",
          );
        }

        if (
          externalMatch.season !==
          SEASON
        ) {
          continue;
        }

        const payload =
          snapshot.payload;

        const matchObject =
          asObject(
            payload.Match,
          );

        const inningsArray =
          asArray(
            payload.Innings,
          );

        const validation:
          ValidationState = {
            status:
              "Clean",

            issues:
              [],
          };

        if (
          !matchObject
        ) {
          raiseValidation(
            validation,
            "Blocked",
            "NV Play payload has no valid Match object",
          );
        }

        const specialCase =
          detectSpecialCase(
            matchObject,
            inningsArray.length,
          );

        if (
          inningsArray.length ===
            0 &&
          specialCase !==
            "Postponed / No Result"
        ) {
          raiseValidation(
            validation,
            "Review Required",
            "NV Play payload contains no innings",
          );
        }

        const externalCompetitionId =
          matchObject
            ? asString(
                matchObject.CompetitionId,
              )
            : null;

        const competitionMapping =
          externalCompetitionId
            ? competitionMap.get(
                externalCompetitionId,
              ) ?? null
            : null;

        if (
          !competitionMapping
        ) {
          raiseValidation(
            validation,
            "Blocked",
            "Competition mapping could not be resolved",
          );
        }

        const ownedTeamIds =
          ownershipMap.get(
            externalMatch.id,
          ) ?? [];

        if (
          ownedTeamIds.length ===
          0
        ) {
          raiseValidation(
            validation,
            "Blocked",
            "No DCC team ownership rows found",
          );
        }

        const team1Name =
          matchObject
            ? asString(
                matchObject.Team1ExternalName,
              ) ??
              asString(
                matchObject.Team1Name,
              )
            : null;

        const team2Name =
          matchObject
            ? asString(
                matchObject.Team2ExternalName,
              ) ??
              asString(
                matchObject.Team2Name,
              )
            : null;

        const resolvedTeam1 =
          team1Name
            ? teamByName.get(
                normaliseName(
                  team1Name,
                ) ?? "",
              ) ?? null
            : null;

        const resolvedTeam2 =
          team2Name
            ? teamByName.get(
                normaliseName(
                  team2Name,
                ) ?? "",
              ) ?? null
            : null;

        const dccTeamMappings =
          [
            resolvedTeam1,
            resolvedTeam2,
          ].filter(
            (
              value,
            ): value is TeamMapping =>
              value !== null &&
              ownedTeamIds.includes(
                value.team_id,
              ),
          );

        if (
          dccTeamMappings.length !==
          ownedTeamIds.length
        ) {
          raiseValidation(
            validation,
            "Review Required",
            "Not every owned DCC team could be resolved from NV Play team names",
          );
        }

        // =================================================
        // Innings lookup
        // =================================================

        const inningsByBattingTeam =
          new Map<
            string,
            JsonObject
          >();

        for (
          const inningsValue
          of inningsArray
        ) {
          const innings =
            asObject(
              inningsValue,
            );

          if (!innings) {
            continue;
          }

          const battingTeamName =
            normaliseName(
              asString(
                innings.BattingTeamName,
              ),
            );

          if (
            battingTeamName
          ) {
            inningsByBattingTeam.set(
              battingTeamName,
              innings,
            );
          }
        }

        // =================================================
        // Team entries
        // =================================================

        const parsedTeamEntries:
          JsonObject[] = [];

        for (
          const dccTeam
          of dccTeamMappings
        ) {
          const dccTeamName =
            dccTeam.external_team_name;

          if (
            !dccTeamName
          ) {
            continue;
          }

          const dccTeamNameKey =
            normaliseName(
              dccTeamName,
            );

          const opponentName =
            resolvedTeam1?.team_id ===
            dccTeam.team_id
              ? team2Name
              : team1Name;

          const dccInnings =
            dccTeamNameKey
              ? inningsByBattingTeam.get(
                  dccTeamNameKey,
                ) ?? null
              : null;

          const opponentInnings =
            opponentName
              ? inningsByBattingTeam.get(
                  normaliseName(
                    opponentName,
                  ) ?? "",
                ) ?? null
              : null;

          if (
            !dccInnings &&
            inningsArray.length >
              0 &&
            specialCase !==
              "Forfeit"
          ) {
            raiseValidation(
              validation,
              "Review Required",
              `DCC innings not found for ${dccTeamName}`,
            );
          }

          parsedTeamEntries.push(
            {
              team_id:
                dccTeam.team_id,

              competition_id:
                competitionMapping
                  ?.competition_id ??
                null,

              opponent_display_name:
                opponentName,

              result:
                matchObject
                  ? resultForDccTeam(
                      matchObject,
                      dccTeamName,
                    )
                  : null,

              scheduled_overs:
                matchObject
                  ? asInteger(
                      matchObject.MaxOvers,
                    )
                  : null,

              revised_overs:
                null,

              dcc_score:
                dccInnings
                  ? asInteger(
                      dccInnings.TotalRuns,
                    )
                  : null,

              dcc_wickets:
                dccInnings
                  ? asInteger(
                      dccInnings.TotalWickets,
                    )
                  : null,

              dcc_balls:
                dccInnings
                  ? asInteger(
                      dccInnings.TotalBalls,
                    )
                  : null,

              opponent_score:
                opponentInnings
                  ? asInteger(
                      opponentInnings.TotalRuns,
                    )
                  : null,

              opponent_wickets:
                opponentInnings
                  ? asInteger(
                      opponentInnings.TotalWickets,
                    )
                  : null,

              opponent_balls:
                opponentInnings
                  ? asInteger(
                      opponentInnings.TotalBalls,
                    )
                  : null,
            },
          );
        }

        // =================================================
        // Player performances
        // =================================================

        const performanceMap =
          new Map<
            string,
            PlayerPerformance
          >();

        const rosterSideDefinitions = [
          {
            teamName:
              team1Name,

            roster:
              matchObject
                ? asArray(
                    matchObject.Team1Players,
                  )
                : [],
          },
          {
            teamName:
              team2Name,

            roster:
              matchObject
                ? asArray(
                    matchObject.Team2Players,
                  )
                : [],
          },
        ];

        // -------------------------------------------------
        // Rosters
        // -------------------------------------------------

        for (
          const side
          of rosterSideDefinitions
        ) {
          if (
            !side.teamName
          ) {
            continue;
          }

          const teamMapping =
            teamByName.get(
              normaliseName(
                side.teamName,
              ) ?? "",
            );

          if (
            !teamMapping ||
            !ownedTeamIds.includes(
              teamMapping.team_id,
            )
          ) {
            continue;
          }

          for (
            const playerValue
            of side.roster
          ) {
            const player =
              asObject(
                playerValue,
              );

            if (
              !player
            ) {
              continue;
            }

            const externalPlayerId =
              asString(
                player.Id,
              );

            const externalPlayerName =
              asString(
                player.PlayerName,
              ) ??
              asString(
                player.Name,
              );

            const playerId =
              resolvePlayerId(
                externalPlayerId,
                playerMap,
              );

            if (
              !externalPlayerId
            ) {
              raiseValidation(
                validation,
                "Review Required",
                `Roster player has no NV Play Id: ${externalPlayerName ?? "Unknown player"}`,
              );

              continue;
            }

            if (
              !playerId
            ) {
              raiseValidation(
                validation,
                "Review Required",
                `Unmapped NV Play player: ${externalPlayerName ?? externalPlayerId}`,
              );

              continue;
            }

            ensurePerformance(
              performanceMap,
              playerId,
              teamMapping.team_id,
              externalPlayerId,
              externalPlayerName,
            );
          }
        }

        // -------------------------------------------------
        // Batting
        // -------------------------------------------------

        for (
          const dccTeam
          of dccTeamMappings
        ) {
          const dccName =
            dccTeam.external_team_name;

          if (
            !dccName
          ) {
            continue;
          }

          const battingInnings =
            inningsByBattingTeam.get(
              normaliseName(
                dccName,
              ) ?? "",
            );

          if (
            !battingInnings
          ) {
            continue;
          }

          const battingCard =
            asArray(
              battingInnings.BattingCard,
            );

          let battingPosition =
            0;

          for (
            const batterValue
            of battingCard
          ) {
            const batter =
              asObject(
                batterValue,
              );

            if (
              !batter
            ) {
              continue;
            }

            if (
              asBoolean(
                batter.IsSummary,
              ) === true
            ) {
              continue;
            }

            battingPosition +=
              1;

            const externalPlayerId =
              asString(
                batter.Id,
              );

            if (
              !externalPlayerId
            ) {
              continue;
            }

            const playerId =
              resolvePlayerId(
                externalPlayerId,
                playerMap,
              );

            if (
              !playerId
            ) {
              raiseValidation(
                validation,
                "Review Required",
                `Unmapped batter: ${asString(batter.PlayerName) ?? externalPlayerId}`,
              );

              continue;
            }

            const performance =
              ensurePerformance(
                performanceMap,
                playerId,
                dccTeam.team_id,
                externalPlayerId,
                asString(
                  batter.PlayerName,
                ),
              );

            const hasBatted =
              asBoolean(
                batter.HasBatted,
              ) ?? false;

            performance.batted =
              hasBatted;

            performance.batting_position =
              battingPosition;

            if (
              hasBatted
            ) {
              performance.runs =
                asInteger(
                  batter.Runs,
                );

              performance.balls_faced =
                asInteger(
                  batter.Balls,
                );

              performance.fours =
                asInteger(
                  batter.Fours,
                );

              performance.sixes =
                asInteger(
                  batter.Sixes,
                );

              const dismissal =
                asObject(
                  batter.Dismissal,
                );

              performance.dismissal_type =
                dismissal
                  ? normaliseDismissalType(
                      asString(
                        dismissal.Type,
                      ),
                    )
                  : null;

              const isDismissed =
                asBoolean(
                  batter.IsDismissed,
                );

              performance.is_not_out =
                isDismissed ===
                  null
                  ? null
                  : !isDismissed;
            }
          }
        }

        // -------------------------------------------------
        // Bowling + wickets + fielding
        // -------------------------------------------------

        for (
          const dccTeam
          of dccTeamMappings
        ) {
          const dccName =
            dccTeam.external_team_name;

          if (
            !dccName
          ) {
            continue;
          }

          const opponentName =
            resolvedTeam1?.team_id ===
            dccTeam.team_id
              ? team2Name
              : team1Name;

          if (
            !opponentName
          ) {
            continue;
          }

          const oppositionInnings =
            inningsByBattingTeam.get(
              normaliseName(
                opponentName,
              ) ?? "",
            );

          if (
            !oppositionInnings
          ) {
            continue;
          }

          // -----------------------------------------------
          // Bowling card
          // -----------------------------------------------

          const bowlingCard =
            asArray(
              oppositionInnings.BowlingCard,
            );

          for (
            const bowlerValue
            of bowlingCard
          ) {
            const bowler =
              asObject(
                bowlerValue,
              );

            if (
              !bowler
            ) {
              continue;
            }

            const externalPlayerId =
              asString(
                bowler.Id,
              );

            if (
              !externalPlayerId
            ) {
              continue;
            }

            const playerId =
              resolvePlayerId(
                externalPlayerId,
                playerMap,
              );

            if (
              !playerId
            ) {
              raiseValidation(
                validation,
                "Review Required",
                `Unmapped bowler: ${asString(bowler.PlayerName) ?? externalPlayerId}`,
              );

              continue;
            }

            const performance =
              ensurePerformance(
                performanceMap,
                playerId,
                dccTeam.team_id,
                externalPlayerId,
                asString(
                  bowler.PlayerName,
                ),
              );

            /*
             * IMPORTANT — Parser v3
             *
             * NV Play's BowlingCard.Balls can include
             * recorded delivery events that do not equal
             * the number of legal cricket deliveries.
             *
             * BowlingCard.Overs is the correct source for
             * legal-ball calculation.
             *
             * Examples:
             *
             * 8.0 overs -> 48 legal balls
             * 7.0 overs -> 42 legal balls
             * 3.1 overs -> 19 legal balls
             * 2.2 overs -> 14 legal balls
             */
            const legalBalls =
              oversToLegalBalls(
                bowler.Overs,
              );

            performance.bowled =
              legalBalls !==
                null &&
              legalBalls > 0;

            performance.bowling_balls =
              legalBalls;

            performance.maidens =
              asInteger(
                bowler.Maidens,
              );

            performance.runs_conceded =
              asInteger(
                bowler.Runs,
              );

            performance.wickets =
              asInteger(
                bowler.Wickets,
              );

            performance.wides =
              asInteger(
                bowler.Wides,
              );

            performance.no_balls =
              asInteger(
                bowler.NoBalls,
              );
          }

          // -----------------------------------------------
          // Wicket breakdown + fielding
          // -----------------------------------------------

          const battingCard =
            asArray(
              oppositionInnings.BattingCard,
            );

          for (
            const batterValue
            of battingCard
          ) {
            const batter =
              asObject(
                batterValue,
              );

            if (
              !batter
            ) {
              continue;
            }

            if (
              asBoolean(
                batter.IsSummary,
              ) === true
            ) {
              continue;
            }

            if (
              asBoolean(
                batter.IsDismissed,
              ) !== true
            ) {
              continue;
            }

            const dismissal =
              asObject(
                batter.Dismissal,
              );

            if (
              !dismissal
            ) {
              continue;
            }

            const dismissalType =
              normaliseDismissalType(
                asString(
                  dismissal.Type,
                ),
              );

            const bowlerExternalId =
              asString(
                dismissal.BowlerId,
              );

            const fielders =
              asArray(
                dismissal.Fielders,
              );

            let caughtAndBowled =
              false;

            if (
              normaliseName(
                dismissalType,
              ) === "caught" &&
              bowlerExternalId
            ) {
              for (
                const fielderValue
                of fielders
              ) {
                const fielder =
                  asObject(
                    fielderValue,
                  );

                const fielderExternalId =
                  fielder
                    ? asString(
                        fielder.Id,
                      )
                    : null;

                if (
                  fielderExternalId ===
                  bowlerExternalId
                ) {
                  caughtAndBowled =
                    true;
                }
              }
            }

            if (
              bowlerExternalId
            ) {
              const bowlerPlayerId =
                resolvePlayerId(
                  bowlerExternalId,
                  playerMap,
                );

              if (
                bowlerPlayerId
              ) {
                const bowlerPerformance =
                  ensurePerformance(
                    performanceMap,
                    bowlerPlayerId,
                    dccTeam.team_id,
                    bowlerExternalId,
                    null,
                  );

                incrementWicketBreakdown(
                  bowlerPerformance,
                  dismissalType,
                  caughtAndBowled,
                );
              }
            }

            for (
              const fielderValue
              of fielders
            ) {
              const fielder =
                asObject(
                  fielderValue,
                );

              if (
                !fielder
              ) {
                continue;
              }

              const fielderExternalId =
                asString(
                  fielder.Id,
                );

              if (
                !fielderExternalId
              ) {
                continue;
              }

              const fielderPlayerId =
                resolvePlayerId(
                  fielderExternalId,
                  playerMap,
                );

              if (
                !fielderPlayerId
              ) {
                raiseValidation(
                  validation,
                  "Review Required",
                  `Unmapped fielder: ${asString(fielder.DisplayName) ?? fielderExternalId}`,
                );

                continue;
              }

              const fieldingPerformance =
                ensurePerformance(
                  performanceMap,
                  fielderPlayerId,
                  dccTeam.team_id,
                  fielderExternalId,
                  asString(
                    fielder.DisplayName,
                  ),
                );

              const dismissalTypeKey =
                normaliseName(
                  dismissalType,
                );

              if (
                dismissalTypeKey ===
                "caught"
              ) {
                if (
                  fielderExternalId !==
                  bowlerExternalId
                ) {
                  fieldingPerformance.catches +=
                    1;
                }
              } else if (
                dismissalTypeKey ===
                "stumped"
              ) {
                fieldingPerformance.stumpings +=
                  1;
              } else if (
                dismissalTypeKey ===
                "run out"
              ) {
                fieldingPerformance.run_outs +=
                  1;
              }
            }
          }
        }

        if (
          performanceMap.size ===
            0 &&
          inningsArray.length >
            0 &&
          specialCase !==
            "Forfeit"
        ) {
          raiseValidation(
            validation,
            "Review Required",
            "No DCC player performances could be resolved",
          );
        }

        const parsedPayload =
          {
            parser_version:
              PARSER_VERSION,

            source: {
              provider:
                PROVIDER,

              snapshot_id:
                snapshot.id,

              external_match_database_id:
                externalMatch.id,

              external_match_id:
                externalMatch.external_match_id,
            },

            match: {
              season:
                SEASON,

              match_date:
                dateOnly(
                  externalMatch.start_datetime,
                ),

              external_competition_id:
                externalCompetitionId,

              competition_id:
                competitionMapping
                  ?.competition_id ??
                null,

              competition_name:
                competitionMapping
                  ?.external_competition_name ??
                externalMatch.external_competition_name,

              home_team:
                team1Name,

              away_team:
                team2Name,

              match_status:
                externalMatch.match_status,

              is_complete:
                externalMatch.is_complete,

              result_text:
                matchObject
                  ? asString(
                      matchObject.Result,
                    )
                  : null,

              dcc_team_ids:
                ownedTeamIds,

              special_case:
                specialCase,
            },

            team_entries:
              parsedTeamEntries,

            player_performances:
              Array.from(
                performanceMap.values(),
              ).sort(
                (a, b) =>
                  a.team_id.localeCompare(
                    b.team_id,
                  ) ||
                  a.player_id.localeCompare(
                    b.player_id,
                  ),
              ),

            validation: {
              status:
                validation.status,

              issues:
                validation.issues,
            },

            publication_policy: {
              season:
                SEASON,

              mode:
                "Reconciliation Only",

              canonical_overwrite_allowed:
                false,

              canonical_tables_protected:
                [
                  "matches",
                  "match_team_entries",
                  "player_match_performances",
                  "approved_match_scorecards",
                ],
            },
          };

        const importStatus =
          validation.status ===
          "Clean"
            ? "Imported"
            : "Needs Review";

        const insertResult =
          await supabase
            .from(
              "match_imports",
            )
            .insert(
              {
                external_match_id:
                  externalMatch.id,

                snapshot_id:
                  snapshot.id,

                parsed_payload:
                  parsedPayload,

                validation_status:
                  validation.status,

                import_status:
                  importStatus,
              },
            );

        if (
          insertResult.error
        ) {
          throw new Error(
            insertResult.error.message,
          );
        }

        importsCreated +=
          1;

        if (
          validation.status ===
          "Clean"
        ) {
          cleanImports +=
            1;
        } else if (
          validation.status ===
          "Review Required"
        ) {
          reviewImports +=
            1;
        } else {
          blockedImports +=
            1;
        }
      } catch (error) {
        failures.push(
          {
            snapshotId:
              snapshot.id,

            externalMatchId:
              snapshot.external_match_id,

            error:
              safeErrorMessage(
                error,
              ),
          },
        );

        console.error(
          "NV Play parser snapshot failure:",
          {
            snapshotId:
              snapshot.id,

            externalMatchId:
              snapshot.external_match_id,

            error:
              safeErrorMessage(
                error,
              ),
          },
        );
      }
    }

    return jsonResponse(
      {
        success:
          true,

        status:
          "NV Play parsing complete",

        parserVersion:
          PARSER_VERSION,

        season:
          SEASON,

        snapshotsSeen,

        alreadyImported,

        importsCreated,

        cleanImports,

        reviewImports,

        blockedImports,

        failures,

        canonical2026Protected:
          true,
      },
    );
  } catch (error) {
    console.error(
      "NV Play parser fatal failure:",
      {
        stage:
          currentStage,

        error:
          safeErrorMessage(
            error,
          ),
      },
    );

    return jsonResponse(
      {
        success:
          false,

        stage:
          currentStage,

        error:
          safeErrorMessage(
            error,
          ),
      },
      500,
    );
  }
});