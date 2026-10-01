import {
  deriveInningsState,
  resolveEffectiveEvents,
} from "../cricket-engine/engine";
import type {
  CricketEvent,
  InningsPlayingConditions,
  InningsState,
} from "../cricket-engine/types";

type JsonObject = Record<string, unknown>;

export type PersistedScoringEventRow = {
  event_id: string;
  sequence_key: number;
  event_type: string;
  payload: unknown;
};

export type PersistedInningsConfiguration = {
  scheduledBalls: number | null;
  targetRuns: number | null;
};

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function isPersistedScoringEventRow(
  value: unknown,
): value is PersistedScoringEventRow {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.event_id === "string" &&
    typeof value.sequence_key === "number" &&
    typeof value.event_type === "string" &&
    "payload" in value
  );
}

export function persistedRowToCricketEvent(
  row: PersistedScoringEventRow,
): CricketEvent {
  if (!isJsonObject(row.payload)) {
    throw new Error(
      `Scoring event ${row.event_id} has an invalid payload.`,
    );
  }

  const payloadId = row.payload.id;
  const payloadType = row.payload.type;

  if (
    typeof payloadId !== "string" ||
    payloadId !== row.event_id
  ) {
    throw new Error(
      `Scoring event ${row.event_id} has a mismatched payload ID.`,
    );
  }

  if (
    typeof payloadType !== "string" ||
    payloadType !== row.event_type
  ) {
    throw new Error(
      `Scoring event ${row.event_id} has a mismatched payload type.`,
    );
  }

  return row.payload as unknown as CricketEvent;
}

function toPlayingConditions(
  configuration: PersistedInningsConfiguration,
): InningsPlayingConditions {
  const conditions: InningsPlayingConditions = {};

  if (configuration.scheduledBalls !== null) {
    conditions.scheduledLegalBalls =
      configuration.scheduledBalls;
  }

  if (configuration.targetRuns !== null) {
    conditions.target = configuration.targetRuns;
  }

  return conditions;
}

export function hasEffectiveScoringActionEvents(
  rows: PersistedScoringEventRow[],
): boolean {
  const orderedRows = [...rows].sort(
    (a, b) => a.sequence_key - b.sequence_key,
  );

  const events = orderedRows.map(
    persistedRowToCricketEvent,
  );

  return resolveEffectiveEvents(events).length > 0;
}

export function derivePersistedEventRowsState(
  rows: PersistedScoringEventRow[],
  configuration: PersistedInningsConfiguration,
): InningsState {
  const orderedRows = [...rows].sort(
    (a, b) => a.sequence_key - b.sequence_key,
  );

  const events = orderedRows.map(
    persistedRowToCricketEvent,
  );

  return deriveInningsState(
    events,
    toPlayingConditions(configuration),
  );
}