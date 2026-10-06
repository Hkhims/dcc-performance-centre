import "server-only";



import type {

  DeliveryBoundary,

  InningsEndedReason,

  InningsState,

} from "@/lib/cricket-engine/types";

import {

  derivePersistedEventRowsState,

  hasEffectiveScoringActionEvents,

  isPersistedScoringEventRow,

  type PersistedScoringEventRow,

  persistedRowToCricketEvent,

} from "@/lib/app-scorer/replay";

import { resolveEffectiveEvents } from "@/lib/cricket-engine/engine";

import { createClient } from "@/lib/supabase/server";

import type { BreakReason } from "@/lib/cricket-engine/types";

import {

  buildCanonicalDccPlayerPerformances,

  buildCanonicalMatchTeamEntry,

  type CanonicalPublicationInnings,

  type CanonicalPublicationParticipant,

  type CanonicalPublicationResult,

  type CanonicalPublicationSide,

} from "@/lib/app-scorer/canonical-publication";



type JsonObject = Record<string, unknown>;



type ScoringInningsRow = {

  innings_id: string;

  scoring_session_id: string;

  innings_number: number;

  batting_side_id: string;

  bowling_side_id: string;

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

  boundary?: DeliveryBoundary;

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

  strikerParticipantId: string | null;

  nonStrikerParticipantId: string | null;

  bowlerParticipantId: string | null;

  previousOverBowlerParticipantId: string | null;

  nextSequenceKey: number;

  eventCount: number;

  currentOver: string[];

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

    Number.isInteger(value.innings_number) &&

    typeof value.batting_side_id === "string" &&

    typeof value.bowling_side_id === "string" &&

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

        "innings_number",

        "batting_side_id",

        "bowling_side_id",

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

  strikerParticipantId: string | null;

  nonStrikerParticipantId: string | null;

  bowlerParticipantId: string | null;

} {

  if (!hasEffectiveScoringActionEvents(rows)) {

    return requireOpeningConfiguration(innings);

  }



  return {

    strikerParticipantId: state.strikerId,

    nonStrikerParticipantId: state.nonStrikerId,

    bowlerParticipantId: state.currentBowlerId,

  };

}



