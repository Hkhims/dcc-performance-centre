import { describe, expect, it } from "vitest";

import { deriveInningsState } from "./engine";
import { formatOvers, type CricketEvent } from "./types";

const presidentDemoOpeningOver: CricketEvent[] = [
  {
    id: "delivery-1",
    type: "DELIVERY",
    strikerId: "himanshu",
    nonStrikerId: "venky",
    bowlerId: "bowler-1",
    batRuns: 1,
  },
  {
    id: "delivery-2",
    type: "DELIVERY",
    strikerId: "venky",
    nonStrikerId: "himanshu",
    bowlerId: "bowler-1",
    batRuns: 0,
  },
  {
    id: "delivery-3",
    type: "DELIVERY",
    strikerId: "venky",
    nonStrikerId: "himanshu",
    bowlerId: "bowler-1",
    batRuns: 4,
  },
  {
    id: "delivery-4",
    type: "DELIVERY",
    strikerId: "venky",
    nonStrikerId: "himanshu",
    bowlerId: "bowler-1",
    batRuns: 1,
  },
  {
    id: "delivery-5",
    type: "DELIVERY",
    strikerId: "himanshu",
    nonStrikerId: "venky",
    bowlerId: "bowler-1",
    batRuns: 6,
  },
  {
    id: "delivery-6",
    type: "DELIVERY",
    strikerId: "himanshu",
    nonStrikerId: "venky",
    bowlerId: "bowler-1",
    batRuns: 0,
    wicket: {
      type: "BOWLED",
      dismissedBatterId: "himanshu",
    },
  },
];

describe("deriveInningsState", () => {
  it("derives the President demo opening over before the scorer ends the over", () => {
    const state = deriveInningsState(
      presidentDemoOpeningOver,
    );

    expect(state.runs).toBe(12);
    expect(state.wickets).toBe(1);
    expect(state.legalBalls).toBe(6);

    expect(state.completedOvers).toBe(0);
    expect(state.legalBallsInCurrentOver).toBe(6);
    expect(state.overReadyToEnd).toBe(true);

    expect(
      formatOvers(
        state.completedOvers,
        state.legalBallsInCurrentOver,
      ),
    ).toBe("0.6");

    expect(state.batters.himanshu).toEqual({
      participantId: "himanshu",
      runs: 7,
      balls: 3,
      fours: 0,
      sixes: 1,
      dismissed: true,
    });

    expect(state.batters.venky).toEqual({
      participantId: "venky",
      runs: 5,
      balls: 3,
      fours: 1,
      sixes: 0,
      dismissed: false,
    });

    expect(state.bowlers["bowler-1"]).toEqual({
      participantId: "bowler-1",
      legalBalls: 6,
      runsConceded: 12,
      wickets: 1,
    });

    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("venky");
    expect(state.currentBowlerId).toBe("bowler-1");
  });

  it("changes ends only when the scorer confirms End Over", () => {
    const events: CricketEvent[] = [
      ...presidentDemoOpeningOver,
      {
        id: "over-1-ended",
        type: "OVER_ENDED",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(12);
    expect(state.wickets).toBe(1);

    expect(state.completedOvers).toBe(1);
    expect(state.legalBallsInCurrentOver).toBe(0);
    expect(state.overReadyToEnd).toBe(false);

    expect(
      formatOvers(
        state.completedOvers,
        state.legalBallsInCurrentOver,
      ),
    ).toBe("1.0");

    expect(state.strikerId).toBe("venky");
    expect(state.nonStrikerId).toBeNull();

    expect(state.currentBowlerId).toBeNull();
  });

  it("ignores an invalid End Over event before six legal balls", () => {
    const events: CricketEvent[] = [
      {
        id: "delivery-1",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
      },
      {
        id: "invalid-over-end",
        type: "OVER_ENDED",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.completedOvers).toBe(0);
    expect(state.legalBallsInCurrentOver).toBe(1);
    expect(state.overReadyToEnd).toBe(false);

    expect(state.strikerId).toBe("venky");
    expect(state.nonStrikerId).toBe("himanshu");
  });

  it("replays deterministically from the same event ledger", () => {
    expect(
      deriveInningsState(presidentDemoOpeningOver),
    ).toEqual(
      deriveInningsState(presidentDemoOpeningOver),
    );
  });

  it("does not mutate the event ledger", () => {
    const events = structuredClone(
      presidentDemoOpeningOver,
    );

    const originalEvents = structuredClone(events);

    deriveInningsState(events);

    expect(events).toEqual(originalEvents);
  });
});