import { describe, expect, it } from "vitest";
import {
  deriveMatchState,
  type MatchInningsInput,
} from "./match-engine";

describe("deriveMatchState", () => {
  it("keeps the match in progress while the first innings is incomplete", () => {
    const innings: MatchInningsInput[] = [
      {
        battingSideId: "dcc",
        bowlingSideId: "opposition",
        runs: 120,
        wickets: 4,
        completed: false,
      },
    ];

    const state = deriveMatchState(innings);

    expect(state.completed).toBe(false);
    expect(state.result).toBeNull();
  });

  it("keeps the match in progress after the first innings is complete but the chase is unfinished", () => {
    const innings: MatchInningsInput[] = [
      {
        battingSideId: "dcc",
        bowlingSideId: "opposition",
        runs: 150,
        wickets: 7,
        completed: true,
      },
      {
        battingSideId: "opposition",
        bowlingSideId: "dcc",
        runs: 100,
        wickets: 3,
        completed: false,
      },
    ];

    const state = deriveMatchState(innings);

    expect(state.completed).toBe(false);
    expect(state.result).toBeNull();
  });

  it("records a successful chase as a win for the chasing side", () => {
    const innings: MatchInningsInput[] = [
      {
        battingSideId: "dcc",
        bowlingSideId: "opposition",
        runs: 150,
        wickets: 8,
        completed: true,
      },
      {
        battingSideId: "opposition",
        bowlingSideId: "dcc",
        runs: 151,
        wickets: 5,
        completed: true,
      },
    ];

    const state = deriveMatchState(innings);

    expect(state.completed).toBe(true);
    expect(state.result).toEqual({
      type: "WIN",
      winnerSideId: "opposition",
      loserSideId: "dcc",
      method: "CHASE",
      runMargin: null,
      wicketMargin: 5,
    });
  });

  it("records a defended total as a run-margin win", () => {
    const innings: MatchInningsInput[] = [
      {
        battingSideId: "dcc",
        bowlingSideId: "opposition",
        runs: 150,
        wickets: 7,
        completed: true,
      },
      {
        battingSideId: "opposition",
        bowlingSideId: "dcc",
        runs: 140,
        wickets: 9,
        completed: true,
      },
    ];

    const state = deriveMatchState(innings);

    expect(state.completed).toBe(true);
    expect(state.result).toEqual({
      type: "WIN",
      winnerSideId: "dcc",
      loserSideId: "opposition",
      method: "RUNS",
      runMargin: 10,
      wicketMargin: null,
    });
  });

  it("records level completed innings as a tie", () => {
    const innings: MatchInningsInput[] = [
      {
        battingSideId: "dcc",
        bowlingSideId: "opposition",
        runs: 150,
        wickets: 8,
        completed: true,
      },
      {
        battingSideId: "opposition",
        bowlingSideId: "dcc",
        runs: 150,
        wickets: 9,
        completed: true,
      },
    ];

    const state = deriveMatchState(innings);

    expect(state.completed).toBe(true);
    expect(state.result).toEqual({
      type: "TIE",
    });
  });
 it("does not complete the match when only the first innings exists even if it is complete", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 150,
      wickets: 8,
      completed: true,
    },
  ];

  const state = deriveMatchState(innings);

  expect(state.completed).toBe(false);
  expect(state.result).toBeNull();
});

it("does not declare a chase win while the second innings is still in progress", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 150,
      wickets: 8,
      completed: true,
    },
    {
      battingSideId: "opposition",
      bowlingSideId: "dcc",
      runs: 151,
      wickets: 4,
      completed: false,
    },
  ];

  const state = deriveMatchState(innings);

  expect(state.completed).toBe(false);
  expect(state.result).toBeNull();
});

it("does not declare a tie while the second innings is still in progress on level scores", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 150,
      wickets: 8,
      completed: true,
    },
    {
      battingSideId: "opposition",
      bowlingSideId: "dcc",
      runs: 150,
      wickets: 5,
      completed: false,
    },
  ];

  const state = deriveMatchState(innings);

  expect(state.completed).toBe(false);
  expect(state.result).toBeNull();
});