async function nextSessionSequenceKey(

  scoringSessionId: string,

): Promise<number> {

  const supabase = await createClient();



  const { data, error } = await supabase

    .from("scoring_events")

    .select("sequence_key")

    .eq("scoring_session_id", scoringSessionId)

    .order("sequence_key", { ascending: false })

    .limit(1)

    .maybeSingle();



  if (error) {

    throw new Error(

      `Unable to determine next scoring sequence: ${error.message}`,

    );

  }



  if (!data) {

    return 1;

  }



  return data.sequence_key + 1;

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



function currentOverTokens(rows: PersistedScoringEventRow[]): string[] {

  const events = resolveEffectiveEvents(

    [...rows]

      .sort((a, b) => a.sequence_key - b.sequence_key)

      .map(persistedRowToCricketEvent),

  );



  const lastOverEnd = events.reduce(

    (lastIndex, event, index) =>

      event.type === "OVER_ENDED" ? index : lastIndex,

    -1,

  );



  return events.slice(lastOverEnd + 1).flatMap((event) => {

    if (event.type !== "DELIVERY") return [];



    if (event.wicket) return ["W"];



    const wides = event.extras?.wides ?? 0;

    if (wides > 0) return [`${wides}Wd`];



    const noBalls = event.extras?.noBalls ?? 0;

    if (noBalls > 0) {

      const total = event.batRuns + noBalls +

        (event.extras?.byes ?? 0) + (event.extras?.legByes ?? 0);

      return [`${total}Nb`];

    }



    const byes = event.extras?.byes ?? 0;

    if (byes > 0) return [`${byes}B`];



    const legByes = event.extras?.legByes ?? 0;

    if (legByes > 0) return [`${legByes}Lb`];



    return [event.batRuns === 0 ? "•" : String(event.batRuns)];

  });

}



export async function getScorerSnapshot(

  inningsId: string,

): Promise<ScorerSnapshot> {

  const { innings, rows, state } =

    await loadScorerData(inningsId);



  const nextSequenceKey =

    await nextSessionSequenceKey(

      innings.scoring_session_id,

  );



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

    previousOverBowlerParticipantId:

      state.previousOverBowlerId,

    nextSequenceKey,

    eventCount: rows.length,

    currentOver: currentOverTokens(rows),

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

      target_boundary: input.boundary ?? null,

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





export async function recordOverEnded(input: {

  eventId: string;

  scoringSessionId: string;

  inningsId: string;

  sequenceKey: number;

}): Promise<RecordDeliveryResult> {

  const supabase = await createClient();



  const { data, error } = await supabase.rpc(

    "record_app_scorer_over_ended",

    {

      target_event_id: input.eventId,

      target_scoring_session_id: input.scoringSessionId,

      target_innings_id: input.inningsId,

      target_sequence_key: input.sequenceKey,

      target_occurred_at: new Date().toISOString(),

      target_client_created_at: null,

      target_device_id: null,

    },

  );



  if (error) {

    throw new Error(`Unable to end over: ${error.message}`);

  }



  if (typeof data !== "string") {

    throw new Error("Over persistence returned an invalid event ID.");

  }



  return {

    eventId: data,

    state: await derivePersistedInningsState(input.inningsId),

  };

}



export async function recordPlayingConditionsChanged(input: {

  eventId: string;

  scoringSessionId: string;

  inningsId: string;

  sequenceKey: number;

  scheduledLegalBalls: number;

  currentLegalBalls: number;

}): Promise<RecordDeliveryResult> {

  if (

    !Number.isInteger(input.scheduledLegalBalls) ||

    input.scheduledLegalBalls <= 0 ||

    input.scheduledLegalBalls % 6 !== 0

  ) {

    throw new Error(

      "The scheduled ball limit must represent a positive whole number of overs.",

    );

  }



  if (

    !Number.isInteger(input.currentLegalBalls) ||

    input.currentLegalBalls < 0

  ) {

    throw new Error("The current legal-ball count is invalid.");

  }



  if (input.scheduledLegalBalls < input.currentLegalBalls) {

    throw new Error(

      "The revised scheduled limit cannot be below the number of legal balls already bowled.",

    );

  }



  const supabase = await createClient();



  const { data, error } = await supabase.rpc(

    "record_app_scorer_playing_conditions_changed",

    {

      target_event_id: input.eventId,

      target_scoring_session_id: input.scoringSessionId,

      target_innings_id: input.inningsId,

      target_sequence_key: input.sequenceKey,

      target_scheduled_legal_balls: input.scheduledLegalBalls,

      target_current_legal_balls: input.currentLegalBalls,

      target_occurred_at: new Date().toISOString(),

      target_client_created_at: null,

      target_device_id: null,

    },

  );



  if (error) {

    throw new Error(

      `Unable to change playing conditions: ${error.message}`,

    );

  }



  if (typeof data !== "string") {

    throw new Error(

      "Playing-conditions persistence returned an invalid event ID.",

    );

  }



  return {

    eventId: data,

    state: await derivePersistedInningsState(input.inningsId),

  };

}



export async function recordInningsEnded(input: {

  eventId: string;

  scoringSessionId: string;

  inningsId: string;

  sequenceKey: number;

  reason: InningsEndedReason;

}): Promise<RecordDeliveryResult> {

  const supabase = await createClient();



  const { data, error } = await supabase.rpc(

    "record_app_scorer_innings_ended",

    {

      target_event_id: input.eventId,

      target_scoring_session_id: input.scoringSessionId,

      target_innings_id: input.inningsId,

      target_sequence_key: input.sequenceKey,

      target_reason: input.reason,

      target_occurred_at: new Date().toISOString(),

      target_client_created_at: null,

      target_device_id: null,

    },

  );



  if (error) {

    throw new Error(

      `Unable to end innings: ${error.message}`,

    );

  }



  if (typeof data !== "string") {

    throw new Error(

      "Innings completion persistence returned an invalid event ID.",

    );

  }



  return {

    eventId: data,

    state: await derivePersistedInningsState(input.inningsId),

  };

}



export async function undoLastBall(input: {

  correctionGroupId: string;

  scoringSessionId: string;

  inningsId: string;

}): Promise<RecordDeliveryResult> {

  const supabase = await createClient();



  const { data, error } = await supabase.rpc(

    "undo_app_scorer_last_ball",

    {

      target_correction_group_id: input.correctionGroupId,

      target_scoring_session_id: input.scoringSessionId,

      target_innings_id: input.inningsId,

      target_occurred_at: new Date().toISOString(),

      target_client_created_at: null,

      target_device_id: null,

    },

  );



  if (error) {

    throw new Error(`Unable to undo last ball: ${error.message}`);

  }



  if (typeof data !== "string") {

    throw new Error("Undo persistence returned an invalid event ID.");

  }



  return {

    eventId: data,

    state: await derivePersistedInningsState(input.inningsId),

  };

}




type PublicationSessionRow = {
  match_id: string;
};

type PublicationSideRow = {
  side_id: string;
  side_type: CanonicalPublicationSide["sideType"];
  canonical_team_id: string | null;
  display_name: string;
};

type PublicationParticipantRow = {
  match_participant_id: string;
  side_id: string;
  participant_type: CanonicalPublicationParticipant["participantType"];
  dcc_player_id: string | null;
  display_name: string;
};

type ExistingCanonicalEntryRow = {
  source_match_id: string;
  match_id: string;
  team_id: string;
  competition_id: string;
  opponent_id: string | null;
  opponent_display_name: string;
  scheduled_overs: number | null;
};

function isPublicationSessionRow(
  value: unknown,
): value is PublicationSessionRow {
  return (
    isJsonObject(value) &&
    typeof value.match_id === "string"
  );
}

function isPublicationSideRow(
  value: unknown,
): value is PublicationSideRow {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.side_id === "string" &&
    (
      value.side_type === "DCC_TEAM" ||
      value.side_type === "EXTERNAL" ||
      value.side_type === "INTERNAL"
    ) &&
    isNullableString(value.canonical_team_id) &&
    typeof value.display_name === "string"
  );
}

function isPublicationParticipantRow(
  value: unknown,
): value is PublicationParticipantRow {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.match_participant_id === "string" &&
    typeof value.side_id === "string" &&
    (
      value.participant_type === "DCC" ||
      value.participant_type === "EXTERNAL" ||
      value.participant_type === "GUEST"
    ) &&
    isNullableString(value.dcc_player_id) &&
    typeof value.display_name === "string"
  );
}

