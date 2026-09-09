import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const NVPLAY_CUSTOMER_ID =
  "4c07e17d-8e58-426e-82cc-bd4b02b5183b";

const PROVIDER = "NV Play";

const IMPORT_START_MONTH = 4;
const IMPORT_START_DAY = 1;
const IMPORT_END_MONTH = 9;
const IMPORT_END_DAY = 30;

const PAGE_SIZE = 50;
const MAX_PAGES = 50;

type NvPlayMatch = Record<string, unknown>;

type ExternalTeamMapping = {
  team_id: string;
  external_team_id: string;
  external_team_name: string | null;
};

type ResolvedMatch = {
  externalMatchId: string;
  competitionId: string | null;
  competitionName: string | null;
  team1Name: string | null;
  team2Name: string | null;
  startDateTime: string | null;
  matchStatus: string | null;
  isComplete: boolean;
  dccTeamIds: string[];
};

type ExternalMatchRow = {
  id: number;
  external_match_id: string;
  is_complete: boolean;
  match_status: string | null;
};

type SnapshotFailure = {
  externalMatchId: string;
  stage: string;
  error: string;
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

function assertSupabaseResponse<T>(
  response: unknown,
  stage: string,
): { data: T | null; error: unknown } {
  if (
    response === null ||
    response === undefined ||
    typeof response !== "object"
  ) {
    throw new Error(
      `${stage}: Supabase returned an invalid response object`,
    );
  }

  const typed = response as {
    data?: T | null;
    error?: unknown;
  };

  return {
    data:
      typed.data === undefined
        ? null
        : typed.data,
    error:
      typed.error === undefined
        ? null
        : typed.error,
  };
}

function isInsideImportSeason(date: Date): boolean {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if (
    month < IMPORT_START_MONTH ||
    month > IMPORT_END_MONTH
  ) {
    return false;
  }

  if (
    month === IMPORT_START_MONTH &&
    day < IMPORT_START_DAY
  ) {
    return false;
  }

  if (
    month === IMPORT_END_MONTH &&
    day > IMPORT_END_DAY
  ) {
    return false;
  }

  return true;
}

function seasonDates(year: number) {
  return {
    start:
      `${year}-${String(IMPORT_START_MONTH).padStart(2, "0")}-${String(
        IMPORT_START_DAY,
      ).padStart(2, "0")}`,

    end:
      `${year}-${String(IMPORT_END_MONTH).padStart(2, "0")}-${String(
        IMPORT_END_DAY,
      ).padStart(2, "0")}`,
  };
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

function asBoolean(
  value: unknown,
  fallback = false,
): boolean {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function getMatchId(
  match: NvPlayMatch,
): string | null {
  return (
    asString(match.MatchId) ??
    asString(match.matchId) ??
    asString(match.MatchID)
  );
}

function getMatchKey(
  source: string,
  match: NvPlayMatch,
): string {
  return (
    getMatchId(match) ??
    `${source}:${JSON.stringify(match)}`
  );
}

function normaliseTeamName(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveDccTeamIds(
  match: NvPlayMatch,
  mappings: ExternalTeamMapping[],
): string[] {
  const team1Name =
    normaliseTeamName(
      asString(match.Team1ExternalName) ??
      asString(match.Team1Name),
    );

  const team2Name =
    normaliseTeamName(
      asString(match.Team2ExternalName) ??
      asString(match.Team2Name),
    );

  const resolved =
    new Set<string>();

  for (const mapping of mappings) {
    const mappedName =
      normaliseTeamName(
        mapping.external_team_name,
      );

    if (!mappedName) {
      continue;
    }

    if (
      mappedName === team1Name ||
      mappedName === team2Name
    ) {
      resolved.add(mapping.team_id);
    }
  }

  return Array.from(resolved);
}

function normaliseStartDateTime(
  match: NvPlayMatch,
): string | null {
  return (
    asString(match.StartDateTimeUTC) ??
    asString(match.startDateTimeUTC) ??
    asString(match.StartDateTime) ??
    asString(match.startDateTime)
  );
}

function resolveMatch(
  match: NvPlayMatch,
  mappings: ExternalTeamMapping[],
): ResolvedMatch | null {
  const externalMatchId =
    getMatchId(match);

  if (!externalMatchId) {
    return null;
  }

  const dccTeamIds =
    resolveDccTeamIds(
      match,
      mappings,
    );

  if (dccTeamIds.length === 0) {
    return null;
  }

  return {
    externalMatchId,

    competitionId:
      asString(match.CompetitionId) ??
      asString(match.competitionId),

    competitionName:
      asString(match.CompetitionName) ??
      asString(match.competitionName),

    team1Name:
      asString(match.Team1ExternalName) ??
      asString(match.Team1Name),

    team2Name:
      asString(match.Team2ExternalName) ??
      asString(match.Team2Name),

    startDateTime:
      normaliseStartDateTime(match),

    matchStatus:
      asString(match.MatchStatus) ??
      asString(match.matchStatus),

    isComplete:
      asBoolean(
        match.IsComplete ??
        match.isComplete,
        false,
      ),

    dccTeamIds,
  };
}

function stableStringify(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableStringify)
      .join(",")}]`;
  }

  const objectValue =
    value as Record<string, unknown>;

  const keys =
    Object.keys(objectValue)
      .sort();

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(
          objectValue[key],
        )}`,
    )
    .join(",")}}`;
}

async function sha256Hex(
  value: unknown,
): Promise<string> {
  const encoded =
    new TextEncoder().encode(
      stableStringify(value),
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encoded,
    );

  return Array.from(
    new Uint8Array(digest),
  )
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0"),
    )
    .join("");
}

async function fetchScorecard(
  externalMatchId: string,
): Promise<unknown> {
  const scorecardUrl =
    `https://w-api.cdn.nvplay.net/api/scorecard/${externalMatchId}` +
    `?idType=nvplay` +
    `&customerId=${NVPLAY_CUSTOMER_ID}` +
    `&stats=true` +
    `&commentary=true`;

  const response =
    await fetch(
      scorecardUrl,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `HTTP ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  return await response.json();
}

Deno.serve(async (req) => {
  let currentStage =
    "initialising";

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          error: "Method not allowed",
        },
        405,
      );
    }

    currentStage =
      "checking environment";

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return jsonResponse(
        {
          success: false,
          stage: currentStage,
          error:
            "Importer configuration is incomplete",
        },
        500,
      );
    }

    const now =
      new Date();

    if (!isInsideImportSeason(now)) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason:
          "Outside import season",
        importWindow:
          "1 April to 30 September",
        checkedAt:
          now.toISOString(),
      });
    }

    const seasonYear =
      now.getUTCFullYear();

    const {
      start,
      end,
    } =
      seasonDates(seasonYear);

    currentStage =
      "creating Supabase client";

    const supabase =
      createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

    // =====================================================
    // Load mappings
    // =====================================================

    currentStage =
      "loading team mappings";

    const mappingRaw =
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

    const mappingResponse =
      assertSupabaseResponse<
        ExternalTeamMapping[]
      >(
        mappingRaw,
        currentStage,
      );

    if (mappingResponse.error) {
      throw new Error(
        `${currentStage}: ${safeErrorMessage(
          mappingResponse.error,
        )}`,
      );
    }

    const mappings =
      mappingResponse.data ?? [];

    if (mappings.length !== 6) {
      return jsonResponse(
        {
          success: false,
          stage: currentStage,
          error:
            "Expected exactly six confirmed NV Play team mappings",
          mappingCount:
            mappings.length,
        },
        500,
      );
    }

    // =====================================================
    // Fetch catalogue
    // =====================================================

    currentStage =
      "fetching season catalogue";

    const uniqueMatches =
      new Map<
        string,
        {
          source:
            | "Fixture"
            | "Result"
            | "Live";
          match:
            NvPlayMatch;
        }
      >();

    let pagesFetched = 0;

    for (
      let page = 0;
      page < MAX_PAGES;
      page++
    ) {
      const params =
        new URLSearchParams({
          customerid:
            NVPLAY_CUSTOMER_ID,
          addFilters: "true",
          advanced: "false",
          currentSeason: "true",
          start,
          end,
          days: "183",
          competitionId: "",
          teams: "",
          matchTypes: "",
          videoOnly: "false",
          page:
            String(page),
          showFixtures: "true",
          showLive: "true",
          showResults: "true",
          completedResultsOnly:
            "true",
          maxResults:
            String(PAGE_SIZE),
        });

      const url =
        `https://w-api.cdn.nvplay.net/api/matchlist/filter?${params.toString()}`;

      const response =
        await fetch(
          url,
          {
            method: "GET",
            headers: {
              Accept:
                "application/json",
            },
          },
        );

      if (!response.ok) {
        const text =
          await response.text();

        throw new Error(
          `Catalogue page ${page} failed: ` +
          `HTTP ${response.status} ${text.slice(0, 300)}`,
        );
      }

      const catalogue =
        await response.json();

      pagesFetched += 1;

      const fixtures:
        NvPlayMatch[] =
          Array.isArray(
            catalogue?.Fixtures,
          )
            ? catalogue.Fixtures
            : [];

      const results:
        NvPlayMatch[] =
          Array.isArray(
            catalogue?.Results,
          )
            ? catalogue.Results
            : [];

      const live:
        NvPlayMatch[] =
          Array.isArray(
            catalogue?.Live,
          )
            ? catalogue.Live
            : [];

      const pageRows = [
        ...fixtures.map(
          (match) => ({
            source:
              "Fixture" as const,
            match,
          }),
        ),

        ...results.map(
          (match) => ({
            source:
              "Result" as const,
            match,
          }),
        ),

        ...live.map(
          (match) => ({
            source:
              "Live" as const,
            match,
          }),
        ),
      ];

      if (
        pageRows.length === 0
      ) {
        break;
      }

      let newMatches = 0;

      for (const row of pageRows) {
        const key =
          getMatchKey(
            row.source,
            row.match,
          );

        if (
          !uniqueMatches.has(key)
        ) {
          uniqueMatches.set(
            key,
            row,
          );

          newMatches += 1;
        }
      }

      if (newMatches === 0) {
        break;
      }
    }

    // =====================================================
    // Resolve DCC matches
    // =====================================================

    currentStage =
      "resolving DCC matches";

    const resolvedMatches:
      ResolvedMatch[] = [];

    for (
      const { match }
      of uniqueMatches.values()
    ) {
      const resolved =
        resolveMatch(
          match,
          mappings,
        );

      if (resolved) {
        resolvedMatches.push(
          resolved,
        );
      }
    }

    // =====================================================
    // Persist discovery
    // =====================================================

    currentStage =
      "persisting external matches";

    for (
      const match
      of resolvedMatches
    ) {
      const upsertRaw =
        await supabase
          .from(
            "external_matches",
          )
          .upsert(
            {
              provider:
                PROVIDER,

              external_match_id:
                match.externalMatchId,

              season:
                seasonYear,

              external_competition_id:
                match.competitionId,

              external_competition_name:
                match.competitionName,

              external_home_team_id:
                null,

              external_home_team_name:
                match.team1Name,

              external_away_team_id:
                null,

              external_away_team_name:
                match.team2Name,

              start_datetime:
                match.startDateTime,

              match_status:
                match.matchStatus,

              is_complete:
                match.isComplete,

              last_checked_at:
                now.toISOString(),
            },
            {
              onConflict:
                "provider,external_match_id",
            },
          )
          .select(
            "id",
          )
          .single();

      const upsertResponse =
        assertSupabaseResponse<
          { id: number }
        >(
          upsertRaw,
          `upserting ${match.externalMatchId}`,
        );

      if (upsertResponse.error) {
        throw new Error(
          `Upsert failed for ${match.externalMatchId}: ` +
          safeErrorMessage(
            upsertResponse.error,
          ),
        );
      }

      if (
        !upsertResponse.data ||
        typeof upsertResponse.data.id !== "number"
      ) {
        throw new Error(
          `Upsert returned no valid id for ${match.externalMatchId}`,
        );
      }

      const externalMatchId =
        upsertResponse.data.id;

      const deleteRaw =
        await supabase
          .from(
            "external_match_teams",
          )
          .delete()
          .eq(
            "external_match_id",
            externalMatchId,
          );

      const deleteResponse =
        assertSupabaseResponse(
          deleteRaw,
          `clearing ownership ${match.externalMatchId}`,
        );

      if (deleteResponse.error) {
        throw new Error(
          `Ownership delete failed for ${match.externalMatchId}: ` +
          safeErrorMessage(
            deleteResponse.error,
          ),
        );
      }

      const ownershipRows =
        match.dccTeamIds.map(
          (teamId) => ({
            external_match_id:
              externalMatchId,
            team_id:
              teamId,
          }),
        );

      if (
        ownershipRows.length > 0
      ) {
        const insertOwnershipRaw =
          await supabase
            .from(
              "external_match_teams",
            )
            .insert(
              ownershipRows,
            );

        const insertOwnershipResponse =
          assertSupabaseResponse(
            insertOwnershipRaw,
            `inserting ownership ${match.externalMatchId}`,
          );

        if (
          insertOwnershipResponse.error
        ) {
          throw new Error(
            `Ownership insert failed for ${match.externalMatchId}: ` +
            safeErrorMessage(
              insertOwnershipResponse.error,
            ),
          );
        }
      }
    }

    // =====================================================
    // Load completed matches
    // =====================================================

    currentStage =
      "loading completed external matches";

    const completedRaw =
      await supabase
        .from(
          "external_matches",
        )
        .select(
          "id, external_match_id, is_complete, match_status",
        )
        .eq(
          "provider",
          PROVIDER,
        )
        .eq(
          "season",
          seasonYear,
        )
        .eq(
          "is_complete",
          true,
        );

    const completedResponse =
      assertSupabaseResponse<
        ExternalMatchRow[]
      >(
        completedRaw,
        currentStage,
      );

    if (completedResponse.error) {
      throw new Error(
        `${currentStage}: ${safeErrorMessage(
          completedResponse.error,
        )}`,
      );
    }

    const completedRows =
      completedResponse.data ?? [];

    // =====================================================
    // Snapshot scorecards
    // =====================================================

    currentStage =
      "snapshotting scorecards";

    let scorecardsFetched = 0;
    let snapshotsCreated = 0;
    let unchangedScorecards = 0;
    let scorecardFailures = 0;

    const snapshotFailures:
      SnapshotFailure[] = [];

    for (
      const externalMatch
      of completedRows
    ) {
      let matchStage =
        "fetch scorecard";

      try {
        const payload =
          await fetchScorecard(
            externalMatch.external_match_id,
          );

        scorecardsFetched += 1;

        matchStage =
          "hash scorecard";

        const payloadHash =
          await sha256Hex(payload);

        matchStage =
          "check existing snapshot";

        const snapshotLookupRaw =
          await supabase
            .from(
              "external_match_snapshots",
            )
            .select(
              "id",
            )
            .eq(
              "external_match_id",
              externalMatch.id,
            )
            .eq(
              "payload_hash",
              payloadHash,
            )
            .limit(1);

        const snapshotLookupResponse =
          assertSupabaseResponse<
            { id: number }[]
          >(
            snapshotLookupRaw,
            matchStage,
          );

        if (
          snapshotLookupResponse.error
        ) {
          throw new Error(
            safeErrorMessage(
              snapshotLookupResponse.error,
            ),
          );
        }

        const existingSnapshots =
          snapshotLookupResponse.data ?? [];

        if (
          existingSnapshots.length > 0
        ) {
          unchangedScorecards += 1;
          continue;
        }

        matchStage =
          "insert snapshot";

        const snapshotInsertRaw =
          await supabase
            .from(
              "external_match_snapshots",
            )
            .insert({
              external_match_id:
                externalMatch.id,

              payload,

              payload_hash:
                payloadHash,
            });

        const snapshotInsertResponse =
          assertSupabaseResponse(
            snapshotInsertRaw,
            matchStage,
          );

        if (
          snapshotInsertResponse.error
        ) {
          throw new Error(
            safeErrorMessage(
              snapshotInsertResponse.error,
            ),
          );
        }

        snapshotsCreated += 1;

        // ===============================================
        // Check whether this external match has already
        // entered the import workflow.
        // ===============================================

        matchStage =
          "check existing imports";

        const existingImportsRaw =
          await supabase
            .from(
              "match_imports",
            )
            .select(
              "id",
            )
            .eq(
              "external_match_id",
              externalMatch.id,
            )
            .limit(1);

        const existingImportsResponse =
          assertSupabaseResponse<
            { id: number }[]
          >(
            existingImportsRaw,
            matchStage,
          );

        if (
          existingImportsResponse.error
        ) {
          throw new Error(
            safeErrorMessage(
              existingImportsResponse.error,
            ),
          );
        }

        const existingImports =
          existingImportsResponse.data ?? [];

        if (
          existingImports.length > 0
        ) {
          matchStage =
            "mark changed upstream";

          const statusUpdateRaw =
            await supabase
              .from(
                "external_matches",
              )
              .update({
                import_status:
                  "Changed Upstream",
              })
              .eq(
                "id",
                externalMatch.id,
              );

          const statusUpdateResponse =
            assertSupabaseResponse(
              statusUpdateRaw,
              matchStage,
            );

          if (
            statusUpdateResponse.error
          ) {
            throw new Error(
              safeErrorMessage(
                statusUpdateResponse.error,
              ),
            );
          }
        }
      } catch (error) {
        scorecardFailures += 1;

        const failure = {
          externalMatchId:
            externalMatch.external_match_id,
          stage:
            matchStage,
          error:
            safeErrorMessage(error),
        };

        snapshotFailures.push(
          failure,
        );

        console.error(
          "Scorecard snapshot failure:",
          failure,
        );
      }
    }

    return jsonResponse({
      success: true,
      skipped: false,

      status:
        "NV Play discovery and scorecard snapshotting complete",

      season:
        seasonYear,

      pagesFetched,

      resolvedDccMatches:
        resolvedMatches.length,

      completedDccExternalMatches:
        completedRows.length,

      scorecardsFetched,

      snapshotsCreated,

      unchangedScorecards,

      scorecardFailures,

      snapshotFailures,

      checkedAt:
        now.toISOString(),
    });
  } catch (error) {
    console.error(
      "NV Play importer fatal failure:",
      {
        stage:
          currentStage,
        error:
          safeErrorMessage(error),
      },
    );

    return jsonResponse(
      {
        success: false,

        stage:
          currentStage,

        error:
          safeErrorMessage(error),
      },
      500,
    );
  }
});