import type {
  CricketEvent,
  DeliveryEvent,
  InningsState,
} from "@/lib/cricket-engine/types";

import { resolveEffectiveEvents } from "../cricket-engine/engine";

export type CanonicalMatchTeamEntry = {
  sourceMatchId: string;
  matchId: string;
  teamId: string;
  competitionId: string;
  opponentId: string | null;
  opponentDisplayName: string;

  result: string | null;

  scheduledOvers: number | null;
  revisedOvers: number | null;

  dccScore: number | null;
  dccWickets: number | null;
  dccBalls: number | null;

  opponentScore: number | null;
  opponentWickets: number | null;
  opponentBalls: number | null;

  matchNotes: string | null;
};

export type CanonicalDccPlayerPerformance = {
  sourceMatchId: string;
  playerId: string;
  teamId: string;

  batted: boolean;
  battingPosition: number | null;
  runs: number | null;
  ballsFaced: number | null;
  fours: number | null;
  sixes: number | null;
  dismissalType: string | null;
  isNotOut: boolean | null;

  bowled: boolean;
  bowlingBalls: number | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  wides: number | null;
  noBalls: number | null;

  wicketsBowled: number | null;
  wicketsCaught: number | null;
  wicketsLbw: number | null;
  wicketsStumped: number | null;
  wicketsCaughtAndBowled: number | null;
  wicketsHitWicket: number | null;

  catches: number | null;
  stumpings: number | null;
  runOuts: number | null;

  performanceNotes: string | null;
};

export type CanonicalPublicationParticipant = {
  matchParticipantId: string;
  sideId: string;
  participantType: "DCC" | "EXTERNAL" | "GUEST";
  dccPlayerId: string | null;
  displayName: string;
};

export type CanonicalPublicationSide = {
  sideId: string;
  sideType: "DCC_TEAM" | "EXTERNAL" | "INTERNAL";
  canonicalTeamId: string | null;
  displayName: string;
};

export type CanonicalPublicationInnings = {
  inningsId: string;
  inningsNumber: 1 | 2;
  battingSideId: string;
  bowlingSideId: string;

  originalScheduledBalls: number | null;
  finalScheduledBalls: number | null;

  openingStrikerParticipantId: string;
  openingNonStrikerParticipantId: string;

  events: CricketEvent[];
  state: InningsState;
};

export type CanonicalPublicationResult =
  | {
      resultType: "WIN";
      winnerSideId: string;
      loserSideId: string;
      winMethod: "RUNS" | "CHASE";
      runMargin: number | null;
      wicketMargin: number | null;
      abandonmentReason: null;
    }
  | {
      resultType: "TIE";
      winnerSideId: null;
      loserSideId: null;
      winMethod: null;
      runMargin: null;
      wicketMargin: null;
      abandonmentReason: null;
    }
  | {
      resultType: "ABANDONED";
      winnerSideId: null;
      loserSideId: null;
      winMethod: null;
      runMargin: null;
      wicketMargin: null;
      abandonmentReason: string | null;
    };

export type CanonicalAppScorerPublication = {
  matchId: string;

  teamEntries: CanonicalMatchTeamEntry[];

  dccPlayers: CanonicalDccPlayerPerformance[];

  scorecard: Record<string, unknown>;
};

export type CanonicalInningsScore = {
  score: number;
  wickets: number;
  balls: number;
};

export type ExistingCanonicalMatchTeamEntry = {
  sourceMatchId: string;
  matchId: string;
  teamId: string;
  competitionId: string;
  opponentId: string | null;
  opponentDisplayName: string;
  scheduledOvers: number | null;
};

export type BuildCanonicalMatchTeamEntryInput = {
  existingEntry: ExistingCanonicalMatchTeamEntry;
  dccSide: CanonicalPublicationSide;
  opponentSide: CanonicalPublicationSide;
  innings: CanonicalPublicationInnings[];
  result: CanonicalPublicationResult;
};

export type BuildCanonicalDccPlayerPerformancesInput = {
  sourceMatchId: string;
  teamId: string;
  dccSide: CanonicalPublicationSide;
  participants: CanonicalPublicationParticipant[];
  innings: CanonicalPublicationInnings[];
};