function isExistingCanonicalEntryRow(
  value: unknown,
): value is ExistingCanonicalEntryRow {
  if (!isJsonObject(value)) {
    return false;
  }

  return (
    typeof value.source_match_id === "string" &&
    typeof value.match_id === "string" &&
    typeof value.team_id === "string" &&
    typeof value.competition_id === "string" &&
    isNullableString(value.opponent_id) &&
    typeof value.opponent_display_name === "string" &&
    (
      value.scheduled_overs === null ||
      typeof value.scheduled_overs === "number"
    )
  );
}

function publicationEvents(
  rows: PersistedScoringEventRow[],
) {
  return [...rows]
    .sort((a, b) => a.sequence_key - b.sequence_key)
    .map(persistedRowToCricketEvent);
}

function hasPlayingConditionsChange(
  rows: PersistedScoringEventRow[],
): boolean {
  return publicationEvents(rows).some(
    (event) =>
      event.type === "PLAYING_CONDITIONS_CHANGED",
  );
}

function originalScheduledBallsForPublication(input: {
  canonicalScheduledOvers: number | null;
  innings: ScoringInningsRow;
  rows: PersistedScoringEventRow[];
}): number | null {
  if (input.canonicalScheduledOvers !== null) {
    return input.canonicalScheduledOvers * 6;
  }

  /*
   * scoring_innings.scheduled_balls is deliberately mutable: a
   * PLAYING_CONDITIONS_CHANGED event updates the live innings limit.
   *
   * If the canonical fixture did not store the original scheduled
   * overs and the limit was subsequently changed, the original value
   * cannot be reconstructed faithfully from the current row. Refuse
   * publication rather than silently publishing the revised limit as
   * the original limit.
   */
  if (hasPlayingConditionsChange(input.rows)) {
    throw new Error(
      "Unable to publish revised overs because the match has no original scheduled-overs value.",
    );
  }

  return input.innings.scheduled_balls;
}

