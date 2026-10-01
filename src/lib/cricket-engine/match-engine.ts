export type MatchSideId = string;

export type MatchInningsInput = {
  battingSideId: MatchSideId;
  bowlingSideId: MatchSideId;
  runs: number;
  wickets: number;
  completed: boolean;
};

export type MatchAbandonedEvent = {
  id: string;
  type: "MATCH_ABANDONED";
  reason: string;
};

export type MatchEvent = MatchAbandonedEvent;

export type MatchWinResult = {
  type: "WIN";
  winnerSideId: MatchSideId;
  loserSideId: MatchSideId;
  method: "CHASE" | "RUNS";
  runMargin: number | null;
  wicketMargin: number | null;
};

export type MatchTieResult = {
  type: "TIE";
};

export type MatchAbandonedResult = {
  type: "ABANDONED";
  reason: string;
};

export type MatchResult =
  | MatchWinResult
  | MatchTieResult
  | MatchAbandonedResult;

export type MatchState = {
  completed: boolean;
  result: MatchResult | null;
};

function deriveCompletedCricketResult(
  innings: MatchInningsInput[],
): MatchResult | null {
  if (innings.length < 2) {
    return null;
  }

  const firstInnings = innings[0];
  const secondInnings = innings[1];

  const sidesReverseCorrectly =
  firstInnings.battingSideId ===
    secondInnings.bowlingSideId &&
  firstInnings.bowlingSideId ===
    secondInnings.battingSideId &&
  firstInnings.battingSideId !==
    firstInnings.bowlingSideId;

if (!sidesReverseCorrectly) {
  return null;
}

  if (
    !firstInnings.completed ||
    !secondInnings.completed
  ) {
    return null;
  }

  if (secondInnings.runs > firstInnings.runs) {
    return {
      type: "WIN",
      winnerSideId: secondInnings.battingSideId,
      loserSideId: firstInnings.battingSideId,
      method: "CHASE",
      runMargin: null,
      wicketMargin: 10 - secondInnings.wickets,
    };
  }

  if (firstInnings.runs > secondInnings.runs) {
    return {
      type: "WIN",
      winnerSideId: firstInnings.battingSideId,
      loserSideId: secondInnings.battingSideId,
      method: "RUNS",
      runMargin:
        firstInnings.runs - secondInnings.runs,
      wicketMargin: null,
    };
  }

  return {
    type: "TIE",
  };
}

export function deriveMatchState(
  innings: MatchInningsInput[],
  events: MatchEvent[] = [],
): MatchState {
  const cricketResult =
    deriveCompletedCricketResult(innings);

  if (cricketResult) {
    return {
      completed: true,
      result: cricketResult,
    };
  }

  const abandonment = events.find(
    (event) => event.type === "MATCH_ABANDONED",
  );

  if (abandonment) {
    return {
      completed: true,
      result: {
        type: "ABANDONED",
        reason: abandonment.reason,
      },
    };
  }

  return {
    completed: false,
    result: null,
  };
}