type BowlerDerivedStats = {
  maidens: number;
  wides: number;
  noBalls: number;

  wicketsBowled: number;
  wicketsCaught: number;
  wicketsLbw: number;
  wicketsStumped: number;
  wicketsCaughtAndBowled: number;
  wicketsHitWicket: number;
};

export function legalBallsToOvers(
  legalBalls: number | null,
): number | null {
  if (legalBalls === null) {
    return null;
  }

  if (!Number.isInteger(legalBalls) || legalBalls < 0) {
    throw new Error(
      "Legal balls must be a non-negative integer.",
    );
  }

  if (legalBalls % 6 !== 0) {
    throw new Error(
      "Scheduled playing conditions must contain whole overs.",
    );
  }

  return legalBalls / 6;
}

export function deriveCanonicalOvers(
  originalScheduledBalls: number | null,
  finalScheduledBalls: number | null,
): {
  scheduledOvers: number | null;
  revisedOvers: number | null;
} {
  const scheduledOvers = legalBallsToOvers(
    originalScheduledBalls,
  );

  const finalOvers = legalBallsToOvers(
    finalScheduledBalls,
  );

  return {
    scheduledOvers,
    revisedOvers:
      finalOvers !== null &&
      finalOvers !== scheduledOvers
        ? finalOvers
        : null,
  };
}

export function deriveCanonicalInningsScore(
  state: InningsState,
): CanonicalInningsScore {
  return {
    score: state.runs,
    wickets: state.wickets,
    balls: state.legalBalls,
  };
}

export function deriveTeamResult(
  result: CanonicalPublicationResult,
  teamSideId: string,
): {
  result: string | null;
  matchNotes: string | null;
} {
  if (result.resultType === "TIE") {
    return {
      result: "Tied",
      matchNotes: "Match tied",
    };
  }

  if (result.resultType === "ABANDONED") {
    return {
      result: "Abandoned",
      matchNotes: result.abandonmentReason
        ? `Match abandoned: ${result.abandonmentReason}`
        : "Match abandoned",
    };
  }

  const teamWon =
    result.winnerSideId === teamSideId;

  const teamLost =
    result.loserSideId === teamSideId;

  if (!teamWon && !teamLost) {
    throw new Error(
      "The team side is not part of the completed match result.",
    );
  }

  if (result.winMethod === "RUNS") {
    if (
      result.runMargin === null ||
      !Number.isInteger(result.runMargin) ||
      result.runMargin <= 0
    ) {
      throw new Error(
        "A runs win requires a positive run margin.",
      );
    }

    return {
      result: teamWon ? "Won" : "Lost",
      matchNotes: `${teamWon ? "Won" : "Lost"} by ${
        result.runMargin
      } ${result.runMargin === 1 ? "run" : "runs"}`,
    };
  }

  if (
    result.wicketMargin === null ||
    !Number.isInteger(result.wicketMargin) ||
    result.wicketMargin <= 0
  ) {
    throw new Error(
      "A chase win requires a positive wicket margin.",
    );
  }

  return {
    result: teamWon ? "Won" : "Lost",
    matchNotes: `${teamWon ? "Won" : "Lost"} by ${
      result.wicketMargin
    } ${
      result.wicketMargin === 1
        ? "wicket"
        : "wickets"
    }`,
  };
}