function buildCanonicalPublicationInnings(input: {
  scorerData: {
    innings: ScoringInningsRow;
    rows: PersistedScoringEventRow[];
    state: InningsState;
  };
  originalScheduledBalls: number | null;
}): CanonicalPublicationInnings {
  const { innings, rows, state } = input.scorerData;

  if (
    innings.innings_number !== 1 &&
    innings.innings_number !== 2
  ) {
    throw new Error(
      `Scorer innings ${innings.innings_id} has an invalid innings number.`,
    );
  }

  if (
    innings.opening_striker_participant_id === null ||
    innings.opening_non_striker_participant_id === null
  ) {
    throw new Error(
      "Completed scorer innings is missing its opening batters.",
    );
  }

  return {
    inningsId: innings.innings_id,
    inningsNumber: innings.innings_number,
    battingSideId: innings.batting_side_id,
    bowlingSideId: innings.bowling_side_id,
    originalScheduledBalls: input.originalScheduledBalls,
    finalScheduledBalls:
      state.playingConditions.scheduledLegalBalls,
    openingStrikerParticipantId:
      innings.opening_striker_participant_id,
    openingNonStrikerParticipantId:
      innings.opening_non_striker_participant_id,
    events: publicationEvents(rows),
    state,
  };
}

export async function publishCompletedAppScorerMatch(input: {
  scoringSessionId: string;
  firstInningsId: string;
  secondInningsId: string;
  result: CanonicalPublicationResult;
}): Promise<void> {
  const supabase = await createClient();

  const [
    firstScorerData,
    secondScorerData,
  ] = await Promise.all([
    loadScorerData(input.firstInningsId),
    loadScorerData(input.secondInningsId),
  ]);

  if (
    firstScorerData.innings.scoring_session_id !==
      input.scoringSessionId ||
    secondScorerData.innings.scoring_session_id !==
      input.scoringSessionId
  ) {
    throw new Error(
      "Both innings must belong to this scoring session.",
    );
  }

  if (
    firstScorerData.innings.innings_number !== 1 ||
    secondScorerData.innings.innings_number !== 2
  ) {
    throw new Error(
      "Completed match publication requires innings one and innings two in order.",
    );
  }

  const {
    data: sessionData,
    error: sessionError,
  } = await supabase
    .from("scoring_sessions")
    .select("match_id")
    .eq(
      "scoring_session_id",
      input.scoringSessionId,
    )
    .single();

  if (sessionError) {
    throw new Error(
      `Unable to load the scoring session: ${sessionError.message}`,
    );
  }

  if (!isPublicationSessionRow(sessionData)) {
    throw new Error(
      "Scoring session returned an invalid data shape.",
    );
  }

  const {
    data: sideData,
    error: sidesError,
  } = await supabase
    .from("match_sides")
    .select(
      "side_id,side_type,canonical_team_id,display_name",
    )
    .eq(
      "scoring_session_id",
      input.scoringSessionId,
    )
    .order("side_number");

  if (sidesError) {
    throw new Error(
      `Unable to load match sides: ${sidesError.message}`,
    );
  }

  if (
    !Array.isArray(sideData) ||
    sideData.length !== 2 ||
    !sideData.every(isPublicationSideRow)
  ) {
    throw new Error(
      "Match sides returned an invalid data shape.",
    );
  }

  const sides: CanonicalPublicationSide[] =
    sideData.map((side) => ({
      sideId: side.side_id,
      sideType: side.side_type,
      canonicalTeamId: side.canonical_team_id,
      displayName: side.display_name,
    }));

  const {
    data: participantData,
    error: participantsError,
  } = await supabase
    .from("match_participants")
    .select(
      "match_participant_id,side_id,participant_type,dcc_player_id,display_name",
    )
    .eq(
      "scoring_session_id",
      input.scoringSessionId,
    );

  if (participantsError) {
    throw new Error(
      `Unable to load match participants: ${participantsError.message}`,
    );
  }

  if (
    !Array.isArray(participantData) ||
    !participantData.every(isPublicationParticipantRow)
  ) {
    throw new Error(
      "Match participants returned an invalid data shape.",
    );
  }

  const participants:
    CanonicalPublicationParticipant[] =
    participantData.map((participant) => ({
      matchParticipantId:
        participant.match_participant_id,
      sideId: participant.side_id,
      participantType:
        participant.participant_type,
      dccPlayerId: participant.dcc_player_id,
      displayName: participant.display_name,
    }));

  const {
    data: existingEntryData,
    error: existingEntryError,
  } = await supabase
    .from("match_team_entries")
    .select(
      "source_match_id,match_id,team_id,competition_id,opponent_id,opponent_display_name,scheduled_overs",
    )
    .eq("match_id", sessionData.match_id)
    .single();

  if (existingEntryError) {
    throw new Error(
      `Unable to load the canonical match team entry: ${existingEntryError.message}`,
    );
  }

  if (!isExistingCanonicalEntryRow(existingEntryData)) {
    throw new Error(
      "Canonical match team entry returned an invalid data shape.",
    );
  }

  const dccSide = sides.find(
    (side) =>
      side.canonicalTeamId ===
      existingEntryData.team_id,
  );

  const opponentSide = sides.find(
    (side) => side.sideId !== dccSide?.sideId,
  );

  if (!dccSide || !opponentSide) {
    throw new Error(
      "Unable to resolve the DCC and opposition scorer sides.",
    );
  }

  const originalScheduledBalls =
    originalScheduledBallsForPublication({
      canonicalScheduledOvers:
        existingEntryData.scheduled_overs,
      innings: firstScorerData.innings,
      rows: firstScorerData.rows,
    });

  const innings: CanonicalPublicationInnings[] = [
    buildCanonicalPublicationInnings({
      scorerData: firstScorerData,
      originalScheduledBalls,
    }),
    buildCanonicalPublicationInnings({
      scorerData: secondScorerData,
      originalScheduledBalls,
    }),
  ];

  const teamEntry =
    buildCanonicalMatchTeamEntry({
      existingEntry: {
        sourceMatchId:
          existingEntryData.source_match_id,
        matchId: existingEntryData.match_id,
        teamId: existingEntryData.team_id,
        competitionId:
          existingEntryData.competition_id,
        opponentId:
          existingEntryData.opponent_id,
        opponentDisplayName:
          existingEntryData.opponent_display_name,
        scheduledOvers:
          existingEntryData.scheduled_overs,
      },
      dccSide,
      opponentSide,
      innings,
      result: input.result,
    });

  const dccPlayers =
    buildCanonicalDccPlayerPerformances({
      sourceMatchId: teamEntry.sourceMatchId,
      teamId: teamEntry.teamId,
      dccSide,
      participants,
      innings,
    });

  const scorecard = {
    version: 1,
    source: "DCC_APP_SCORER",
    match_id: teamEntry.matchId,
    team_entries: [teamEntry],
    dcc_players: dccPlayers,
    innings: innings.map((inningsEntry) => ({
      innings_number:
        inningsEntry.inningsNumber,
      batting_side_id:
        inningsEntry.battingSideId,
      bowling_side_id:
        inningsEntry.bowlingSideId,
      scheduled_legal_balls:
        inningsEntry.finalScheduledBalls,
      runs: inningsEntry.state.runs,
      wickets: inningsEntry.state.wickets,
      legal_balls:
        inningsEntry.state.legalBalls,
      events: inningsEntry.events,
    })),
  };

  const { error: publishError } =
    await supabase.rpc(
      "publish_app_scorer_match",
      {
        target_scoring_session_id:
          input.scoringSessionId,
        target_result_type:
          input.result.resultType,
        target_winner_side_id:
          input.result.winnerSideId,
        target_loser_side_id:
          input.result.loserSideId,
        target_win_method:
          input.result.winMethod,
        target_run_margin:
          input.result.runMargin,
        target_wicket_margin:
          input.result.wicketMargin,
        target_abandonment_reason:
          input.result.abandonmentReason,
        target_team_entry: {
          source_match_id:
            teamEntry.sourceMatchId,
          match_id: teamEntry.matchId,
          team_id: teamEntry.teamId,
          competition_id:
            teamEntry.competitionId,
          opponent_id: teamEntry.opponentId,
          opponent_display_name:
            teamEntry.opponentDisplayName,
          result: teamEntry.result,
          scheduled_overs:
            teamEntry.scheduledOvers,
          revised_overs:
            teamEntry.revisedOvers,
          dcc_score: teamEntry.dccScore,
          dcc_wickets:
            teamEntry.dccWickets,
          dcc_balls: teamEntry.dccBalls,
          opponent_score:
            teamEntry.opponentScore,
          opponent_wickets:
            teamEntry.opponentWickets,
          opponent_balls:
            teamEntry.opponentBalls,
          match_notes:
            teamEntry.matchNotes,
        },
        target_dcc_players:
          dccPlayers.map((player) => ({
            source_match_id:
              player.sourceMatchId,
            player_id: player.playerId,
            team_id: player.teamId,
            batted: player.batted,
            batting_position:
              player.battingPosition,
            runs: player.runs,
            balls_faced: player.ballsFaced,
            fours: player.fours,
            sixes: player.sixes,
            dismissal_type:
              player.dismissalType,
            is_not_out: player.isNotOut,
            bowled: player.bowled,
            bowling_balls:
              player.bowlingBalls,
            maidens: player.maidens,
            runs_conceded:
              player.runsConceded,
            wickets: player.wickets,
            wides: player.wides,
            no_balls: player.noBalls,
            wickets_bowled:
              player.wicketsBowled,
            wickets_caught:
              player.wicketsCaught,
            wickets_lbw:
              player.wicketsLbw,
            wickets_stumped:
              player.wicketsStumped,
            wickets_caught_and_bowled:
              player.wicketsCaughtAndBowled,
            wickets_hit_wicket:
              player.wicketsHitWicket,
            catches: player.catches,
            stumpings: player.stumpings,
            run_outs: player.runOuts,
            performance_notes:
              player.performanceNotes,
          })),
        target_scorecard: scorecard,
      },
    );

  if (publishError) {
    throw new Error(
      `Unable to publish completed match: ${publishError.message}`,
    );
  }
}


