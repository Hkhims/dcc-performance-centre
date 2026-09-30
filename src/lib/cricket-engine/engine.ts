import type {
  BatterState,
  BowlerState,
  CricketActionEvent,
  CricketEvent,
  DeliveryEvent,
  FielderState,
  InningsPlayingConditions,
  InningsState,
  ParticipantId,
} from "./types";

function createBatter(
  participantId: ParticipantId,
): BatterState {
  return {
    participantId,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dismissed: false,
    retired: false,
  };
}

function createBowler(
  participantId: ParticipantId,
): BowlerState {
  return {
    participantId,
    legalBalls: 0,
    runsConceded: 0,
    wickets: 0,
  };
}

function createFielder(
  participantId: ParticipantId,
): FielderState {
  return {
    participantId,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
  };
}
function isValidDelivery(event: DeliveryEvent): boolean {
  const wideRuns = event.extras?.wides ?? 0;
  const noBallRuns = event.extras?.noBalls ?? 0;
  const byeRuns = event.extras?.byes ?? 0;
  const legByeRuns = event.extras?.legByes ?? 0;

  const isWide = wideRuns > 0;
  const isNoBall = noBallRuns > 0;
    if (
    event.batRuns < 0 ||
    wideRuns < 0 ||
    noBallRuns < 0 ||
    byeRuns < 0 ||
    legByeRuns < 0
  ) {
    return false;
  }

  if (isWide && isNoBall) {
    return false;
  }

  if (
    isWide &&
    (
      event.batRuns > 0 ||
      byeRuns > 0 ||
      legByeRuns > 0
    )
  ) {
    return false;
  }

  if (byeRuns > 0 && legByeRuns > 0) {
    return false;
  }

  if (!event.wicket) {
    return true;
  }
    if (
    event.wicket.dismissedBatterId !== event.strikerId &&
    event.wicket.dismissedBatterId !== event.nonStrikerId
  ) {
    return false;
  }
  if (
    isWide &&
    (
      event.wicket.type === "BOWLED" ||
      event.wicket.type === "CAUGHT" ||
      event.wicket.type === "LBW" ||
      event.wicket.type === "HIT_WICKET" ||
      event.wicket.type === "CAUGHT_AND_BOWLED"
    )
  ) {
    return false;
  }

  if (
    isNoBall &&
    (
      event.wicket.type === "BOWLED" ||
      event.wicket.type === "CAUGHT" ||
      event.wicket.type === "LBW" ||
      event.wicket.type === "STUMPED" ||
      event.wicket.type === "CAUGHT_AND_BOWLED"
    )
  ) {
    return false;
  }

  return true;
}
function resolveEffectiveEvents(
  events: CricketEvent[],
): CricketActionEvent[] {
  const actionEvents = new Map<string, CricketActionEvent>();

  for (const event of events) {
    if (
      event.type !== "EVENT_VOIDED" &&
      event.type !== "EVENT_REPLACED"
    ) {
      actionEvents.set(event.id, event);
    }
  }

  const voidedEventIds = new Set<string>();
  const replacements = new Map<string, CricketActionEvent>();

  for (const event of events) {
    if (event.type === "EVENT_VOIDED") {
      if (actionEvents.has(event.targetEventId)) {
        voidedEventIds.add(event.targetEventId);
        replacements.delete(event.targetEventId);
      }

      continue;
    }

    if (event.type === "EVENT_REPLACED") {
      const original = actionEvents.get(event.targetEventId);

      if (!original) {
        continue;
      }

      if (
        event.replacement.type === "DELIVERY" &&
        !isValidDelivery(event.replacement)
      ) {
        continue;
      }

      voidedEventIds.delete(event.targetEventId);
      replacements.set(
        event.targetEventId,
        event.replacement,
      );
    }
  }

  const effectiveEvents: CricketActionEvent[] = [];

  for (const event of events) {
    if (
      event.type === "EVENT_VOIDED" ||
      event.type === "EVENT_REPLACED"
    ) {
      continue;
    }

    if (voidedEventIds.has(event.id)) {
      continue;
    }

    effectiveEvents.push(
      replacements.get(event.id) ?? event,
    );
  }

  return effectiveEvents;
}
export function deriveInningsState(
  events: CricketEvent[],
  playingConditions: InningsPlayingConditions = {},
): InningsState {
  const state: InningsState = {
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    completedOvers: 0,
    legalBallsInCurrentOver: 0,
    overReadyToEnd: false,
    strikerId: null,
    nonStrikerId: null,
    currentBowlerId: null,
    previousOverBowlerId: null,
    extras: {
      wides: 0,
      noBalls: 0,
      byes: 0,
      legByes: 0,
      penalty: 0,
      total: 0,
    },
    batters: {},
    bowlers: {},
    fielders: {},
    chase: null,
    oppositionPenaltyRuns: 0,
    completion: {
      completed: false,
      reason: null,
    },
    endRecommendation: {
      recommended: false,
      reason: null,
    },
    break: {
      active: false,
      reason: null,
      note: null,
    },
    playingConditions: {
      target: playingConditions.target ?? null,
      scheduledLegalBalls:
        playingConditions.scheduledLegalBalls ?? null,
    },
        currentWicketkeeperId: null,
        currentScorerId: null,
  };
  function getBatter(
    participantId: ParticipantId,
  ): BatterState {
    const existing = state.batters[participantId];

    if (existing) {
      return existing;
    }

    const batter = createBatter(participantId);
    state.batters[participantId] = batter;

    return batter;
  }

  function getFielder(
    participantId: ParticipantId,
  ): FielderState {
    const existing = state.fielders[participantId];

    if (existing) {
      return existing;
    }

    const fielder = createFielder(participantId);
    state.fielders[participantId] = fielder;

    return fielder;
  }
  function updateEndRecommendation() {
    if (state.wickets >= 10) {
      state.endRecommendation = {
        recommended: true,
        reason: "ALL_OUT",
      };
      return;
    }

    const target = state.playingConditions.target;

    if (target !== null && state.runs >= target) {
      state.endRecommendation = {
        recommended: true,
        reason: "TARGET_REACHED",
      };
      return;
    }

    const scheduledLegalBalls =
      state.playingConditions.scheduledLegalBalls;

    if (
      scheduledLegalBalls !== null &&
      state.legalBalls >= scheduledLegalBalls
    ) {
      state.endRecommendation = {
        recommended: true,
        reason: "BALL_LIMIT_REACHED",
      };
      return;
    }

    state.endRecommendation = {
      recommended: false,
      reason: null,
    };
  }

  for (const event of resolveEffectiveEvents(events)) {
    if (state.completion.completed) {
      continue;
    }

    if (event.type === "INNINGS_ENDED") {
      state.completion = {
        completed: true,
        reason: event.reason,
      };

      continue;
    }

    if (event.type === "BREAK_STARTED") {
      if (!state.break.active) {
        state.break = {
          active: true,
          reason: event.reason,
          note: event.note ?? null,
        };
      }

      continue;
    }

    if (event.type === "BREAK_ENDED") {
      if (state.break.active) {
        state.break = {
          active: false,
          reason: null,
          note: null,
        };
      }

      continue;
    }

    if (state.break.active) {
      continue;
    }
    if (event.type === "PLAYING_CONDITIONS_CHANGED") {
      state.playingConditions.scheduledLegalBalls =
        event.scheduledLegalBalls;

      updateEndRecommendation();

      continue;
    }

    if (event.type === "TARGET_REVISED") {
      state.playingConditions.target =
        event.target;

      updateEndRecommendation();

      continue;
    }

    if (event.type === "WICKETKEEPER_CHANGED") {
      state.currentWicketkeeperId =
        event.wicketkeeperId;

      continue;
    }
    if (event.type === "SCORER_HANDOVER") {
      state.currentScorerId = event.scorerId;

      continue;
    }
    if (event.type === "OVER_ENDED") {
      if (!state.overReadyToEnd) {
        continue;
      }

      const previousStriker = state.strikerId;

      state.strikerId = state.nonStrikerId;
      state.nonStrikerId = previousStriker;

      state.completedOvers += 1;
      state.legalBallsInCurrentOver = 0;
      state.overReadyToEnd = false;
      state.previousOverBowlerId = state.currentBowlerId;
      state.currentBowlerId = null;

      continue;
    }

    if (event.type === "BATTER_RETIRED") {
      const batter = getBatter(event.batterId);

      if (batter.dismissed) {
        continue;
      }

      batter.retired = true;

      if (state.strikerId === event.batterId) {
        state.strikerId = null;
      }

      if (state.nonStrikerId === event.batterId) {
        state.nonStrikerId = null;
      }

      continue;
    }

    if (event.type === "BATTER_RETURNED") {
      const batter = getBatter(event.batterId);

      if (batter.dismissed || !batter.retired) {
        continue;
      }

      if (event.end === "STRIKER") {
        if (
          state.strikerId !== null &&
          state.strikerId !== event.batterId
        ) {
          continue;
        }

        if (state.nonStrikerId === event.batterId) {
          state.nonStrikerId = null;
        }

        state.strikerId = event.batterId;
      } else {
        if (
          state.nonStrikerId !== null &&
          state.nonStrikerId !== event.batterId
        ) {
          continue;
        }

        if (state.strikerId === event.batterId) {
          state.strikerId = null;
        }

        state.nonStrikerId = event.batterId;
      }

      batter.retired = false;

      continue;
    }

        if (event.type === "PENALTY_RUNS") {
      if (event.awardedTo === "BATTING") {
        state.runs += event.runs;
        state.extras.penalty += event.runs;
        state.extras.total += event.runs;
      } else {
        state.oppositionPenaltyRuns += event.runs;
      }
      updateEndRecommendation();
      continue;
    }
    if (!isValidDelivery(event)) {
      continue;
    }

    if (event.wicket && state.wickets >= 10) {
      continue;
    }

    if (
      state.legalBallsInCurrentOver === 0 &&
      state.completedOvers > 0 &&
      state.previousOverBowlerId !== null &&
      event.bowlerId === state.previousOverBowlerId
    ) {
      continue;
    }

    const striker = getBatter(event.strikerId);
    getBatter(event.nonStrikerId);

    const bowler =
      state.bowlers[event.bowlerId] ??
      createBowler(event.bowlerId);

    state.bowlers[event.bowlerId] = bowler;

    const wideRuns = event.extras?.wides ?? 0;
    const noBallRuns = event.extras?.noBalls ?? 0;
    const byeRuns = event.extras?.byes ?? 0;
    const legByeRuns = event.extras?.legByes ?? 0;

    const extrasTotal =
      wideRuns +
      noBallRuns +
      byeRuns +
      legByeRuns;

    const deliveryRuns =
      event.batRuns + extrasTotal;

    const isWide = wideRuns > 0;
    const isNoBall = noBallRuns > 0;
    const isLegalDelivery =
      !isWide && !isNoBall;

    state.runs += deliveryRuns;

    state.extras.wides += wideRuns;
    state.extras.noBalls += noBallRuns;
    state.extras.byes += byeRuns;
    state.extras.legByes += legByeRuns;
    state.extras.total += extrasTotal;

    if (isLegalDelivery) {
      state.legalBalls += 1;
      state.legalBallsInCurrentOver += 1;

      striker.balls += 1;
      bowler.legalBalls += 1;
    }

    striker.runs += event.batRuns;

    const boundary =
      event.boundary ??
      (event.batRuns === 4
        ? "FOUR"
        : event.batRuns === 6
          ? "SIX"
          : "NONE");

    if (boundary === "FOUR" && event.batRuns === 4) {
      striker.fours += 1;
    }

    if (boundary === "SIX" && event.batRuns === 6) {
      striker.sixes += 1;
    }

    const bowlerRunsConceded =
      event.batRuns +
      wideRuns +
      noBallRuns;

    bowler.runsConceded +=
      bowlerRunsConceded;

    if (event.wicket) {
      state.wickets += 1;

      if (event.wicket.type !== "RUN_OUT") {
        bowler.wickets += 1;
      }

      const dismissedBatter = getBatter(
        event.wicket.dismissedBatterId,
      );

      dismissedBatter.dismissed = true;
      dismissedBatter.retired = false;

      switch (event.wicket.type) {
        case "CAUGHT": {
          if (event.wicket.fielderId) {
            const fielder = getFielder(
              event.wicket.fielderId,
            );

            fielder.catches += 1;
          }
          break;
        }

        case "CAUGHT_AND_BOWLED": {
          const fielder = getFielder(
            event.bowlerId,
          );

          fielder.catches += 1;
          break;
        }

        case "STUMPED": {
          const fielder = getFielder(
            event.wicket.fielderId,
          );

          fielder.stumpings += 1;
          break;
        }

        case "RUN_OUT": {
          const uniqueFielderIds =
            new Set(event.wicket.fielderIds);

          for (const fielderId of uniqueFielderIds) {
            const fielder = getFielder(fielderId);

            fielder.runOuts += 1;
          }

          break;
        }

        case "BOWLED":
        case "LBW":
        case "HIT_WICKET":
          break;
      }
    }

    const isCaughtDismissal =
      event.wicket?.type === "CAUGHT" ||
      event.wicket?.type === "CAUGHT_AND_BOWLED";

    const physicalRuns = isCaughtDismissal
      ? 0
      : event.running?.completedRuns ?? event.batRuns;

    const battersChangeEnds =
      physicalRuns % 2 === 1;

    let strikerAfterDelivery:
      | ParticipantId
      | null =
      battersChangeEnds
        ? event.nonStrikerId
        : event.strikerId;

    let nonStrikerAfterDelivery:
      | ParticipantId
      | null =
      battersChangeEnds
        ? event.strikerId
        : event.nonStrikerId;

    if (event.wicket) {
      if (
        event.wicket.dismissedBatterId ===
        strikerAfterDelivery
      ) {
        strikerAfterDelivery = null;
      }

      if (
        event.wicket.dismissedBatterId ===
        nonStrikerAfterDelivery
      ) {
        nonStrikerAfterDelivery = null;
      }
    }

    state.strikerId = strikerAfterDelivery;
    state.nonStrikerId =
      nonStrikerAfterDelivery;
    state.currentBowlerId =
      event.bowlerId;

        if (
      state.legalBallsInCurrentOver === 6
    ) {
      state.overReadyToEnd = true;
    }
    updateEndRecommendation();

  }

  const effectiveTarget =
    state.playingConditions.target;

  if (effectiveTarget !== null) {
    const target = effectiveTarget;
    const firstInningsScore = target - 1;

    const scheduledLegalBalls =
      state.playingConditions.scheduledLegalBalls;

    const ballsRemaining =
      scheduledLegalBalls !== null
        ? Math.max(
            scheduledLegalBalls -
              state.legalBalls,
            0,
          )
        : null;

    state.chase = {
      target,
      runsRequired: Math.max(
        target - state.runs,
        0,
      ),
      ballsRemaining,
      targetReached: state.runs >= target,
      scoresLevel:
        state.runs === firstInningsScore,
    };
  }

  return state;
}