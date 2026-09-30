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

export type DeliveryBoundary = "NONE" | "FOUR" | "SIX";

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
  /**
   * Omitted when the catch is known but the scorer cannot identify the fielder.
   * The wicket remains valid; no player receives a catch until corrected.
   */
  fielderId?: ParticipantId;
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
  /**
   * Empty when the run-out is known but the scorer cannot identify a fielder.
   * This deliberately records unresolved attribution rather than inventing a player.
   */
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
  /**
 * Explicit physical boundary outcome. Omitted legacy events retain the
 * historical inference that 4 bat runs means FOUR and 6 bat runs means SIX.
 * New events can use NONE to distinguish physically-run fours/sixes.
 */
boundary?: DeliveryBoundary;
  extras?: DeliveryExtras;
  running?: DeliveryRunning;
  wicket?: DeliveryWicket;
};

export type OverEndedEvent = {
  id: string;
  type: "OVER_ENDED";
};

export type BatterRetiredEvent = {
  id: string;
  type: "BATTER_RETIRED";
  batterId: ParticipantId;
};

export type BatterReturnedEvent = {
  id: string;
  type: "BATTER_RETURNED";
  batterId: ParticipantId;
  end: "STRIKER" | "NON_STRIKER";
};

export type PenaltyRunsEvent = {
  id: string;
  type: "PENALTY_RUNS";
  runs: 5;
  awardedTo: "BATTING" | "OPPOSITION";
};

export type InningsEndedReason =
  | "TARGET_REACHED"
  | "BALL_LIMIT_REACHED"
  | "ALL_OUT"
  | "DECLARED"
  | "MANUAL";

export type InningsEndedEvent = {
  id: string;
  type: "INNINGS_ENDED";
  reason: "DECLARED" | "MANUAL";
};

export type BreakReason =
  | "RAIN"
  | "BAD_LIGHT"
  | "INJURY"
  | "DRINKS"
  | "GROUND_CONDITIONS"
  | "OTHER";

export type BreakStartedEvent = {
  id: string;
  type: "BREAK_STARTED";
  reason: BreakReason;
  note?: string;
};

export type BreakEndedEvent = {
  id: string;
  type: "BREAK_ENDED";
};

export type PlayingConditionsChangedEvent = {
  id: string;
  type: "PLAYING_CONDITIONS_CHANGED";
  scheduledLegalBalls: number;
};

export type TargetRevisedEvent = {
  id: string;
  type: "TARGET_REVISED";
  target: number;
};

export type WicketkeeperChangedEvent = {
  id: string;
  type: "WICKETKEEPER_CHANGED";
  wicketkeeperId: ParticipantId;
};

export type ScorerHandoverEvent = {
  id: string;
  type: "SCORER_HANDOVER";
  scorerId: string;
};

export type CricketActionEvent =
  | DeliveryEvent
  | OverEndedEvent
  | BatterRetiredEvent
  | BatterReturnedEvent
  | PenaltyRunsEvent
  | InningsEndedEvent
  | BreakStartedEvent
  | BreakEndedEvent
  | PlayingConditionsChangedEvent
  | TargetRevisedEvent
  | WicketkeeperChangedEvent
  | ScorerHandoverEvent;

export type EventVoidedEvent = {
  id: string;
  type: "EVENT_VOIDED";
  targetEventId: string;
};

export type EventReplacedEvent = {
  id: string;
  type: "EVENT_REPLACED";
  targetEventId: string;
  replacement: CricketActionEvent;
};

export type CricketEvent =
  | CricketActionEvent
  | EventVoidedEvent
  | EventReplacedEvent;

export type EffectivePlayingConditions = {
  target: number | null;
  scheduledLegalBalls: number | null;
};

export type BreakState = {
  active: boolean;
  reason: BreakReason | null;
  note: string | null;
};

export type InningsCompletionState = {
  completed: boolean;
  reason: InningsEndedReason | null;
};

export type BatterState = {
  participantId: ParticipantId;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissed: boolean;
  retired: boolean;
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

export type InningsPlayingConditions = {
  target?: number;
  scheduledLegalBalls?: number;
};

export type ChaseState = {
  target: number;
  runsRequired: number;
  ballsRemaining: number | null;
  targetReached: boolean;
  scoresLevel: boolean;
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
  previousOverBowlerId: ParticipantId | null;
  extras: ExtrasState;
  batters: Record<ParticipantId, BatterState>;
  bowlers: Record<ParticipantId, BowlerState>;
  fielders: Record<ParticipantId, FielderState>;
  chase: ChaseState | null;
  oppositionPenaltyRuns: number;
  completion: InningsCompletionState;
  break: BreakState;
  playingConditions: EffectivePlayingConditions;
  currentWicketkeeperId: ParticipantId | null;
  currentScorerId: string | null;
};

export function formatOvers(
  completedOvers: number,
  legalBallsInCurrentOver: number,
): string {
  return `${completedOvers}.${legalBallsInCurrentOver}`;
}