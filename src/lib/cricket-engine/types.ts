export type ParticipantId = string;

export type DeliveryEvent = {
  id: string;
  type: "DELIVERY";
  strikerId: ParticipantId;
  nonStrikerId: ParticipantId;
  bowlerId: ParticipantId;
  batRuns: 0 | 1 | 2 | 3 | 4 | 6;
  wicket?: {
    type: "BOWLED";
    dismissedBatterId: ParticipantId;
  };
};

export type OverEndedEvent = {
  id: string;
  type: "OVER_ENDED";
};

export type CricketEvent = DeliveryEvent | OverEndedEvent;

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
  batters: Record<ParticipantId, BatterState>;
  bowlers: Record<ParticipantId, BowlerState>;
};

export function formatOvers(
  completedOvers: number,
  legalBallsInCurrentOver: number,
): string {
  return `${completedOvers}.${legalBallsInCurrentOver}`;
}