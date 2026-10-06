import { describe, expect, it } from "vitest";

import {
  derivePersistedEventRowsState,
  hasEffectiveScoringActionEvents,
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
  it("reports no effective scoring actions when the first delivery has been voided", () => {
  const deliveryEventId =
    "11111111-1111-4111-8111-111111111111";
  const voidEventId =
    "22222222-2222-4222-8222-222222222222";

  const rows: PersistedScoringEventRow[] = [
    {
      event_id: deliveryEventId,
      sequence_key: 1,
      event_type: "DELIVERY",
      payload: {
        id: deliveryEventId,
        type: "DELIVERY",
        strikerId: "batter-one",
        nonStrikerId: "batter-two",
        bowlerId: "bowler-one",
        batRuns: 1,
      },
    },
    {
      event_id: voidEventId,
      sequence_key: 2,
      event_type: "EVENT_VOIDED",
      payload: {
        id: voidEventId,
        type: "EVENT_VOIDED",
        targetEventId: deliveryEventId,
      },
    },
  ];

  expect(
    hasEffectiveScoringActionEvents(rows),
  ).toBe(false);

  const state = derivePersistedEventRowsState(
    rows,
    {
      scheduledBalls: 120,
      targetRuns: null,
    },
  );

  expect(state.runs).toBe(0);
  expect(state.wickets).toBe(0);
  expect(state.legalBalls).toBe(0);
  expect(state.strikerId).toBeNull();
  expect(state.nonStrikerId).toBeNull();
  expect(state.currentBowlerId).toBeNull();
});
it("does not treat a playing-conditions change as a scoring action", () => {
  const eventId =
    "33333333-3333-4333-8333-333333333333";

  const rows: PersistedScoringEventRow[] = [
    {
      event_id: eventId,
      sequence_key: 1,
      event_type: "PLAYING_CONDITIONS_CHANGED",
      payload: {
        id: eventId,
        type: "PLAYING_CONDITIONS_CHANGED",
        scheduledLegalBalls: 150,
      },
    },
  ];

  expect(
    hasEffectiveScoringActionEvents(rows),
  ).toBe(false);

  const state = derivePersistedEventRowsState(
    rows,
    {
      scheduledBalls: 150,
      targetRuns: null,
    },
  );

  expect(state.runs).toBe(0);
  expect(state.wickets).toBe(0);
  expect(state.legalBalls).toBe(0);
  expect(
    state.playingConditions.scheduledLegalBalls,
  ).toBe(150);
});
});