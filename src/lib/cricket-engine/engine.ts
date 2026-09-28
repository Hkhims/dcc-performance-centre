import type {
  BatterState,
  BowlerState,
  CricketEvent,
  InningsState,
  ParticipantId,
} from "./types";

function createBatter(participantId: ParticipantId): BatterState {
  return {
    participantId,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dismissed: false,
  };
}

function createBowler(participantId: ParticipantId): BowlerState {
  return {
    participantId,
    legalBalls: 0,
    runsConceded: 0,
    wickets: 0,
  };
}

export function deriveInningsState(events: CricketEvent[]): InningsState {
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
    batters: {},
    bowlers: {},
  };

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

    state.runs += event.batRuns;
    state.legalBalls += 1;
    state.legalBallsInCurrentOver += 1;

    striker.runs += event.batRuns;
    striker.balls += 1;

    if (event.batRuns === 4) {
      striker.fours += 1;
    }

    if (event.batRuns === 6) {
      striker.sixes += 1;
    }

    bowler.legalBalls += 1;
    bowler.runsConceded += event.batRuns;

    if (event.wicket) {
      state.wickets += 1;
      bowler.wickets += 1;

      const dismissedBatter =
        state.batters[event.wicket.dismissedBatterId] ??
        createBatter(event.wicket.dismissedBatterId);

      dismissedBatter.dismissed = true;

      state.batters[event.wicket.dismissedBatterId] =
        dismissedBatter;
    }

    const battersChangeEnds = event.batRuns % 2 === 1;

    let strikerAfterDelivery: ParticipantId | null =
      battersChangeEnds
        ? event.nonStrikerId
        : event.strikerId;

    let nonStrikerAfterDelivery: ParticipantId | null =
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
    state.nonStrikerId = nonStrikerAfterDelivery;
    state.currentBowlerId = event.bowlerId;

    if (state.legalBallsInCurrentOver === 6) {
      state.overReadyToEnd = true;
    }
  }

  return state;
}