export function buildCanonicalMatchTeamEntry(
  input: BuildCanonicalMatchTeamEntryInput,
): CanonicalMatchTeamEntry {
  const {
    existingEntry,
    dccSide,
    opponentSide,
    innings,
    result,
  } = input;

  if (!dccSide.canonicalTeamId) {
    throw new Error(
      "The DCC scorer side must have a canonical team ID.",
    );
  }

  if (
    dccSide.canonicalTeamId !==
    existingEntry.teamId
  ) {
    throw new Error(
      "The scorer DCC side does not match the canonical match team entry.",
    );
  }

  const dccInnings = innings.find(
    (inningsEntry) =>
      inningsEntry.battingSideId ===
      dccSide.sideId,
  );

  const opponentInnings = innings.find(
    (inningsEntry) =>
      inningsEntry.battingSideId ===
      opponentSide.sideId,
  );

  if (
    result.resultType !== "ABANDONED" &&
    (!dccInnings || !opponentInnings)
  ) {
    throw new Error(
      "Both completed innings are required for canonical publication.",
    );
  }

  const dccScore = dccInnings
    ? deriveCanonicalInningsScore(
        dccInnings.state,
      )
    : null;

  const opponentScore = opponentInnings
    ? deriveCanonicalInningsScore(
        opponentInnings.state,
      )
    : null;

  const scorerOriginalScheduledBalls =
    dccInnings?.originalScheduledBalls ??
    opponentInnings?.originalScheduledBalls ??
    null;

  const finalScheduledBalls =
    dccInnings?.finalScheduledBalls ??
    opponentInnings?.finalScheduledBalls ??
    scorerOriginalScheduledBalls;

  const originalScheduledBalls =
    existingEntry.scheduledOvers !== null
      ? existingEntry.scheduledOvers * 6
      : scorerOriginalScheduledBalls;

  const {
    scheduledOvers,
    revisedOvers,
  } = deriveCanonicalOvers(
    originalScheduledBalls,
    finalScheduledBalls,
  );

  const canonicalResult =
    deriveTeamResult(
      result,
      dccSide.sideId,
    );

  return {
    sourceMatchId:
      existingEntry.sourceMatchId,
    matchId: existingEntry.matchId,
    teamId: existingEntry.teamId,
    competitionId:
      existingEntry.competitionId,
    opponentId: existingEntry.opponentId,
    opponentDisplayName:
      existingEntry.opponentDisplayName,

    result: canonicalResult.result,

    scheduledOvers,
    revisedOvers,

    dccScore: dccScore?.score ?? null,
    dccWickets:
      dccScore?.wickets ?? null,
    dccBalls: dccScore?.balls ?? null,

    opponentScore:
      opponentScore?.score ?? null,
    opponentWickets:
      opponentScore?.wickets ?? null,
    opponentBalls:
      opponentScore?.balls ?? null,

    matchNotes:
      canonicalResult.matchNotes,
  };
}

function deriveBattingOrder(
  innings: CanonicalPublicationInnings,
): Map<string, number> {
  const order = new Map<string, number>();

  order.set(
    innings.openingStrikerParticipantId,
    1,
  );

  if (
    innings.openingNonStrikerParticipantId !==
    innings.openingStrikerParticipantId
  ) {
    order.set(
      innings.openingNonStrikerParticipantId,
      2,
    );
  }

  let nextPosition = order.size + 1;

  for (
    const event of resolveEffectiveEvents(
      innings.events,
    )
  ) {
    if (event.type !== "BATTER_ENTERED") {
      continue;
    }

    if (order.has(event.batterId)) {
      continue;
    }

    order.set(
      event.batterId,
      nextPosition,
    );

    nextPosition += 1;
  }

  return order;
}

function dismissalTypeForParticipant(
  innings: CanonicalPublicationInnings,
  participantId: string,
): string | null {
  for (
    const event of resolveEffectiveEvents(
      innings.events,
    )
  ) {
    if (
      event.type !== "DELIVERY" ||
      !event.wicket ||
      event.wicket.dismissedBatterId !==
        participantId
    ) {
      continue;
    }

    switch (event.wicket.type) {
      case "BOWLED":
        return "Bowled";

      case "CAUGHT":
        return "Caught";

      case "LBW":
        return "LBW";

      case "STUMPED":
        return "Stumped";

      case "CAUGHT_AND_BOWLED":
        return "Caught & Bowled";

      case "RUN_OUT":
        return "Run Out";

      case "HIT_WICKET":
        return "Hit Wicket";
    }
  }

  return null;
}

function createEmptyBowlerDerivedStats(): BowlerDerivedStats {
  return {
    maidens: 0,
    wides: 0,
    noBalls: 0,

    wicketsBowled: 0,
    wicketsCaught: 0,
    wicketsLbw: 0,
    wicketsStumped: 0,
    wicketsCaughtAndBowled: 0,
    wicketsHitWicket: 0,
  };
}

