import "server-only";

import type { InningsState } from "@/lib/cricket-engine/types";
import {
  derivePersistedEventRowsState,
  isPersistedScoringEventRow,
  type PersistedScoringEventRow,
} from "@/lib/app-scorer/replay";
import { createClient } from "@/lib/supabase/server";

type JsonObject = Record<string, unknown>;

type ScoringInningsRow = {
  innings_id: string;
  scoring_session_id: string;
  status: string;
  scheduled_balls: number | null;
  target_runs: number | null;
  opening_striker_participant_id: string | null;
  opening_non_striker_participant_id: string | null;
  opening_bowler_participant_id: string | null;
};

export type RecordDeliveryInput = {
  eventId: string;
  scoringSessionId: string;
  inningsId: string;
  sequenceKey: number;
  strikerParticipantId: string;
  nonStrikerParticipantId: string;
  bowlerParticipantId: string;
  batRuns: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  extras?: JsonObject;
  running?: JsonObject;
  wicket?: JsonObject;
  occurredAt?: string;
  clientCreatedAt?: string;
  deviceId?: string;
};

export type RecordDeliveryResult = {
  eventId: string;
  state: InningsState;
};

export type ScorerSnapshot = {
  inningsId: string;
  scoringSessionId: string;
  inningsStatus: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  completedOvers: number;
  legalBallsInCurrentOver: number;
  overReadyToEnd: boolean;
  strikerParticipantId: string;
  nonStrikerParticipantId: string;
  bowlerParticipantId: string;
  nextSequenceKey: number;
  eventCount: number;
  state: InningsState;
};

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isScoringInningsRow(
  value: unknown,
): value is ScoringInningsRow {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.innings_id === "string" &&
    typeof value.scoring_session_id === "string" &&
    typeof value.status === "string" &&
    (
      value.scheduled_balls === null ||
      typeof value.scheduled_balls === "number"
    ) &&
    (
      value.target_runs === null ||
      typeof value.target_runs === "number"
    ) &&
    isNullableString(
      value.opening_striker_participant_id,
    ) &&
    isNullableString(
      value.opening_non_striker_participant_id,
    ) &&
    isNullableString(
      value.opening_bowler_participant_id,
    )
  );
}

async function loadInnings(
  inningsId: string,
): Promise<ScoringInningsRow> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scoring_innings")
    .select(
      [
        "innings_id",
        "scoring_session_id",
        "status",
        "scheduled_balls",
        "target_runs",
        "opening_striker_participant_id",
        "opening_non_striker_participant_id",
        "opening_bowler_participant_id",
      ].join(","),
    )
    .eq("innings_id", inningsId)
    .single();

  if (error) {
    throw new Error(
      `Unable to load scoring innings: ${error.message}`,
    );
  }

  if (!isScoringInningsRow(data)) {
    throw new Error(
      "Scoring innings returned an invalid data shape.",
    );
  }

  return data;
}

async function loadInningsEvents(
  scoringSessionId: string,
  inningsId: string,
): Promise<PersistedScoringEventRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scoring_events")
    .select(
      "event_id,sequence_key,event_type,payload",
    )
    .eq("scoring_session_id", scoringSessionId)
    .eq("innings_id", inningsId)
    .order("sequence_key", { ascending: true });

  if (error) {
    throw new Error(
      `Unable to load scoring events: ${error.message}`,
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "Scoring events returned an invalid data shape.",
    );
  }

  const rows: PersistedScoringEventRow[] = [];

  for (const row of data) {
    if (!isPersistedScoringEventRow(row)) {
      throw new Error(
        "Scoring event ledger returned an invalid row.",
      );
    }

    rows.push(row);
  }

  return rows;
}

function deriveState(
  innings: ScoringInningsRow,
  rows: PersistedScoringEventRow[],
): InningsState {
  return derivePersistedEventRowsState(
    rows,
    {
      scheduledBalls: innings.scheduled_balls,
      targetRuns: innings.target_runs,
    },
  );
}