export type CompleteAppScorerMatchInput =

  | {

      scoringSessionId: string;

      resultType: "WIN";

      winnerSideId: string;

      loserSideId: string;

      winMethod: "RUNS";

      runMargin: number;

      wicketMargin: null;

      abandonmentReason: null;

    }

  | {

      scoringSessionId: string;

      resultType: "WIN";

      winnerSideId: string;

      loserSideId: string;

      winMethod: "CHASE";

      runMargin: null;

      wicketMargin: number;

      abandonmentReason: null;

    }

  | {

      scoringSessionId: string;

      resultType: "TIE";

      winnerSideId: null;

      loserSideId: null;

      winMethod: null;

      runMargin: null;

      wicketMargin: null;

      abandonmentReason: null;

    }

  | {

      scoringSessionId: string;

      resultType: "ABANDONED";

      winnerSideId: null;

      loserSideId: null;

      winMethod: null;

      runMargin: null;

      wicketMargin: null;

      abandonmentReason: string;

    };



export async function completeAppScorerMatch(

  input: CompleteAppScorerMatchInput,

): Promise<void> {

  const supabase = await createClient();



  const { error } = await supabase.rpc(

    "complete_app_scorer_match",

    {

      target_scoring_session_id: input.scoringSessionId,

      target_result_type: input.resultType,

      target_winner_side_id: input.winnerSideId,

      target_loser_side_id: input.loserSideId,

      target_win_method: input.winMethod,

      target_run_margin: input.runMargin,

      target_wicket_margin: input.wicketMargin,

      target_abandonment_reason: input.abandonmentReason,

    },

  );



  if (error) {

    throw new Error(

      `Unable to complete match: ${error.message}`,

    );

  }

}



