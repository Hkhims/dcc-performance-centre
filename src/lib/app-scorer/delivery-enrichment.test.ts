import { describe, expect, it } from "vitest";

import {
  normaliseScorerNote,
  requireNormalisedCoordinate,
  validateDeliveryEnrichment,
  validateDeliveryFieldingEvent,
  type DeliveryEnrichment,
  type DeliveryFieldingEvent,
} from "./delivery-enrichment";

describe("delivery enrichment validation", () => {
  it("accepts a delivery with no Enhanced data", () => {
    const enrichment: DeliveryEnrichment = {};

    expect(() =>
      validateDeliveryEnrichment(enrichment),
    ).not.toThrow();
  });

  it("accepts wagon-wheel coordinates at both inclusive limits", () => {
    expect(
      requireNormalisedCoordinate(0, "X"),
    ).toBe(0);

    expect(
      requireNormalisedCoordinate(1, "X"),
    ).toBe(1);

    expect(() =>
      validateDeliveryEnrichment({
        destination: {
          x: 0,
          y: 1,
        },
      }),
    ).not.toThrow();
  });

  it("accepts normalised wagon-wheel coordinates inside the field", () => {
    expect(() =>
      validateDeliveryEnrichment({
        destination: {
          x: 0.73,
          y: 0.31,
        },
      }),
    ).not.toThrow();
  });

  it("rejects wagon-wheel coordinates below zero", () => {
    expect(() =>
      validateDeliveryEnrichment({
        destination: {
          x: -0.01,
          y: 0.5,
        },
      }),
    ).toThrow(
      "Wagon-wheel X coordinate must be between 0 and 1.",
    );
  });

  it("rejects wagon-wheel coordinates above one", () => {
    expect(() =>
      validateDeliveryEnrichment({
        destination: {
          x: 0.5,
          y: 1.01,
        },
      }),
    ).toThrow(
      "Wagon-wheel Y coordinate must be between 0 and 1.",
    );
  });

  it("rejects non-finite wagon-wheel coordinates", () => {
    expect(() =>
      validateDeliveryEnrichment({
        destination: {
          x: Number.NaN,
          y: 0.5,
        },
      }),
    ).toThrow(
      "Wagon-wheel X coordinate must be between 0 and 1.",
    );
  });

  it("trims scorer notes", () => {
    expect(
      normaliseScorerNote("  Thick edge through slip.  "),
    ).toBe("Thick edge through slip.");
  });

  it("accepts a scorer note at the 250-character limit", () => {
    const note = "a".repeat(250);

    expect(normaliseScorerNote(note)).toBe(note);
  });

  it("rejects scorer notes longer than 250 characters", () => {
    expect(() =>
      normaliseScorerNote("a".repeat(251)),
    ).toThrow(
      "Scorer note must be 250 characters or fewer.",
    );
  });
});

describe("delivery fielding-event validation", () => {
  function validFieldingEvent(): DeliveryFieldingEvent {
    return {
      fieldingEventId:
        "11111111-1111-4111-8111-111111111111",
      sequenceNumber: 1,
      eventType: "MISFIELD",
    };
  }

  it("allows an unknown fielder", () => {
    expect(() =>
      validateDeliveryFieldingEvent(
        validFieldingEvent(),
      ),
    ).not.toThrow();
  });

  it("accepts zero additional runs attributed", () => {
    expect(() =>
      validateDeliveryFieldingEvent({
        ...validFieldingEvent(),
        additionalRunsAttributed: 0,
      }),
    ).not.toThrow();
  });

  it("accepts multiple factual fielding observations by sequence", () => {
    const misfield: DeliveryFieldingEvent = {
      ...validFieldingEvent(),
      sequenceNumber: 1,
      eventType: "MISFIELD",
    };

    const overthrow: DeliveryFieldingEvent = {
      ...validFieldingEvent(),
      fieldingEventId:
        "22222222-2222-4222-8222-222222222222",
      sequenceNumber: 2,
      eventType: "OVERTHROW",
    };

    expect(() =>
      validateDeliveryFieldingEvent(misfield),
    ).not.toThrow();

    expect(() =>
      validateDeliveryFieldingEvent(overthrow),
    ).not.toThrow();
  });

  it("rejects a blank fielding-event ID", () => {
    expect(() =>
      validateDeliveryFieldingEvent({
        ...validFieldingEvent(),
        fieldingEventId: "   ",
      }),
    ).toThrow("Fielding event ID is required.");
  });

  it("rejects zero or negative sequence numbers", () => {
    expect(() =>
      validateDeliveryFieldingEvent({
        ...validFieldingEvent(),
        sequenceNumber: 0,
      }),
    ).toThrow(
      "Fielding event sequence number must be a positive integer.",
    );

    expect(() =>
      validateDeliveryFieldingEvent({
        ...validFieldingEvent(),
        sequenceNumber: -1,
      }),
    ).toThrow(
      "Fielding event sequence number must be a positive integer.",
    );
  });

  it("rejects fractional sequence numbers", () => {
    expect(() =>
      validateDeliveryFieldingEvent({
        ...validFieldingEvent(),
        sequenceNumber: 1.5,
      }),
    ).toThrow(
      "Fielding event sequence number must be a positive integer.",
    );
  });

  it("rejects negative additional-run attribution", () => {
    expect(() =>
      validateDeliveryFieldingEvent({
        ...validFieldingEvent(),
        additionalRunsAttributed: -1,
      }),
    ).toThrow(
      "Additional runs attributed must be a non-negative integer.",
    );
  });

  it("rejects fractional additional-run attribution", () => {
    expect(() =>
      validateDeliveryFieldingEvent({
        ...validFieldingEvent(),
        additionalRunsAttributed: 1.5,
      }),
    ).toThrow(
      "Additional runs attributed must be a non-negative integer.",
    );
  });
});