function requireOpeningConfiguration(
  innings: ScoringInningsRow,
): {
  strikerParticipantId: string;
  nonStrikerParticipantId: string;
  bowlerParticipantId: string;
} {
  const strikerParticipantId =
    innings.opening_striker_participant_id;
  const nonStrikerParticipantId =
    innings.opening_non_striker_participant_id;
  const bowlerParticipantId =
    innings.opening_bowler_participant_id;

  if (
    strikerParticipantId === null ||
    nonStrikerParticipantId === null ||
    bowlerParticipantId === null
  ) {
    throw new Error(
      "Scoring innings does not have a complete opening configuration.",
    );
  }

  return {
    strikerParticipantId,
    nonStrikerParticipantId,
    bowlerParticipantId,
  };
}

function currentParticipants(
  innings: ScoringInningsRow,
  rows: PersistedScoringEventRow[],
  state: InningsState,
): {
  strikerParticipantId: string;
  nonStrikerParticipantId: string;
  bowlerParticipantId: string;
} {
  if (rows.length === 0) {
    return requireOpeningConfiguration(innings);
  }

  if (
    state.strikerId === null ||
    state.nonStrikerId === null ||
    state.currentBowlerId === null
  ) {
    throw new Error(
      "Persisted innings state does not identify the current striker, non-striker and bowler.",
    );
  }

  return {
    strikerParticipantId: state.strikerId,
    nonStrikerParticipantId: state.nonStrikerId,
    bowlerParticipantId: state.currentBowlerId,
  };
}

function nextSequenceKey(
  rows: PersistedScoringEventRow[],
): number {
  if (rows.length === 0) {
    return 1;
  }

  return Math.max(
    ...rows.map((row) => row.sequence_key),
  ) + 1;
}

async function loadScorerData(
  inningsId: string,
): Promise<{
  innings: ScoringInningsRow;
  rows: PersistedScoringEventRow[];
  state: InningsState;
}> {
  const innings = await loadInnings(inningsId);

  const rows = await loadInningsEvents(
    innings.scoring_session_id,
    innings.innings_id,
  );

  const state = deriveState(innings, rows);

  return {
    innings,
    rows,
    state,
  };
}

export async function derivePersistedInningsState(
  inningsId: string,
): Promise<InningsState> {
  const { state } = await loadScorerData(inningsId);
  return state;
}

export async function getScorerSnapshot(
  inningsId: string,
): Promise<ScorerSnapshot> {
  const { innings, rows, state } =
    await loadScorerData(inningsId);

  const participants = currentParticipants(
    innings,
    rows,
    state,
  );

  return {
    inningsId: innings.innings_id,
    scoringSessionId: innings.scoring_session_id,
    inningsStatus: innings.status,
    runs: state.runs,
    wickets: state.wickets,
    legalBalls: state.legalBalls,
    completedOvers: state.completedOvers,
    legalBallsInCurrentOver:
      state.legalBallsInCurrentOver,
    overReadyToEnd: state.overReadyToEnd,
    strikerParticipantId:
      participants.strikerParticipantId,
    nonStrikerParticipantId:
      participants.nonStrikerParticipantId,
    bowlerParticipantId:
      participants.bowlerParticipantId,
    nextSequenceKey: nextSequenceKey(rows),
    eventCount: rows.length,
    state,
  };
}

export async function recordDelivery(
  input: RecordDeliveryInput,
): Promise<RecordDeliveryResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "record_app_scorer_delivery",
    {
      target_event_id: input.eventId,
      target_scoring_session_id:
        input.scoringSessionId,
      target_innings_id: input.inningsId,
      target_sequence_key: input.sequenceKey,
      target_striker_participant_id:
        input.strikerParticipantId,
      target_non_striker_participant_id:
        input.nonStrikerParticipantId,
      target_bowler_participant_id:
        input.bowlerParticipantId,
      target_bat_runs: input.batRuns,
      target_extras: input.extras ?? null,
      target_running: input.running ?? null,
      target_wicket: input.wicket ?? null,
      target_occurred_at:
        input.occurredAt ?? new Date().toISOString(),
      target_client_created_at:
        input.clientCreatedAt ?? null,
      target_device_id: input.deviceId ?? null,
    },
  );

  if (error) {
    throw new Error(
      `Unable to record delivery: ${error.message}`,
    );
  }

  if (typeof data !== "string") {
    throw new Error(
      "Delivery persistence returned an invalid event ID.",
    );
  }

  const state =
    await derivePersistedInningsState(input.inningsId);

  return {
    eventId: data,
    state,
  };
}