it("uses side identities rather than assuming DCC batted first", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "opposition",
      bowlingSideId: "dcc",
      runs: 125,
      wickets: 9,
      completed: true,
    },
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 126,
      wickets: 3,
      completed: true,
    },
  ];

  const state = deriveMatchState(innings);

  expect(state.completed).toBe(true);
  expect(state.result).toEqual({
    type: "WIN",
    winnerSideId: "dcc",
    loserSideId: "opposition",
    method: "CHASE",
    runMargin: null,
    wicketMargin: 7,
  });
});
it("records a match abandoned before any innings begins", () => {
  const state = deriveMatchState([], [
    {
      id: "abandon-1",
      type: "MATCH_ABANDONED",
      reason: "RAIN",
    },
  ]);

  expect(state.completed).toBe(true);
  expect(state.result).toEqual({
    type: "ABANDONED",
    reason: "RAIN",
  });
});

it("records a match abandoned during an unfinished innings", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 87,
      wickets: 3,
      completed: false,
    },
  ];

  const state = deriveMatchState(innings, [
    {
      id: "abandon-1",
      type: "MATCH_ABANDONED",
      reason: "BAD_WEATHER",
    },
  ]);

  expect(state.completed).toBe(true);
  expect(state.result).toEqual({
    type: "ABANDONED",
    reason: "BAD_WEATHER",
  });
});

it("does not replace an already completed cricket result with a later abandonment event", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 150,
      wickets: 7,
      completed: true,
    },
    {
      battingSideId: "opposition",
      bowlingSideId: "dcc",
      runs: 140,
      wickets: 9,
      completed: true,
    },
  ];

  const state = deriveMatchState(innings, [
    {
      id: "bad-late-abandonment",
      type: "MATCH_ABANDONED",
      reason: "RAIN",
    },
  ]);

  expect(state.completed).toBe(true);
  expect(state.result).toEqual({
    type: "WIN",
    winnerSideId: "dcc",
    loserSideId: "opposition",
    method: "RUNS",
    runMargin: 10,
    wicketMargin: null,
  });
});
it("allows abandonment after the first innings has completed but before the match has a result", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 175,
      wickets: 8,
      completed: true,
    },
    {
      battingSideId: "opposition",
      bowlingSideId: "dcc",
      runs: 42,
      wickets: 1,
      completed: false,
    },
  ];

  const state = deriveMatchState(innings, [
    {
      id: "abandon-1",
      type: "MATCH_ABANDONED",
      reason: "RAIN",
    },
  ]);

  expect(state.completed).toBe(true);
  expect(state.result).toEqual({
    type: "ABANDONED",
    reason: "RAIN",
  });
});
it("does not derive a result when the same side is recorded as batting in both innings", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 150,
      wickets: 8,
      completed: true,
    },
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 151,
      wickets: 5,
      completed: true,
    },
  ];

  const state = deriveMatchState(innings);

  expect(state.completed).toBe(false);
  expect(state.result).toBeNull();
});

it("does not derive a result when the second innings sides do not reverse the first innings", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "dcc",
      bowlingSideId: "opposition",
      runs: 150,
      wickets: 8,
      completed: true,
    },
    {
      battingSideId: "third-side",
      bowlingSideId: "dcc",
      runs: 151,
      wickets: 5,
      completed: true,
    },
  ];

  const state = deriveMatchState(innings);

  expect(state.completed).toBe(false);
  expect(state.result).toBeNull();
});
it("derives a neutral wicket-margin result for two internal sides", () => {
  const innings: MatchInningsInput[] = [
    {
      battingSideId: "knights",
      bowlingSideId: "warriors",
      runs: 145,
      wickets: 7,
      completed: true,
    },
    {
      battingSideId: "warriors",
      bowlingSideId: "knights",
      runs: 146,
      wickets: 4,
      completed: true,
    },
  ];

  const state = deriveMatchState(innings);

  expect(state.completed).toBe(true);
  expect(state.result).toEqual({
    type: "WIN",
    winnerSideId: "warriors",
    loserSideId: "knights",
    method: "CHASE",
    runMargin: null,
    wicketMargin: 6,
  });
});
});