function getBowlerDerivedStats(
  stats: Map<
    string,
    BowlerDerivedStats
  >,
  participantId: string,
): BowlerDerivedStats {
  const existing = stats.get(participantId);

  if (existing) {
    return existing;
  }

  const created =
    createEmptyBowlerDerivedStats();

  stats.set(participantId, created);

  return created;
}

function bowlerRunsFromDelivery(
  event: DeliveryEvent,
): number {
  return (
    event.batRuns +
    (event.extras?.wides ?? 0) +
    (event.extras?.noBalls ?? 0)
  );
}

function deriveBowlerEventStats(
  innings: CanonicalPublicationInnings,
): Map<string, BowlerDerivedStats> {
  const stats =
    new Map<string, BowlerDerivedStats>();

  let currentOverBowlerId:
    | string
    | null = null;

  let currentOverBowlerRuns = 0;

  let currentOverHasDelivery = false;

  for (
    const event of resolveEffectiveEvents(
      innings.events,
    )
  ) {
    if (event.type === "DELIVERY") {
      const bowlerStats =
        getBowlerDerivedStats(
          stats,
          event.bowlerId,
        );

      bowlerStats.wides +=
        event.extras?.wides ?? 0;

      bowlerStats.noBalls +=
        event.extras?.noBalls ?? 0;

      if (
        currentOverBowlerId === null
      ) {
        currentOverBowlerId =
          event.bowlerId;
      }

      if (
        currentOverBowlerId !==
        event.bowlerId
      ) {
        /*
         * The scorer engine should not permit
         * a bowler to change inside an active
         * over. Fail closed here rather than
         * silently publishing a misleading
         * maiden count.
         */
        throw new Error(
          "A completed over contains deliveries from more than one bowler.",
        );
      }

      currentOverHasDelivery = true;

      currentOverBowlerRuns +=
        bowlerRunsFromDelivery(event);

      if (event.wicket) {
        switch (event.wicket.type) {
          case "BOWLED":
            bowlerStats.wicketsBowled += 1;
            break;

          case "CAUGHT":
            bowlerStats.wicketsCaught += 1;
            break;

          case "LBW":
            bowlerStats.wicketsLbw += 1;
            break;

          case "STUMPED":
            bowlerStats.wicketsStumped += 1;
            break;

          case "CAUGHT_AND_BOWLED":
            bowlerStats.wicketsCaughtAndBowled +=
              1;
            break;

          case "HIT_WICKET":
            bowlerStats.wicketsHitWicket += 1;
            break;

          case "RUN_OUT":
            break;
        }
      }

      continue;
    }

    if (event.type !== "OVER_ENDED") {
      continue;
    }

    if (
      currentOverHasDelivery &&
      currentOverBowlerId !== null &&
      currentOverBowlerRuns === 0
    ) {
      getBowlerDerivedStats(
        stats,
        currentOverBowlerId,
      ).maidens += 1;
    }

    currentOverBowlerId = null;
    currentOverBowlerRuns = 0;
    currentOverHasDelivery = false;
  }

  /*
   * An unfinished over is deliberately not
   * counted as a maiden. A maiden only exists
   * once OVER_ENDED has been recorded.
   */
  return stats;
}

