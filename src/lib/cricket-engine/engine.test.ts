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
});