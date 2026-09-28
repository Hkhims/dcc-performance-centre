import type {
  BatterState,
  BowlerState,
  CricketEvent,
  FielderState,
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

export function deriveInningsState(
  events: CricketEvent[],
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
  };

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

  for (const event of events) {
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
      state.currentBowlerId = null;

      continue;
    }

    const striker =
      state.batters[event.strikerId] ??
      createBatter(event.strikerId);

    const nonStriker =
      state.batters[event.nonStrikerId] ??
      createBatter(event.nonStrikerId);

    const bowler =
      state.bowlers[event.bowlerId] ??
      createBowler(event.bowlerId);

    state.batters[event.strikerId] = striker;
    state.batters[event.nonStrikerId] = nonStriker;
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

    if (event.batRuns === 4) {
      striker.fours += 1;
    }

    if (event.batRuns === 6) {
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

      const dismissedBatter =
        state.batters[
          event.wicket.dismissedBatterId
        ] ??
        createBatter(
          event.wicket.dismissedBatterId,
        );

      dismissedBatter.dismissed = true;

      state.batters[
        event.wicket.dismissedBatterId
      ] = dismissedBatter;

      switch (event.wicket.type) {
        case "CAUGHT": {
          const fielder = getFielder(
            event.wicket.fielderId,
          );

          fielder.catches += 1;
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

          for (
            const fielderId
            of uniqueFielderIds
          ) {
            const fielder =
              getFielder(fielderId);

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

    const physicalRuns =
      event.running?.completedRuns ??
      event.batRuns;

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
  }

  return state;
}