export async function abandonAppScorerMatch(

  scoringSessionId: string,

  abandonmentReason: string,

) {

  const supabase = await createClient();



  const { error } = await supabase.rpc("abandon_app_scorer_match", {

    target_scoring_session_id: scoringSessionId,

    target_abandonment_reason: abandonmentReason,

  });



  if (error) {

    throw new Error(error.message);

  }

}



export async function recordBreakStarted(input: {

  eventId: string;

  scoringSessionId: string;

  inningsId: string;

  sequenceKey: number;

  reason: BreakReason;

  note?: string;

}) {

  const supabase = await createClient();



  const { error } = await supabase.rpc(

    "record_app_scorer_break_started",

    {

      target_event_id: input.eventId,

      target_scoring_session_id: input.scoringSessionId,

      target_innings_id: input.inningsId,

      target_sequence_key: input.sequenceKey,

      target_reason: input.reason,

      target_note: input.note?.trim() || null,

    },

  );



  if (error) {

    throw new Error(error.message);

  }

}



export async function recordBreakEnded(input: {

  eventId: string;

  scoringSessionId: string;

  inningsId: string;

  sequenceKey: number;

}) {

  const supabase = await createClient();



  const { error } = await supabase.rpc(

    "record_app_scorer_break_ended",

    {

      target_event_id: input.eventId,

      target_scoring_session_id: input.scoringSessionId,

      target_innings_id: input.inningsId,

      target_sequence_key: input.sequenceKey,

    },

  );



  if (error) {

    throw new Error(error.message);

  }

}



export async function recordBatterEntered(input: {

  eventId: string;

  scoringSessionId: string;

  inningsId: string;

  sequenceKey: number;

  batterParticipantId: string;

  end: "STRIKER" | "NON_STRIKER";

}): Promise<void> {

  const supabase = await createClient();



  const { error } = await supabase.rpc(

    "record_app_scorer_batter_entered",

    {

      target_event_id: input.eventId,

      target_scoring_session_id: input.scoringSessionId,

      target_innings_id: input.inningsId,

      target_sequence_key: input.sequenceKey,

      target_batter_participant_id: input.batterParticipantId,

      target_end: input.end,

      target_occurred_at: new Date().toISOString(),

      target_client_created_at: null,

      target_device_id: null,

    },

  );



  if (error) {

    throw new Error(

      `Unable to confirm incoming batter: ${error.message}`,

    );

  }

}