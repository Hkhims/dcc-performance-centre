export type ParticipantId = string;

export type DeliveryExtras = {
  wides?: number;
  noBalls?: number;
  byes?: number;
  legByes?: number;
};

export type DeliveryRunning = {
  completedRuns: number;
  shortRuns?: number;
};

export type BowlerOnlyWicketType =
  | "BOWLED"
  | "LBW"
  | "HIT_WICKET";

export type BowlerOnlyWicket = {
  type: BowlerOnlyWicketType;
  dismissedBatterId: ParticipantId;
};

export type CaughtWicket = {
  type: "CAUGHT";
  dismissedBatterId: ParticipantId;
  fielderId: ParticipantId;
};

export type StumpedWicket = {
  type: "STUMPED";
  dismissedBatterId: ParticipantId;
  fielderId: ParticipantId;
};

export type CaughtAndBowledWicket = {
  type: "CAUGHT_AND_BOWLED";
  dismissedBatterId: ParticipantId;
};

export type RunOutWicket = {
  type: "RUN_OUT";
  dismissedBatterId: ParticipantId;
  fielderIds: ParticipantId[];
};

export type DeliveryWicket =
  | BowlerOnlyWicket
  | CaughtWicket
  | StumpedWicket
  | CaughtAndBowledWicket
  | RunOutWicket;

export type DeliveryEvent = {
  id: string;
  type: "DELIVERY";
  strikerId: ParticipantId;
  nonStrikerId: ParticipantId;
  bowlerId: ParticipantId;
  batRuns: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  extras?: DeliveryExtras;
  running?: DeliveryRunning;
  wicket?: DeliveryWicket;
};

export type OverEndedEvent = {
  id: string;
  type: "OVER_ENDED";
};

export type CricketEvent =
  | DeliveryEvent
  | OverEndedEvent;

export type BatterState = {
  participantId: ParticipantId;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissed: boolean;
};

export type BowlerState = {
  participantId: ParticipantId;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
};

export type FielderState = {
  participantId: ParticipantId;
  catches: number;
  stumpings: number;
  runOuts: number;
};

export type ExtrasState = {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalty: number;
  total: number;
};

export type InningsState = {
  runs: number;
  wickets: number;
  legalBalls: number;
  completedOvers: number;
  legalBallsInCurrentOver: number;
  overReadyToEnd: boolean;
  strikerId: ParticipantId | null;
  nonStrikerId: ParticipantId | null;
  currentBowlerId: ParticipantId | null;
  extras: ExtrasState;
  batters: Record<ParticipantId, BatterState>;
  bowlers: Record<ParticipantId, BowlerState>;
  fielders: Record<ParticipantId, FielderState>;
};

export function formatOvers(
  completedOvers: number,
  legalBallsInCurrentOver: number,
): string {
  return `${completedOvers}.${legalBallsInCurrentOver}`;
}