export function buildCanonicalDccPlayerPerformances(
  input: BuildCanonicalDccPlayerPerformancesInput,
): CanonicalDccPlayerPerformance[] {
  const {
    sourceMatchId,
    teamId,
    dccSide,
    participants,
    innings,
  } = input;

  if (!dccSide.canonicalTeamId) {
    throw new Error(
      "The DCC scorer side must have a canonical team ID.",
    );
  }

  if (dccSide.canonicalTeamId !== teamId) {
    throw new Error(
      "The scorer DCC side does not match the canonical performance team.",
    );
  }

  const dccBattingInnings =
    innings.find(
      (inningsEntry) =>
        inningsEntry.battingSideId ===
        dccSide.sideId,
    );

  const dccBowlingInnings =
    innings.find(
      (inningsEntry) =>
        inningsEntry.bowlingSideId ===
        dccSide.sideId,
    );

  if (
    !dccBattingInnings ||
    !dccBowlingInnings
  ) {
    throw new Error(
      "Both DCC batting and bowling innings are required for canonical player publication.",
    );
  }

  const dccParticipants =
    participants.filter(
      (participant) =>
        participant.sideId ===
          dccSide.sideId &&
        participant.participantType ===
          "DCC" &&
        participant.dccPlayerId !== null,
    );

  const seenPlayerIds = new Set<string>();

  for (const participant of dccParticipants) {
    const playerId =
      participant.dccPlayerId;

    if (playerId === null) {
      continue;
    }

    if (seenPlayerIds.has(playerId)) {
      throw new Error(
        `DCC player ${playerId} appears more than once in the scorer participants.`,
      );
    }

    seenPlayerIds.add(playerId);
  }

  const battingOrder =
    deriveBattingOrder(
      dccBattingInnings,
    );

  const bowlerEventStats =
    deriveBowlerEventStats(
      dccBowlingInnings,
    );

  return dccParticipants.map(
    (
      participant,
    ): CanonicalDccPlayerPerformance => {
      const playerId =
        participant.dccPlayerId;

      if (playerId === null) {
        throw new Error(
          "A canonical DCC participant is missing its DCC player ID.",
        );
      }

      const participantId =
        participant.matchParticipantId;

      const batter =
        dccBattingInnings.state
          .batters[participantId];

      const bowler =
        dccBowlingInnings.state
          .bowlers[participantId];

      const fielder =
        dccBowlingInnings.state
          .fielders[participantId];

      const battingPosition =
        battingOrder.get(participantId) ??
        null;

      const batted =
        battingPosition !== null ||
        batter !== undefined;

      const bowled =
        bowler !== undefined;

      const derivedBowling =
        bowlerEventStats.get(
          participantId,
        );

      const dismissalType =
        batted
          ? dismissalTypeForParticipant(
              dccBattingInnings,
              participantId,
            )
          : null;

      return {
        sourceMatchId,
        playerId,
        teamId,

        batted,

        battingPosition:
          batted
            ? battingPosition
            : null,

        runs:
          batted
            ? batter?.runs ?? 0
            : null,

        ballsFaced:
          batted
            ? batter?.balls ?? 0
            : null,

        fours:
          batted
            ? batter?.fours ?? 0
            : null,

        sixes:
          batted
            ? batter?.sixes ?? 0
            : null,

        dismissalType,

        isNotOut:
          batted
            ? !(batter?.dismissed ?? false)
            : null,

        bowled,

        bowlingBalls:
          bowled
            ? bowler.legalBalls
            : null,

        maidens:
          bowled
            ? derivedBowling?.maidens ?? 0
            : null,

        runsConceded:
          bowled
            ? bowler.runsConceded
            : null,

        wickets:
          bowled
            ? bowler.wickets
            : null,

        wides:
          bowled
            ? derivedBowling?.wides ?? 0
            : null,

        noBalls:
          bowled
            ? derivedBowling?.noBalls ?? 0
            : null,

        wicketsBowled:
          bowled
            ? derivedBowling
                ?.wicketsBowled ?? 0
            : null,

        wicketsCaught:
          bowled
            ? derivedBowling
                ?.wicketsCaught ?? 0
            : null,

        wicketsLbw:
          bowled
            ? derivedBowling
                ?.wicketsLbw ?? 0
            : null,

        wicketsStumped:
          bowled
            ? derivedBowling
                ?.wicketsStumped ?? 0
            : null,

        wicketsCaughtAndBowled:
          bowled
            ? derivedBowling
                ?.wicketsCaughtAndBowled ??
              0
            : null,

        wicketsHitWicket:
          bowled
            ? derivedBowling
                ?.wicketsHitWicket ?? 0
            : null,

        catches:
          fielder?.catches ?? 0,

        stumpings:
          fielder?.stumpings ?? 0,

        runOuts:
          fielder?.runOuts ?? 0,

        performanceNotes: null,
      };
    },
  );
}