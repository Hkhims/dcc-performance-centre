import { describe, expect, it } from "vitest";

import {
  derivePersistedEventRowsState,
  persistedRowToCricketEvent,
  type PersistedScoringEventRow,
} from "./replay";

describe("App Scorer persisted-event replay", () => {
  it("derives 1/0 and swaps strike from a persisted first-ball single", () => {
    const strikerId = "dcc-batter-one";
    const nonStrikerId = "dcc-batter-two";
    const bowlerId = "opposition-bowler";

    const eventId =
      "44444444-4444-4444-8444-444444444444";

    const rows: PersistedScoringEventRow[] = [
      {
        event_id: eventId,
        sequence_key: 1,
        event_type: "DELIVERY",
        payload: {
          id: eventId,
          type: "DELIVERY",
          strikerId,
          nonStrikerId,
          bowlerId,
          batRuns: 1,
        },
      },
    ];

    const state = derivePersistedEventRowsState(
      rows,
      {
        scheduledBalls: 120,
        targetRuns: null,
      },
    );

    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(0);
    expect(state.legalBalls).toBe(1);

    expect(state.strikerId).toBe(nonStrikerId);
    expect(state.nonStrikerId).toBe(strikerId);
    expect(state.currentBowlerId).toBe(bowlerId);

    expect(state.batters[strikerId]).toMatchObject({
      runs: 1,
      balls: 1,
    });

    expect(state.batters[nonStrikerId]).toMatchObject({
      runs: 0,
      balls: 0,
    });

    expect(state.bowlers[bowlerId]).toMatchObject({
      legalBalls: 1,
      runsConceded: 1,
      wickets: 0,
    });
  });

  it("replays persisted rows in sequence order", () => {
    const firstEventId =
      "11111111-1111-4111-8111-111111111111";
    const secondEventId =
      "22222222-2222-4222-8222-222222222222";

    const rows: PersistedScoringEventRow[] = [
      {
        event_id: secondEventId,
        sequence_key: 2,
        event_type: "DELIVERY",
        payload: {
          id: secondEventId,
          type: "DELIVERY",
          strikerId: "batter-two",
          nonStrikerId: "batter-one",
          bowlerId: "bowler-one",
          batRuns: 0,
        },
      },
      {
        event_id: firstEventId,
        sequence_key: 1,
        event_type: "DELIVERY",
        payload: {
          id: firstEventId,
          type: "DELIVERY",
          strikerId: "batter-one",
          nonStrikerId: "batter-two",
          bowlerId: "bowler-one",
          batRuns: 1,
        },
      },
    ];

    const state = derivePersistedEventRowsState(
      rows,
      {
        scheduledBalls: 120,
        targetRuns: null,
      },
    );

    expect(state.runs).toBe(1);
    expect(state.wickets).toBe(0);
    expect(state.legalBalls).toBe(2);
    expect(state.strikerId).toBe("batter-two");
    expect(state.nonStrikerId).toBe("batter-one");
  });

  it("rejects a persisted row whose payload identity disagrees with the ledger", () => {
    const row: PersistedScoringEventRow = {
      event_id:
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sequence_key: 1,
      event_type: "DELIVERY",
      payload: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        type: "DELIVERY",
        strikerId: "batter-one",
        nonStrikerId: "batter-two",
        bowlerId: "bowler-one",
        batRuns: 1,
      },
    };

    expect(() =>
      persistedRowToCricketEvent(row),
    ).toThrow(/mismatched payload ID/i);
  });
});