export type DeliveryLine =
  | "WIDE_OUTSIDE_OFF"
  | "OUTSIDE_OFF"
  | "OFF_STUMP"
  | "MIDDLE_STUMP"
  | "LEG_STUMP"
  | "OUTSIDE_LEG";

export type DeliveryLength =
  | "YORKER"
  | "FULL"
  | "GOOD_LENGTH"
  | "BACK_OF_LENGTH"
  | "SHORT"
  | "FULL_TOSS";

export type ShotType =
  | "NO_SHOT"
  | "LEAVE"
  | "DEFENCE"
  | "DRIVE"
  | "PUNCH"
  | "CUT"
  | "PULL"
  | "HOOK"
  | "FLICK_CLIP"
  | "GLANCE"
  | "SWEEP"
  | "REVERSE_SWEEP"
  | "SLOG"
  | "SLOG_SWEEP"
  | "RAMP_SCOOP"
  | "OTHER";

export type ShotIntent =
  | "GROUNDED"
  | "LOFTED";

export type ContactType =
  | "CLEAN"
  | "EDGED"
  | "INSIDE_EDGE"
  | "MISTIMED"
  | "BEATEN"
  | "TOP_EDGE";

export type NoBallReason =
  | "FRONT_FOOT"
  | "HIGH_FULL_TOSS"
  | "OTHER"
  | "UNSPECIFIED";

export type WideDirection =
  | "OFF_SIDE"
  | "LEG_SIDE"
  | "UNSPECIFIED";

export type DeliveryEnrichmentProvenance =
  | "SCORER_RECORDED"
  | "TEAM_ADMIN_CORRECTED"
  | "SYSTEM_DERIVED"
  | "VIDEO_DERIVED";

export type DeliveryFieldingEventType =
  | "MISFIELD"
  | "DROPPED_CATCH"
  | "OVERTHROW"
  | "MISSED_RUN_OUT"
  | "DIRECT_HIT"
  | "STUMPING_CHANCE_MISSED";

export type WagonWheelDestination = {
  /**
   * Normalised horizontal field coordinate.
   * 0 = left edge of the field, 1 = right edge.
   */
  x: number;

  /**
   * Normalised vertical field coordinate.
   * 0 = top edge of the field, 1 = bottom edge.
   */
  y: number;
};

export type DeliveryEnrichment = {
  deliveryLine?: DeliveryLine;
  deliveryLength?: DeliveryLength;

  shotType?: ShotType;
  shotIntent?: ShotIntent;
  contactType?: ContactType;

  destination?: WagonWheelDestination;

  noBallReason?: NoBallReason;
  wideDirection?: WideDirection;

  scorerNote?: string;
};

export type DeliveryFieldingEvent = {
  fieldingEventId: string;
  sequenceNumber: number;
  eventType: DeliveryFieldingEventType;

  /**
   * Optional by design. An unknown fielder remains unknown rather than being
   * represented by a fabricated match participant.
   */
  fielderParticipantId?: string;

  /**
   * Optional factual attribution for additional runs caused by this fielding
   * event. It does not itself alter the canonical score.
   */
  additionalRunsAttributed?: number;
};

export function requireNormalisedCoordinate(
  value: number,
  label: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${label} must be between 0 and 1.`);
  }

  return value;
}

export function normaliseScorerNote(note: string): string {
  const trimmed = note.trim();

  if (trimmed.length > 250) {
    throw new Error(
      "Scorer note must be 250 characters or fewer.",
    );
  }

  return trimmed;
}

export function validateDeliveryEnrichment(
  enrichment: DeliveryEnrichment,
): void {
  if (enrichment.destination) {
    requireNormalisedCoordinate(
      enrichment.destination.x,
      "Wagon-wheel X coordinate",
    );

    requireNormalisedCoordinate(
      enrichment.destination.y,
      "Wagon-wheel Y coordinate",
    );
  }

  if (enrichment.scorerNote !== undefined) {
    normaliseScorerNote(enrichment.scorerNote);
  }
}

export function validateDeliveryFieldingEvent(
  fieldingEvent: DeliveryFieldingEvent,
): void {
  if (!fieldingEvent.fieldingEventId.trim()) {
    throw new Error("Fielding event ID is required.");
  }

  if (
    !Number.isInteger(fieldingEvent.sequenceNumber) ||
    fieldingEvent.sequenceNumber <= 0
  ) {
    throw new Error(
      "Fielding event sequence number must be a positive integer.",
    );
  }

  if (
    fieldingEvent.additionalRunsAttributed !== undefined &&
    (
      !Number.isInteger(
        fieldingEvent.additionalRunsAttributed,
      ) ||
      fieldingEvent.additionalRunsAttributed < 0
    )
  ) {
    throw new Error(
      "Additional runs attributed must be a non-negative integer.",
    );
  }
}