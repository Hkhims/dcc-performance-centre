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
      retired: false,
    });
    expect(state.batters.venky).toEqual({
      participantId: "venky",
      runs: 5,
      balls: 3,
      fours: 1,
      sixes: 0,
      dismissed: false,
      retired: false,
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
  it("scores a single wide without consuming a legal ball", () => {
    const events: CricketEvent[] = [
      {
        id: "wide-1",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 1,
        },
        running: {
          completedRuns: 0,
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(1);
    expect(state.extras).toEqual({
      wides: 1,
      noBalls: 0,
      byes: 0,
      legByes: 0,
      penalty: 0,
      total: 1,
    });
    expect(state.legalBalls).toBe(0);
    expect(state.legalBallsInCurrentOver).toBe(0);
    expect(state.overReadyToEnd).toBe(false);
    expect(state.batters.himanshu.runs).toBe(0);
    expect(state.batters.himanshu.balls).toBe(0);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(1);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(0);
    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBe("venky");
  });
  it("scores multiple wides with an even number of physical runs without changing ends", () => {
    const events: CricketEvent[] = [
      {
        id: "wide-3",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 3,
        },
        running: {
          completedRuns: 2,
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(3);
    expect(state.extras.wides).toBe(3);
    expect(state.extras.total).toBe(3);
    expect(state.legalBalls).toBe(0);
    expect(state.legalBallsInCurrentOver).toBe(0);
    expect(state.batters.himanshu.runs).toBe(0);
    expect(state.batters.himanshu.balls).toBe(0);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(3);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(0);
    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBe("venky");
  });
  it("scores two wides and changes ends after one physical run", () => {
    const events: CricketEvent[] = [
      {
        id: "wide-2",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 2,
        },
        running: {
          completedRuns: 1,
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(2);
    expect(state.extras.wides).toBe(2);
    expect(state.extras.total).toBe(2);
    expect(state.legalBalls).toBe(0);
    expect(state.legalBallsInCurrentOver).toBe(0);
    expect(state.overReadyToEnd).toBe(false);
    expect(state.batters.himanshu.runs).toBe(0);
    expect(state.batters.himanshu.balls).toBe(0);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(2);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(0);
    expect(state.strikerId).toBe("venky");
    expect(state.nonStrikerId).toBe("himanshu");
  });
  it("scores a simple no-ball without consuming a legal ball", () => {
    const events: CricketEvent[] = [
      {
        id: "no-ball-1",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          noBalls: 1,
        },
        running: {
          completedRuns: 0,
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(1);
    expect(state.extras).toEqual({
      wides: 0,
      noBalls: 1,
      byes: 0,
      legByes: 0,
      penalty: 0,
      total: 1,
    });
    expect(state.legalBalls).toBe(0);
    expect(state.legalBallsInCurrentOver).toBe(0);
    expect(state.overReadyToEnd).toBe(false);
    expect(state.batters.himanshu.runs).toBe(0);
    expect(state.batters.himanshu.balls).toBe(0);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(1);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(0);
    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBe("venky");
  });
  it("scores a no-ball plus a boundary correctly", () => {
    const events: CricketEvent[] = [
      {
        id: "no-ball-four",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
        extras: {
          noBalls: 1,
        },
        running: {
          completedRuns: 0,
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(5);
    expect(state.extras).toEqual({
      wides: 0,
      noBalls: 1,
      byes: 0,
      legByes: 0,
      penalty: 0,
      total: 1,
    });
    expect(state.batters.himanshu).toEqual({
      participantId: "himanshu",
      runs: 4,
      balls: 0,
      fours: 1,
      sixes: 0,
      dismissed: false,
      retired: false,
    });
    expect(state.legalBalls).toBe(0);
    expect(state.legalBallsInCurrentOver).toBe(0);
    expect(state.overReadyToEnd).toBe(false);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(5);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(0);
    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBe("venky");
  });
  it("scores a single bye as a legal delivery without charging the bowler", () => {
    const events: CricketEvent[] = [
      {
        id: "bye-1",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          byes: 1,
        },
        running: {
          completedRuns: 1,
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(1);
    expect(state.extras.byes).toBe(1);
    expect(state.extras.total).toBe(1);
    expect(state.legalBalls).toBe(1);
    expect(state.legalBallsInCurrentOver).toBe(1);
    expect(state.batters.himanshu.runs).toBe(0);
    expect(state.batters.himanshu.balls).toBe(1);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(0);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(1);
    expect(state.strikerId).toBe("venky");
    expect(state.nonStrikerId).toBe("himanshu");
  });
  it("scores multiple byes and keeps the striker after an even number of physical runs", () => {
    const events: CricketEvent[] = [
      {
        id: "bye-2",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          byes: 2,
        },
        running: {
          completedRuns: 2,
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(2);
    expect(state.extras.byes).toBe(2);
    expect(state.extras.total).toBe(2);
    expect(state.legalBalls).toBe(1);
    expect(state.legalBallsInCurrentOver).toBe(1);
    expect(state.batters.himanshu.runs).toBe(0);
    expect(state.batters.himanshu.balls).toBe(1);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(0);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(1);
    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBe("venky");
  });
  it("scores a single leg-bye as a legal delivery without charging the bowler", () => {
    const events: CricketEvent[] = [
      {
        id: "leg-bye-1",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          legByes: 1,
        },
        running: {
          completedRuns: 1,
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(1);
    expect(state.extras.legByes).toBe(1);
    expect(state.extras.total).toBe(1);
    expect(state.legalBalls).toBe(1);
    expect(state.legalBallsInCurrentOver).toBe(1);
    expect(state.batters.himanshu.runs).toBe(0);
    expect(state.batters.himanshu.balls).toBe(1);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(0);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(1);
    expect(state.strikerId).toBe("venky");
    expect(state.nonStrikerId).toBe("himanshu");
  });
  it("scores four leg-byes without crediting a boundary to the batter or bowler", () => {
    const events: CricketEvent[] = [
      {
        id: "leg-bye-4",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          legByes: 4,
        },
        running: {
          completedRuns: 0,
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(4);
    expect(state.extras.legByes).toBe(4);
    expect(state.extras.total).toBe(4);
    expect(state.legalBalls).toBe(1);
    expect(state.legalBallsInCurrentOver).toBe(1);
    expect(state.batters.himanshu).toEqual({
      participantId: "himanshu",
      runs: 0,
      balls: 1,
      fours: 0,
      sixes: 0,
      dismissed: false,
      retired: false,
    });
    expect(state.bowlers["bowler-1"].runsConceded).toBe(0);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(1);
    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBe("venky");
  });
  it("credits the bowler for a bowled dismissal", () => {
    const events: CricketEvent[] = [
      {
        id: "bowled-wicket",
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
    const state = deriveInningsState(events);
    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(1);
    expect(state.legalBalls).toBe(1);
    expect(state.batters.himanshu.dismissed).toBe(true);
    expect(state.batters.himanshu.balls).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(1);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(1);
    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("venky");
  });
it.each([
  "LBW",
  "HIT_WICKET",
  "CAUGHT_AND_BOWLED",
] as const)(
  "credits the bowler for a %s dismissal",
  (wicketType) => {
    const events: CricketEvent[] = [
      {
        id: `wicket-${wicketType.toLowerCase()}`,
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        wicket: {
          type: wicketType,
          dismissedBatterId: "himanshu",
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(1);
    expect(state.legalBalls).toBe(1);
    expect(state.legalBallsInCurrentOver).toBe(1);
    expect(state.batters.himanshu.dismissed).toBe(true);
    expect(state.batters.himanshu.balls).toBe(1);
    expect(state.bowlers["bowler-1"]).toEqual({
      participantId: "bowler-1",
      legalBalls: 1,
      runsConceded: 0,
      wickets: 1,
    });
    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("venky");
  },
);
  it("records a run-out as a team wicket without crediting the bowler", () => {
    const events: CricketEvent[] = [
      {
        id: "run-out-wicket",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        running: {
          completedRuns: 0,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
            fielderIds: ["fielder-1"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(1);
    expect(state.legalBalls).toBe(1);
    expect(state.batters.himanshu.dismissed).toBe(true);
    expect(state.batters.himanshu.balls).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(1);
    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("venky");
  });
  it("keeps the non-striker in place when the striker is run out with no completed run", () => {
    const events: CricketEvent[] = [
      {
        id: "striker-run-out-zero-runs",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        running: {
          completedRuns: 0,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
            fielderIds: ["fielder-1"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(1);
    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("venky");
    expect(state.batters.himanshu.dismissed).toBe(true);
    expect(state.batters.venky.dismissed).toBe(false);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
  });
  it("keeps the striker in place when the non-striker is run out with no completed run", () => {
    const events: CricketEvent[] = [
      {
        id: "non-striker-run-out-zero-runs",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        running: {
          completedRuns: 0,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "venky",
            fielderIds: ["fielder-1"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(1);
    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBeNull();
    expect(state.batters.himanshu.dismissed).toBe(false);
    expect(state.batters.venky.dismissed).toBe(true);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
  });
  it("places the surviving non-striker at the striker end after one completed run and a striker run-out", () => {
    const events: CricketEvent[] = [
      {
        id: "striker-run-out-one-run",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
        running: {
          completedRuns: 1,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
            fielderIds: ["fielder-1"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);
    expect(state.batters.himanshu.runs).toBe(1);
    expect(state.batters.himanshu.dismissed).toBe(true);
    expect(state.strikerId).toBe("venky");
    expect(state.nonStrikerId).toBeNull();
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
  });
  it("places the surviving striker at the non-striker end after one completed run and a non-striker run-out", () => {
    const events: CricketEvent[] = [
      {
        id: "non-striker-run-out-one-run",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
        running: {
          completedRuns: 1,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "venky",
            fielderIds: ["fielder-1"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);
    expect(state.batters.himanshu.runs).toBe(1);
    expect(state.batters.venky.dismissed).toBe(true);
    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("himanshu");
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
  });
  it("scores a wide plus run-out without consuming a legal ball or crediting the bowler with a wicket", () => {
    const events: CricketEvent[] = [
      {
        id: "wide-run-out",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 1,
        },
        running: {
          completedRuns: 0,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
            fielderIds: ["fielder-1"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);
    expect(state.extras.wides).toBe(1);
    expect(state.extras.total).toBe(1);
    expect(state.legalBalls).toBe(0);
    expect(state.legalBallsInCurrentOver).toBe(0);
    expect(state.batters.himanshu.balls).toBe(0);
    expect(state.batters.himanshu.dismissed).toBe(true);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(0);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("venky");
  });
  it("scores a no-ball plus run-out without consuming a legal ball or crediting the bowler with a wicket", () => {
    const events: CricketEvent[] = [
      {
        id: "no-ball-run-out",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          noBalls: 1,
        },
        running: {
          completedRuns: 0,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
            fielderIds: ["fielder-1"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);
    expect(state.extras.noBalls).toBe(1);
    expect(state.extras.total).toBe(1);
    expect(state.legalBalls).toBe(0);
    expect(state.legalBallsInCurrentOver).toBe(0);
    expect(state.batters.himanshu.balls).toBe(0);
    expect(state.batters.himanshu.dismissed).toBe(true);
    expect(state.bowlers["bowler-1"].legalBalls).toBe(0);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("venky");
  });
  it("scores a leg-bye plus striker run-out with correct scoring, bowling and end state", () => {
    const events: CricketEvent[] = [
      {
        id: "leg-bye-striker-run-out",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          legByes: 1,
        },
        running: {
          completedRuns: 1,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
          fielderIds: ["fielder-1"],
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);

    expect(state.extras.legByes).toBe(1);
    expect(state.extras.total).toBe(1);

    expect(state.legalBalls).toBe(1);
    expect(state.legalBallsInCurrentOver).toBe(1);

    expect(state.batters.himanshu.runs).toBe(0);
    expect(state.batters.himanshu.balls).toBe(1);
    expect(state.batters.himanshu.dismissed).toBe(true);

    expect(state.bowlers["bowler-1"].legalBalls).toBe(1);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(0);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);

    expect(state.fielders["fielder-1"].runOuts).toBe(1);

    expect(state.strikerId).toBe("venky");
    expect(state.nonStrikerId).toBeNull();
  });

  it("scores a leg-bye plus non-striker run-out with correct scoring, bowling and end state", () => {
    const events: CricketEvent[] = [
      {
        id: "leg-bye-non-striker-run-out",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          legByes: 1,
        },
        running: {
          completedRuns: 1,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "venky",
          fielderIds: ["fielder-1"],
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);

    expect(state.extras.legByes).toBe(1);
    expect(state.extras.total).toBe(1);

    expect(state.legalBalls).toBe(1);
    expect(state.legalBallsInCurrentOver).toBe(1);

    expect(state.batters.himanshu.runs).toBe(0);
    expect(state.batters.himanshu.balls).toBe(1);
    expect(state.batters.venky.dismissed).toBe(true);

    expect(state.bowlers["bowler-1"].legalBalls).toBe(1);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(0);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);

    expect(state.fielders["fielder-1"].runOuts).toBe(1);

    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("himanshu");
  });
it("preserves strike when two runs are completed but one is called short", () => {
  const events: CricketEvent[] = [
    {
      id: "short-run",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 1,
      running: {
        completedRuns: 2,
        shortRuns: 1,
      },
    },
  ];
  const state = deriveInningsState(events);
  expect(state.runs).toBe(1);
  expect(state.wickets).toBe(0);
  expect(state.legalBalls).toBe(1);
  expect(state.legalBallsInCurrentOver).toBe(1);
  expect(state.batters.himanshu).toEqual({
    participantId: "himanshu",
    runs: 1,
    balls: 1,
    fours: 0,
    sixes: 0,
    dismissed: false,
    retired: false,
  });
  expect(state.batters.venky).toEqual({
    participantId: "venky",
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dismissed: false,
    retired: false,
  });
  expect(state.bowlers["bowler-1"]).toEqual({
    participantId: "bowler-1",
    legalBalls: 1,
    runsConceded: 1,
    wickets: 0,
  });
  expect(state.strikerId).toBe("himanshu");
  expect(state.nonStrikerId).toBe("venky");
});
  it("credits a catch to the named fielder for a caught dismissal", () => {
    const events: CricketEvent[] = [
      {
        id: "caught",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        wicket: {
          type: "CAUGHT",
          dismissedBatterId: "himanshu",
          fielderId: "fielder-1",
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.wickets).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(1);
    expect(state.fielders["fielder-1"]).toEqual({
      participantId: "fielder-1",
      catches: 1,
      stumpings: 0,
      runOuts: 0,
    });
  });
  it("credits caught and bowled as one bowler wicket and exactly one catch to the bowler", () => {
    const events: CricketEvent[] = [
      {
        id: "caught-and-bowled",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        wicket: {
          type: "CAUGHT_AND_BOWLED",
          dismissedBatterId: "himanshu",
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.wickets).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(1);
    expect(state.fielders["bowler-1"]).toEqual({
      participantId: "bowler-1",
      catches: 1,
      stumpings: 0,
      runOuts: 0,
    });
  });
  it("credits a stumping to the named wicketkeeper", () => {
    const events: CricketEvent[] = [
      {
        id: "stumped",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        wicket: {
          type: "STUMPED",
          dismissedBatterId: "himanshu",
          fielderId: "keeper-1",
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.wickets).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(1);
    expect(state.fielders["keeper-1"]).toEqual({
      participantId: "keeper-1",
      catches: 0,
      stumpings: 1,
      runOuts: 0,
    });
  });
  it("credits a single-fielder run-out without giving the bowler a wicket", () => {
    const events: CricketEvent[] = [
      {
        id: "single-fielder-run-out",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        running: { completedRuns: 0 },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
          fielderIds: ["fielder-1"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.wickets).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
    expect(state.fielders["fielder-1"]).toEqual({
      participantId: "fielder-1",
      catches: 0,
      stumpings: 0,
      runOuts: 1,
    });
  });
  it("credits every involved fielder once for a multi-fielder run-out", () => {
    const events: CricketEvent[] = [
      {
        id: "multi-fielder-run-out",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        running: { completedRuns: 0 },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
          fielderIds: ["fielder-1", "fielder-2"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.wickets).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
    expect(state.fielders["fielder-1"].runOuts).toBe(1);
    expect(state.fielders["fielder-2"].runOuts).toBe(1);
  });
  it("does not double-credit a duplicated fielder on a run-out", () => {
    const events: CricketEvent[] = [
      {
        id: "duplicate-fielder-run-out",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        running: { completedRuns: 0 },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
          fielderIds: ["fielder-1", "fielder-1"],
        },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.wickets).toBe(1);
    expect(state.fielders["fielder-1"].runOuts).toBe(1);
  });
  it("does not create fielding credit for bowled, LBW or hit wicket dismissals", () => {
    const events: CricketEvent[] = [
      {
        id: "bowled-no-fielding-credit",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        wicket: { type: "BOWLED", dismissedBatterId: "himanshu" },
      },
      {
        id: "lbw-no-fielding-credit",
        type: "DELIVERY",
        strikerId: "new-batter-1",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        wicket: { type: "LBW", dismissedBatterId: "new-batter-1" },
      },
      {
        id: "hit-wicket-no-fielding-credit",
        type: "DELIVERY",
        strikerId: "new-batter-2",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        wicket: { type: "HIT_WICKET", dismissedBatterId: "new-batter-2" },
      },
    ];
    const state = deriveInningsState(events);
    expect(state.wickets).toBe(3);
    expect(state.bowlers["bowler-1"].wickets).toBe(3);
    expect(state.fielders).toEqual({});
  });
    it("retires the striker without recording a dismissal or changing the score", () => {
    const events: CricketEvent[] = [
      {
        id: "delivery-before-retirement",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
      },
      {
        id: "himanshu-retired",
        type: "BATTER_RETIRED",
        batterId: "himanshu",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(0);
    expect(state.legalBalls).toBe(1);

    expect(state.batters.himanshu.dismissed).toBe(false);
    expect(state.batters.himanshu.retired).toBe(true);
    expect(state.batters.himanshu.balls).toBe(1);

    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("venky");

    expect(state.bowlers["bowler-1"].legalBalls).toBe(1);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
  });

  it("retires the non-striker without disturbing the striker", () => {
    const events: CricketEvent[] = [
      {
        id: "delivery-before-non-striker-retirement",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
      },
      {
        id: "venky-retired",
        type: "BATTER_RETIRED",
        batterId: "venky",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.wickets).toBe(0);
    expect(state.batters.venky.dismissed).toBe(false);
    expect(state.batters.venky.retired).toBe(true);

    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBeNull();
  });

  it("preserves a batter's existing figures while retired", () => {
    const events: CricketEvent[] = [
      {
        id: "four-before-retirement",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
      {
        id: "himanshu-retired-after-four",
        type: "BATTER_RETIRED",
        batterId: "himanshu",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.batters.himanshu).toEqual({
      participantId: "himanshu",
      runs: 4,
      balls: 1,
      fours: 1,
      sixes: 0,
      dismissed: false,
      retired: true,
    });

    expect(state.runs).toBe(4);
    expect(state.wickets).toBe(0);
  });

  it("returns a retired batter to the explicitly selected batting end", () => {
    const events: CricketEvent[] = [
      {
        id: "delivery-before-return",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
      },
      {
        id: "himanshu-retired-before-return",
        type: "BATTER_RETIRED",
        batterId: "himanshu",
      },
      {
        id: "himanshu-returned",
        type: "BATTER_RETURNED",
        batterId: "himanshu",
        end: "STRIKER",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.batters.himanshu.retired).toBe(false);
    expect(state.batters.himanshu.dismissed).toBe(false);

    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBe("venky");

    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(0);
    expect(state.legalBalls).toBe(1);
  });

  it("ignores a return when the requested batting end is occupied by another batter", () => {
    const events: CricketEvent[] = [
      {
        id: "delivery-before-occupied-return",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
      },
      {
        id: "reserve-batter-retired",
        type: "BATTER_RETIRED",
        batterId: "reserve-batter",
      },
      {
        id: "reserve-batter-invalid-return",
        type: "BATTER_RETURNED",
        batterId: "reserve-batter",
        end: "STRIKER",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.strikerId).toBe("himanshu");
    expect(state.nonStrikerId).toBe("venky");
    expect(state.batters["reserve-batter"].retired).toBe(true);
  });

  it("does not allow a dismissed batter to return", () => {
    const events: CricketEvent[] = [
      {
        id: "himanshu-dismissed",
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
      {
        id: "invalid-dismissed-return",
        type: "BATTER_RETURNED",
        batterId: "himanshu",
        end: "STRIKER",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.wickets).toBe(1);
    expect(state.batters.himanshu.dismissed).toBe(true);
    expect(state.batters.himanshu.retired).toBe(false);

    expect(state.strikerId).toBeNull();
    expect(state.nonStrikerId).toBe("venky");
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
  it("derives chase context from a target and innings ball limit", () => {
    const events: CricketEvent[] = [
      {
        id: "chase-1",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
      {
        id: "chase-2",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
      },
    ];

    const state = deriveInningsState(events, {
      target: 11,
      scheduledLegalBalls: 12,
    });

    expect(state.chase).toEqual({
      target: 11,
      runsRequired: 6,
      ballsRemaining: 10,
      targetReached: false,
      scoresLevel: false,
    });
  });

  it("marks the target as reached as soon as the chasing side gets there", () => {
    const events: CricketEvent[] = [
      {
        id: "winning-six",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 6,
      },
    ];

    const state = deriveInningsState(events, {
      target: 6,
      scheduledLegalBalls: 12,
    });

    expect(state.chase).toEqual({
      target: 6,
      runsRequired: 0,
      ballsRemaining: 11,
      targetReached: true,
      scoresLevel: false,
    });
  });

  it("recognises level scores without treating them as a successful chase", () => {
    const events: CricketEvent[] = [
      {
        id: "level-scores",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 5,
      },
    ];

    const state = deriveInningsState(events, {
      target: 6,
      scheduledLegalBalls: 6,
    });

    expect(state.chase).toEqual({
      target: 6,
      runsRequired: 1,
      ballsRemaining: 5,
      targetReached: false,
      scoresLevel: true,
    });
  });

  it("does not consume a ball from the chase for a wide", () => {
    const events: CricketEvent[] = [
      {
        id: "chase-wide",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 1,
        },
        running: {
          completedRuns: 0,
        },
      },
    ];

    const state = deriveInningsState(events, {
      target: 10,
      scheduledLegalBalls: 6,
    });

    expect(state.runs).toBe(1);
    expect(state.chase?.runsRequired).toBe(9);
    expect(state.chase?.ballsRemaining).toBe(6);
  });

  it("does not consume a ball from the chase for a no-ball", () => {
    const events: CricketEvent[] = [
      {
        id: "chase-no-ball",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          noBalls: 1,
        },
        running: {
          completedRuns: 0,
        },
      },
    ];

    const state = deriveInningsState(events, {
      target: 10,
      scheduledLegalBalls: 6,
    });

    expect(state.runs).toBe(1);
    expect(state.chase?.runsRequired).toBe(9);
    expect(state.chase?.ballsRemaining).toBe(6);
  });
    it("adds batting-side penalty runs without consuming a delivery", () => {
    const events: CricketEvent[] = [
      {
        id: "opening-single",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
      },
      {
        id: "batting-penalty",
        type: "PENALTY_RUNS",
        runs: 5,
        awardedTo: "BATTING",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(6);
    expect(state.extras.penalty).toBe(5);
    expect(state.extras.total).toBe(5);

    expect(state.legalBalls).toBe(1);
    expect(state.legalBallsInCurrentOver).toBe(1);

    expect(state.batters.himanshu.runs).toBe(1);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(1);

    expect(state.strikerId).toBe("venky");
    expect(state.nonStrikerId).toBe("himanshu");

    expect(state.oppositionPenaltyRuns).toBe(0);
  });

  it("records opposition penalty runs without changing the batting innings score", () => {
    const events: CricketEvent[] = [
      {
        id: "opening-four",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
      {
        id: "opposition-penalty",
        type: "PENALTY_RUNS",
        runs: 5,
        awardedTo: "OPPOSITION",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(4);
    expect(state.extras.penalty).toBe(0);
    expect(state.extras.total).toBe(0);
    expect(state.oppositionPenaltyRuns).toBe(5);

    expect(state.legalBalls).toBe(1);
    expect(state.batters.himanshu.runs).toBe(4);
    expect(state.bowlers["bowler-1"].runsConceded).toBe(4);
  });

  it("allows batting-side penalty runs to complete a chase", () => {
    const events: CricketEvent[] = [
      {
        id: "chase-four",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
      {
        id: "winning-penalty",
        type: "PENALTY_RUNS",
        runs: 5,
        awardedTo: "BATTING",
      },
    ];

    const state = deriveInningsState(events, {
      target: 9,
      scheduledLegalBalls: 12,
    });

    expect(state.runs).toBe(9);
    expect(state.chase).toEqual({
      target: 9,
      runsRequired: 0,
      ballsRemaining: 11,
      targetReached: true,
      scoresLevel: false,
    });
        expect(state.completion).toEqual({
      completed: true,
      reason: "TARGET_REACHED",
    });
  });
    it("marks a chase as complete when the target is reached", () => {
    const events: CricketEvent[] = [
      {
        id: "winning-boundary",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
    ];

    const state = deriveInningsState(events, {
      target: 4,
      scheduledLegalBalls: 12,
    });

    expect(state.completion).toEqual({
      completed: true,
      reason: "TARGET_REACHED",
    });
  });

  it("marks an innings as complete when its scheduled legal balls are exhausted", () => {
    const events: CricketEvent[] = Array.from(
      { length: 6 },
      (_, index): CricketEvent => ({
        id: `ball-${index + 1}`,
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
      }),
    );

    const state = deriveInningsState(events, {
      scheduledLegalBalls: 6,
    });

    expect(state.legalBalls).toBe(6);
    expect(state.completion).toEqual({
      completed: true,
      reason: "BALL_LIMIT_REACHED",
    });
  });

  it("allows the scorer to end an innings manually", () => {
    const events: CricketEvent[] = [
      {
        id: "opening-four",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
      {
        id: "manual-end",
        type: "INNINGS_ENDED",
        reason: "MANUAL",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(4);
    expect(state.completion).toEqual({
      completed: true,
      reason: "MANUAL",
    });
  });

  it("ignores later scoring events after an explicit innings end", () => {
    const events: CricketEvent[] = [
      {
        id: "opening-four",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
      {
        id: "innings-end",
        type: "INNINGS_ENDED",
        reason: "MANUAL",
      },
      {
        id: "should-not-count",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 6,
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(4);
    expect(state.legalBalls).toBe(1);
    expect(state.batters.himanshu.runs).toBe(4);
    expect(state.completion).toEqual({
      completed: true,
      reason: "MANUAL",
    });
  });
    it("starts a break without changing the innings score", () => {
    const events: CricketEvent[] = [
      {
        id: "opening-four",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
      {
        id: "rain-break",
        type: "BREAK_STARTED",
        reason: "RAIN",
        note: "Heavy shower",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(4);
    expect(state.legalBalls).toBe(1);
    expect(state.break).toEqual({
      active: true,
      reason: "RAIN",
      note: "Heavy shower",
    });
  });

  it("ignores scoring events while a break is active", () => {
    const events: CricketEvent[] = [
      {
        id: "opening-single",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
      },
      {
        id: "rain-break",
        type: "BREAK_STARTED",
        reason: "RAIN",
      },
      {
        id: "should-not-count",
        type: "DELIVERY",
        strikerId: "venky",
        nonStrikerId: "himanshu",
        bowlerId: "bowler-1",
        batRuns: 6,
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(1);
    expect(state.legalBalls).toBe(1);
    expect(state.batters.venky.runs).toBe(0);
    expect(state.break.active).toBe(true);
  });

  it("resumes scoring after the break ends", () => {
    const events: CricketEvent[] = [
      {
        id: "opening-single",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
      },
      {
        id: "rain-break",
        type: "BREAK_STARTED",
        reason: "RAIN",
      },
      {
        id: "resume",
        type: "BREAK_ENDED",
      },
      {
        id: "after-resume",
        type: "DELIVERY",
        strikerId: "venky",
        nonStrikerId: "himanshu",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(5);
    expect(state.legalBalls).toBe(2);
    expect(state.batters.venky.runs).toBe(4);
    expect(state.break).toEqual({
      active: false,
      reason: null,
      note: null,
    });
  });

  it("ignores a second break start while play is already suspended", () => {
    const events: CricketEvent[] = [
      {
        id: "first-break",
        type: "BREAK_STARTED",
        reason: "RAIN",
        note: "Initial shower",
      },
      {
        id: "duplicate-break",
        type: "BREAK_STARTED",
        reason: "BAD_LIGHT",
        note: "Should not replace active break",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.break).toEqual({
      active: true,
      reason: "RAIN",
      note: "Initial shower",
    });
  });
    it("derives the original playing conditions when no revision has occurred", () => {
    const state = deriveInningsState([], {
      target: 121,
      scheduledLegalBalls: 120,
    });

    expect(state.playingConditions).toEqual({
      target: 121,
      scheduledLegalBalls: 120,
    });
  });

  it("reduces the remaining ball limit after a playing-conditions change", () => {
    const events: CricketEvent[] = [
      {
        id: "ball-1",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
      },
      {
        id: "rain-break",
        type: "BREAK_STARTED",
        reason: "RAIN",
      },
      {
        id: "resume",
        type: "BREAK_ENDED",
      },
      {
        id: "reduced-overs",
        type: "PLAYING_CONDITIONS_CHANGED",
        scheduledLegalBalls: 60,
      },
    ];

    const state = deriveInningsState(events, {
      scheduledLegalBalls: 120,
    });

    expect(state.playingConditions).toEqual({
      target: null,
      scheduledLegalBalls: 60,
    });

    expect(state.legalBalls).toBe(1);
  });

  it("uses a revised target for the chase", () => {
    const events: CricketEvent[] = [
      {
        id: "opening-six",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 6,
      },
      {
        id: "revised-target",
        type: "TARGET_REVISED",
        target: 10,
      },
    ];

    const state = deriveInningsState(events, {
      target: 20,
      scheduledLegalBalls: 12,
    });

    expect(state.playingConditions.target).toBe(10);

    expect(state.chase).toEqual({
      target: 10,
      runsRequired: 4,
      ballsRemaining: 11,
      targetReached: false,
      scoresLevel: false,
    });
  });

  it("completes the chase immediately when a revised target is already reached", () => {
    const events: CricketEvent[] = [
      {
        id: "opening-six",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 6,
      },
      {
        id: "target-revised-down",
        type: "TARGET_REVISED",
        target: 6,
      },
    ];

    const state = deriveInningsState(events, {
      target: 20,
      scheduledLegalBalls: 12,
    });

    expect(state.chase?.target).toBe(6);
    expect(state.chase?.runsRequired).toBe(0);
    expect(state.chase?.targetReached).toBe(true);

    expect(state.completion).toEqual({
      completed: true,
      reason: "TARGET_REACHED",
    });
  });

  it("completes the innings when a reduced ball limit has already been reached", () => {
    const events: CricketEvent[] = [
      {
        id: "ball-1",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
      },
      {
        id: "ball-2",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
      },
      {
        id: "reduced-limit",
        type: "PLAYING_CONDITIONS_CHANGED",
        scheduledLegalBalls: 2,
      },
    ];

    const state = deriveInningsState(events, {
      scheduledLegalBalls: 12,
    });

    expect(state.playingConditions.scheduledLegalBalls).toBe(2);

    expect(state.completion).toEqual({
      completed: true,
      reason: "BALL_LIMIT_REACHED",
    });
  });
    it("tracks the current wicketkeeper without changing the score", () => {
    const events: CricketEvent[] = [
      {
        id: "keeper-change",
        type: "WICKETKEEPER_CHANGED",
        wicketkeeperId: "keeper-1",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.currentWicketkeeperId).toBe("keeper-1");
    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(0);
    expect(state.legalBalls).toBe(0);
  });

  it("allows the wicketkeeper to change during an innings", () => {
    const events: CricketEvent[] = [
      {
        id: "first-keeper",
        type: "WICKETKEEPER_CHANGED",
        wicketkeeperId: "keeper-1",
      },
      {
        id: "second-keeper",
        type: "WICKETKEEPER_CHANGED",
        wicketkeeperId: "keeper-2",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.currentWicketkeeperId).toBe("keeper-2");
  });

  it("preserves explicit stumping attribution after a wicketkeeper change", () => {
    const events: CricketEvent[] = [
      {
        id: "first-keeper",
        type: "WICKETKEEPER_CHANGED",
        wicketkeeperId: "keeper-1",
      },
      {
        id: "second-keeper",
        type: "WICKETKEEPER_CHANGED",
        wicketkeeperId: "keeper-2",
      },
      {
        id: "stumping",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        wicket: {
          type: "STUMPED",
          dismissedBatterId: "himanshu",
          fielderId: "keeper-2",
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.currentWicketkeeperId).toBe("keeper-2");
    expect(state.fielders["keeper-2"].stumpings).toBe(1);
    expect(state.fielders["keeper-1"]).toBeUndefined();
  });
    it("tracks the current scorer without changing the innings", () => {
    const events: CricketEvent[] = [
      {
        id: "handover-1",
        type: "SCORER_HANDOVER",
        scorerId: "scorer-a",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.currentScorerId).toBe("scorer-a");
    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(0);
    expect(state.legalBalls).toBe(0);
  });

  it("uses the latest scorer handover as the current scorer", () => {
    const events: CricketEvent[] = [
      {
        id: "handover-1",
        type: "SCORER_HANDOVER",
        scorerId: "scorer-a",
      },
      {
        id: "handover-2",
        type: "SCORER_HANDOVER",
        scorerId: "scorer-b",
      },
    ];

    const state = deriveInningsState(events);

    expect(state.currentScorerId).toBe("scorer-b");
  });

  it("preserves the cricket state across a scorer handover", () => {
    const events: CricketEvent[] = [
      {
        id: "ball-before-handover",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
      },
      {
        id: "handover",
        type: "SCORER_HANDOVER",
        scorerId: "scorer-b",
      },
      {
        id: "ball-after-handover",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
      },
    ];

    const state = deriveInningsState(events);

    expect(state.currentScorerId).toBe("scorer-b");
    expect(state.runs).toBe(5);
    expect(state.legalBalls).toBe(2);
    expect(state.batters.himanshu.runs).toBe(5);
    expect(state.batters.himanshu.balls).toBe(2);
  });
    it("ignores a delivery that is both a wide and a no-ball", () => {
    const events: CricketEvent[] = [
      {
        id: "invalid-wide-no-ball",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 1,
          noBalls: 1,
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.legalBalls).toBe(0);
    expect(state.batters).toEqual({});
    expect(state.bowlers).toEqual({});
  });

  it("ignores bat runs recorded on a wide", () => {
    const events: CricketEvent[] = [
      {
        id: "invalid-wide-bat-runs",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
        extras: {
          wides: 1,
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.legalBalls).toBe(0);
    expect(state.batters).toEqual({});
  });

  it("ignores a delivery containing both byes and leg-byes", () => {
    const events: CricketEvent[] = [
      {
        id: "invalid-byes-leg-byes",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          byes: 1,
          legByes: 1,
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.legalBalls).toBe(0);
  });

  it("ignores a bowled dismissal from a wide", () => {
    const events: CricketEvent[] = [
      {
        id: "invalid-wide-bowled",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 1,
        },
        wicket: {
          type: "BOWLED",
          dismissedBatterId: "himanshu",
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(0);
    expect(state.batters).toEqual({});
    expect(state.bowlers).toEqual({});
  });

  it("ignores a caught dismissal from a no-ball", () => {
    const events: CricketEvent[] = [
      {
        id: "invalid-no-ball-caught",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          noBalls: 1,
        },
        wicket: {
          type: "CAUGHT",
          dismissedBatterId: "himanshu",
          fielderId: "fielder-1",
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(0);
    expect(state.fielders).toEqual({});
  });

  it("allows a run-out from a no-ball", () => {
    const events: CricketEvent[] = [
      {
        id: "valid-no-ball-run-out",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          noBalls: 1,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "himanshu",
          fielderIds: ["fielder-1"],
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);
    expect(state.legalBalls).toBe(0);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
  });

  it("allows hit wicket from a no-ball", () => {
    const events: CricketEvent[] = [
      {
        id: "valid-no-ball-hit-wicket",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          noBalls: 1,
        },
        wicket: {
          type: "HIT_WICKET",
          dismissedBatterId: "himanshu",
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);
    expect(state.legalBalls).toBe(0);
    expect(state.bowlers["bowler-1"].wickets).toBe(1);
  });
    it("ignores a wide combined with byes", () => {
    const events: CricketEvent[] = [
      {
        id: "invalid-wide-byes",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 1,
          byes: 1,
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.legalBalls).toBe(0);
  });

  it("allows a stumping from a wide", () => {
    const events: CricketEvent[] = [
      {
        id: "valid-wide-stumped",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 1,
        },
        wicket: {
          type: "STUMPED",
          dismissedBatterId: "himanshu",
          fielderId: "keeper-1",
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);
    expect(state.legalBalls).toBe(0);
    expect(state.bowlers["bowler-1"].wickets).toBe(1);
    expect(state.fielders["keeper-1"].stumpings).toBe(1);
  });

  it("allows a run-out from a wide", () => {
    const events: CricketEvent[] = [
      {
        id: "valid-wide-run-out",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: 1,
        },
        wicket: {
          type: "RUN_OUT",
          dismissedBatterId: "venky",
          fielderIds: ["fielder-1"],
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(1);
    expect(state.legalBalls).toBe(0);
    expect(state.bowlers["bowler-1"].wickets).toBe(0);
  });

  it("ignores a dismissal of a batter who was not involved in the delivery", () => {
    const events: CricketEvent[] = [
      {
        id: "invalid-dismissed-batter",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        wicket: {
          type: "BOWLED",
          dismissedBatterId: "someone-else",
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(0);
    expect(state.legalBalls).toBe(0);
    expect(state.batters).toEqual({});
  });

  it("ignores negative batting runs", () => {
    const events: CricketEvent[] = [
      {
        id: "invalid-negative-runs",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: -1 as unknown as 0,
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.legalBalls).toBe(0);
    expect(state.batters).toEqual({});
  });

  it("ignores negative extra runs", () => {
    const events: CricketEvent[] = [
      {
        id: "invalid-negative-extras",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 0,
        extras: {
          wides: -1,
        },
      },
    ];

    const state = deriveInningsState(events);

    expect(state.runs).toBe(0);
    expect(state.legalBalls).toBe(0);
    expect(state.batters).toEqual({});
  });
  it("voids an earlier delivery without deleting it from the event ledger", () => {
  const events: CricketEvent[] = [
    {
      id: "ball-1",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 1,
    },
    {
      id: "ball-2",
      type: "DELIVERY",
      strikerId: "venky",
      nonStrikerId: "himanshu",
      bowlerId: "bowler-1",
      batRuns: 4,
    },
    {
      id: "undo-ball-2",
      type: "EVENT_VOIDED",
      targetEventId: "ball-2",
    },
  ];

  const state = deriveInningsState(events);

  expect(events).toHaveLength(3);
  expect(state.runs).toBe(1);
  expect(state.legalBalls).toBe(1);
  expect(state.batters.himanshu.runs).toBe(1);
  expect(state.batters.venky).toEqual(
  expect.objectContaining({
    participantId: "venky",
    runs: 0,
    balls: 0,
    dismissed: false,
  }),
);
});
it("replaces an earlier delivery and replays the innings from corrected history", () => {
  const events: CricketEvent[] = [
    {
      id: "ball-1",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 4,
    },
    {
      id: "ball-2",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 1,
    },
    {
      id: "correct-ball-1",
      type: "EVENT_REPLACED",
      targetEventId: "ball-1",
      replacement: {
        id: "ball-1-corrected",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 2,
      },
    },
  ];

  const state = deriveInningsState(events);

  expect(state.runs).toBe(3);
  expect(state.legalBalls).toBe(2);
  expect(state.batters.himanshu.runs).toBe(3);
});
it("preserves explicitly recorded later batting participants after a historical correction", () => {
  const events: CricketEvent[] = [
    {
      id: "ball-1",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 1,
    },
    {
      id: "ball-2",
      type: "DELIVERY",
      strikerId: "venky",
      nonStrikerId: "himanshu",
      bowlerId: "bowler-1",
      batRuns: 4,
    },
    {
      id: "correct-ball-1",
      type: "EVENT_REPLACED",
      targetEventId: "ball-1",
      replacement: {
        id: "ball-1-corrected",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 2,
      },
    },
  ];

  const state = deriveInningsState(events);

  expect(state.runs).toBe(6);
  expect(state.legalBalls).toBe(2);
  expect(state.strikerId).toBe("venky");
expect(state.nonStrikerId).toBe("himanshu");
});
it("ignores a void event whose target does not exist", () => {
  const events: CricketEvent[] = [
    {
      id: "ball-1",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 4,
    },
    {
      id: "bad-undo",
      type: "EVENT_VOIDED",
      targetEventId: "missing-event",
    },
  ];

  const state = deriveInningsState(events);

  expect(state.runs).toBe(4);
  expect(state.legalBalls).toBe(1);
});
it("ignores an invalid replacement delivery", () => {
  const events: CricketEvent[] = [
    {
      id: "ball-1",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 4,
    },
    {
      id: "bad-correction",
      type: "EVENT_REPLACED",
      targetEventId: "ball-1",
      replacement: {
        id: "ball-1-invalid",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
        extras: {
          wides: 1,
        },
      },
    },
  ];

  const state = deriveInningsState(events);

  expect(state.runs).toBe(4);
  expect(state.legalBalls).toBe(1);
});
it("uses the latest valid replacement when the same event is corrected twice", () => {
  const events: CricketEvent[] = [
    {
      id: "ball-1",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 4,
    },
    {
      id: "first-correction",
      type: "EVENT_REPLACED",
      targetEventId: "ball-1",
      replacement: {
        id: "ball-1-corrected-once",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 2,
      },
    },
    {
      id: "second-correction",
      type: "EVENT_REPLACED",
      targetEventId: "ball-1",
      replacement: {
        id: "ball-1-corrected-twice",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 1,
      },
    },
  ];

  const state = deriveInningsState(events);

  expect(state.runs).toBe(1);
  expect(state.legalBalls).toBe(1);
  expect(state.batters.himanshu.runs).toBe(1);
});

it("removes an event when it is voided after being replaced", () => {
  const events: CricketEvent[] = [
    {
      id: "ball-1",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 4,
    },
    {
      id: "correct-ball-1",
      type: "EVENT_REPLACED",
      targetEventId: "ball-1",
      replacement: {
        id: "ball-1-corrected",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 2,
      },
    },
    {
      id: "undo-ball-1",
      type: "EVENT_VOIDED",
      targetEventId: "ball-1",
    },
  ];

  const state = deriveInningsState(events);

  expect(state.runs).toBe(0);
  expect(state.legalBalls).toBe(0);
  expect(state.batters.himanshu).toBeUndefined();
});

it("restores a voided event when a later valid replacement is supplied", () => {
  const events: CricketEvent[] = [
    {
      id: "ball-1",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 4,
    },
    {
      id: "undo-ball-1",
      type: "EVENT_VOIDED",
      targetEventId: "ball-1",
    },
    {
      id: "restore-ball-1",
      type: "EVENT_REPLACED",
      targetEventId: "ball-1",
      replacement: {
        id: "ball-1-restored",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 2,
      },
    },
  ];

  const state = deriveInningsState(events);

  expect(state.runs).toBe(2);
  expect(state.legalBalls).toBe(1);
  expect(state.batters.himanshu.runs).toBe(2);
});

it("keeps the latest valid replacement when a later replacement is invalid", () => {
  const events: CricketEvent[] = [
    {
      id: "ball-1",
      type: "DELIVERY",
      strikerId: "himanshu",
      nonStrikerId: "venky",
      bowlerId: "bowler-1",
      batRuns: 4,
    },
    {
      id: "valid-correction",
      type: "EVENT_REPLACED",
      targetEventId: "ball-1",
      replacement: {
        id: "ball-1-valid-correction",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 2,
      },
    },
    {
      id: "invalid-correction",
      type: "EVENT_REPLACED",
      targetEventId: "ball-1",
      replacement: {
        id: "ball-1-invalid-correction",
        type: "DELIVERY",
        strikerId: "himanshu",
        nonStrikerId: "venky",
        bowlerId: "bowler-1",
        batRuns: 4,
        extras: {
          wides: 1,
        },
      },
    },
  ];

  const state = deriveInningsState(events);

  expect(state.runs).toBe(2);
  expect(state.legalBalls).toBe(1);
  expect(state.batters.himanshu.runs).toBe(2);
});

  it("rejects the same bowler starting consecutive overs", () => {
    const firstOver: CricketEvent[] = Array.from({ length: 6 }, (_, index) => ({
      id: `first-over-${index + 1}`,
      type: "DELIVERY" as const,
      strikerId: "batter-1",
      nonStrikerId: "batter-2",
      bowlerId: "bowler-1",
      batRuns: 0 as const,
    }));
    const state = deriveInningsState([
      ...firstOver,
      { id: "over-1-ended", type: "OVER_ENDED" },
      { id: "bad-next-over", type: "DELIVERY", strikerId: "batter-2", nonStrikerId: "batter-1", bowlerId: "bowler-1", batRuns: 4 },
    ]);
    expect(state.completedOvers).toBe(1);
    expect(state.legalBalls).toBe(6);
    expect(state.runs).toBe(0);
    expect(state.currentBowlerId).toBeNull();
    expect(state.previousOverBowlerId).toBe("bowler-1");
  });

  it("allows a different bowler to start the next over", () => {
    const firstOver: CricketEvent[] = Array.from({ length: 6 }, (_, index) => ({
      id: `first-over-valid-${index + 1}`,
      type: "DELIVERY" as const,
      strikerId: "batter-1",
      nonStrikerId: "batter-2",
      bowlerId: "bowler-1",
      batRuns: 0 as const,
    }));
    const state = deriveInningsState([
      ...firstOver,
      { id: "over-1-valid-ended", type: "OVER_ENDED" },
      { id: "good-next-over", type: "DELIVERY", strikerId: "batter-2", nonStrikerId: "batter-1", bowlerId: "bowler-2", batRuns: 1 },
    ]);
    expect(state.legalBalls).toBe(7);
    expect(state.runs).toBe(1);
    expect(state.currentBowlerId).toBe("bowler-2");
    expect(state.previousOverBowlerId).toBe("bowler-1");
  });

  it("records unresolved catch and run-out attribution without inventing a fielder", () => {
    const state = deriveInningsState([
      { id: "unknown-catch", type: "DELIVERY", strikerId: "batter-1", nonStrikerId: "batter-2", bowlerId: "bowler-1", batRuns: 0, wicket: { type: "CAUGHT", dismissedBatterId: "batter-1" } },
      { id: "unknown-run-out", type: "DELIVERY", strikerId: "batter-3", nonStrikerId: "batter-2", bowlerId: "bowler-1", batRuns: 0, wicket: { type: "RUN_OUT", dismissedBatterId: "batter-3", fielderIds: [] } },
    ]);
    expect(state.wickets).toBe(2);
    expect(state.bowlers["bowler-1"].wickets).toBe(1);
    expect(Object.keys(state.fielders)).toHaveLength(0);
  });

});