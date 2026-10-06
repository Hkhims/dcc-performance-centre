import { describe, expect, it } from "vitest";

import type {
  CricketEvent,
  DeliveryEvent,
  InningsState,
} from "@/lib/cricket-engine/types";

import {
  buildCanonicalDccPlayerPerformances,
  buildCanonicalMatchTeamEntry,
  deriveCanonicalInningsScore,
  deriveCanonicalOvers,
  deriveTeamResult,
  legalBallsToOvers,
  type CanonicalPublicationInnings,
  type CanonicalPublicationParticipant,
  type CanonicalPublicationSide,
  type ExistingCanonicalMatchTeamEntry,
} from "./canonical-publication";

function inningsState(
  runs: number,
  wickets: number,
  legalBalls: number,
): InningsState {
  return {
    runs,
    wickets,
    legalBalls,
    batters: {},
    bowlers: {},
    fielders: {},
  } as unknown as InningsState;
}

function publicationInnings(
  input: {
    inningsId: string;
    inningsNumber: 1 | 2;
    battingSideId: string;
    bowlingSideId: string;
    originalScheduledBalls: number | null;
    finalScheduledBalls: number | null;
    runs: number;
    wickets: number;
    legalBalls: number;
    openingStrikerParticipantId?: string;
    openingNonStrikerParticipantId?: string;
    events?: CricketEvent[];
    state?: InningsState;
  },
): CanonicalPublicationInnings {
  return {
    inningsId: input.inningsId,
    inningsNumber: input.inningsNumber,
    battingSideId: input.battingSideId,
    bowlingSideId: input.bowlingSideId,
    originalScheduledBalls:
      input.originalScheduledBalls,
    finalScheduledBalls:
      input.finalScheduledBalls,
    openingStrikerParticipantId:
      input.openingStrikerParticipantId ??
      `${input.battingSideId}-batter-1`,
    openingNonStrikerParticipantId:
      input.openingNonStrikerParticipantId ??
      `${input.battingSideId}-batter-2`,
    events: input.events ?? [],
    state:
      input.state ??
      inningsState(
        input.runs,
        input.wickets,
        input.legalBalls,
      ),
  };
}

function delivery(
  input: {
    id: string;
    strikerId?: string;
    nonStrikerId?: string;
    bowlerId?: string;
    batRuns?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    extras?: DeliveryEvent["extras"];
    wicket?: DeliveryEvent["wicket"];
  },
): DeliveryEvent {
  return {
    id: input.id,
    type: "DELIVERY",
    strikerId:
      input.strikerId ?? "opponent-batter-1",
    nonStrikerId:
      input.nonStrikerId ??
      "opponent-batter-2",
    bowlerId: input.bowlerId ?? "dcc-bowler",
    batRuns: input.batRuns ?? 0,
    extras: input.extras,
    wicket: input.wicket,
  };
}

const dccSide: CanonicalPublicationSide = {
  sideId: "dcc-side",
  sideType: "DCC_TEAM",
  canonicalTeamId: "T01",
  displayName: "DCC 1",
};

const opponentSide: CanonicalPublicationSide = {
  sideId: "opponent-side",
  sideType: "EXTERNAL",
  canonicalTeamId: null,
  displayName: "BISC 1",
};

const existingEntry: ExistingCanonicalMatchTeamEntry = {
  sourceMatchId: "dcc-app-match-001",
  matchId: "match-001",
  teamId: "T01",
  competitionId: "C-FRIENDLY-2026",
  opponentId: null,
  opponentDisplayName: "BISC 1",
  scheduledOvers: 30,
};

describe("canonical App Scorer publication", () => {
  describe("legalBallsToOvers", () => {
    it("converts whole legal-ball limits to overs", () => {
      expect(legalBallsToOvers(120)).toBe(20);
      expect(legalBallsToOvers(150)).toBe(25);
      expect(legalBallsToOvers(180)).toBe(30);
    });

    it("preserves a null limit", () => {
      expect(legalBallsToOvers(null)).toBeNull();
    });

    it("rejects partial-over playing-condition limits", () => {
      expect(() => legalBallsToOvers(121)).toThrow(
        "Scheduled playing conditions must contain whole overs.",
      );
    });
  });

  describe("deriveCanonicalOvers", () => {
    it("keeps the original scheduled overs when unchanged", () => {
      expect(
        deriveCanonicalOvers(120, 120),
      ).toEqual({
        scheduledOvers: 20,
        revisedOvers: null,
      });
    });

    it("publishes an increased playing-condition limit as revised overs", () => {
      expect(
        deriveCanonicalOvers(120, 150),
      ).toEqual({
        scheduledOvers: 20,
        revisedOvers: 25,
      });
    });

    it("publishes a reduced playing-condition limit as revised overs", () => {
      expect(
        deriveCanonicalOvers(180, 150),
      ).toEqual({
        scheduledOvers: 30,
        revisedOvers: 25,
      });
    });
  });

  describe("deriveCanonicalInningsScore", () => {
    it("publishes the authoritative replay-derived innings totals", () => {
      const state = inningsState(
        151,
        9,
        143,
      );

      expect(
        deriveCanonicalInningsScore(state),
      ).toEqual({
        score: 151,
        wickets: 9,
        balls: 143,
      });
    });
  });

  describe("deriveTeamResult", () => {
    it("derives both perspectives of a runs win", () => {
      const result = {
        resultType: "WIN" as const,
        winnerSideId: "side-a",
        loserSideId: "side-b",
        winMethod: "RUNS" as const,
        runMargin: 38,
        wicketMargin: null,
        abandonmentReason: null,
      };

      expect(
        deriveTeamResult(
          result,
          "side-a",
        ),
      ).toEqual({
        result: "Won",
        matchNotes: "Won by 38 runs",
      });

      expect(
        deriveTeamResult(
          result,
          "side-b",
        ),
      ).toEqual({
        result: "Lost",
        matchNotes: "Lost by 38 runs",
      });
    });

    it("derives both perspectives of a chase win", () => {
      const result = {
        resultType: "WIN" as const,
        winnerSideId: "dcc-4",
        loserSideId: "dcc-3",
        winMethod: "CHASE" as const,
        runMargin: null,
        wicketMargin: 1,
        abandonmentReason: null,
      };

      expect(
        deriveTeamResult(
          result,
          "dcc-3",
        ),
      ).toEqual({
        result: "Lost",
        matchNotes: "Lost by 1 wicket",
      });

      expect(
        deriveTeamResult(
          result,
          "dcc-4",
        ),
      ).toEqual({
        result: "Won",
        matchNotes: "Won by 1 wicket",
      });
    });

    it("uses singular run wording for a one-run result", () => {
      const result = {
        resultType: "WIN" as const,
        winnerSideId: "side-a",
        loserSideId: "side-b",
        winMethod: "RUNS" as const,
        runMargin: 1,
        wicketMargin: null,
        abandonmentReason: null,
      };

      expect(
        deriveTeamResult(
          result,
          "side-a",
        ),
      ).toEqual({
        result: "Won",
        matchNotes: "Won by 1 run",
      });
    });

    it("publishes the canonical tied result", () => {
      expect(
        deriveTeamResult(
          {
            resultType: "TIE",
            winnerSideId: null,
            loserSideId: null,
            winMethod: null,
            runMargin: null,
            wicketMargin: null,
            abandonmentReason: null,
          },
          "side-a",
        ),
      ).toEqual({
        result: "Tied",
        matchNotes: "Match tied",
      });
    });

    it("publishes the canonical abandoned result with its reason", () => {
      expect(
        deriveTeamResult(
          {
            resultType: "ABANDONED",
            winnerSideId: null,
            loserSideId: null,
            winMethod: null,
            runMargin: null,
            wicketMargin: null,
            abandonmentReason:
              "Persistent rain",
          },
          "side-a",
        ),
      ).toEqual({
        result: "Abandoned",
        matchNotes:
          "Match abandoned: Persistent rain",
      });
    });

    it("publishes an abandoned result without requiring a reason", () => {
      expect(
        deriveTeamResult(
          {
            resultType: "ABANDONED",
            winnerSideId: null,
            loserSideId: null,
            winMethod: null,
            runMargin: null,
            wicketMargin: null,
            abandonmentReason: null,
          },
          "side-a",
        ),
      ).toEqual({
        result: "Abandoned",
        matchNotes: "Match abandoned",
      });
    });

    it("rejects a side that is not part of a win result", () => {
      expect(() =>
        deriveTeamResult(
          {
            resultType: "WIN",
            winnerSideId: "side-a",
            loserSideId: "side-b",
            winMethod: "RUNS",
            runMargin: 20,
            wicketMargin: null,
            abandonmentReason: null,
          },
          "side-c",
        ),
      ).toThrow(
        "The team side is not part of the completed match result.",
      );
    });

    it("rejects an invalid runs margin", () => {
      expect(() =>
        deriveTeamResult(
          {
            resultType: "WIN",
            winnerSideId: "side-a",
            loserSideId: "side-b",
            winMethod: "RUNS",
            runMargin: 0,
            wicketMargin: null,
            abandonmentReason: null,
          },
          "side-a",
        ),
      ).toThrow(
        "A runs win requires a positive run margin.",
      );
    });

    it("rejects an invalid chase margin", () => {
      expect(() =>
        deriveTeamResult(
          {
            resultType: "WIN",
            winnerSideId: "side-a",
            loserSideId: "side-b",
            winMethod: "CHASE",
            runMargin: null,
            wicketMargin: null,
            abandonmentReason: null,
          },
          "side-a",
        ),
      ).toThrow(
        "A chase win requires a positive wicket margin.",
      );
    });
  });

  describe("buildCanonicalMatchTeamEntry", () => {
    it("publishes an unchanged 30-over match while preserving canonical fixture metadata", () => {
      const innings:
        CanonicalPublicationInnings[] = [
          publicationInnings({
            inningsId: "innings-1",
            inningsNumber: 1,
            battingSideId:
              dccSide.sideId,
            bowlingSideId:
              opponentSide.sideId,
            originalScheduledBalls: 180,
            finalScheduledBalls: 180,
            runs: 180,
            wickets: 7,
            legalBalls: 180,
          }),
          publicationInnings({
            inningsId: "innings-2",
            inningsNumber: 2,
            battingSideId:
              opponentSide.sideId,
            bowlingSideId:
              dccSide.sideId,
            originalScheduledBalls: 180,
            finalScheduledBalls: 180,
            runs: 150,
            wickets: 10,
            legalBalls: 172,
          }),
        ];

      expect(
        buildCanonicalMatchTeamEntry({
          existingEntry,
          dccSide,
          opponentSide,
          innings,
          result: {
            resultType: "WIN",
            winnerSideId:
              dccSide.sideId,
            loserSideId:
              opponentSide.sideId,
            winMethod: "RUNS",
            runMargin: 30,
            wicketMargin: null,
            abandonmentReason: null,
          },
        }),
      ).toEqual({
        sourceMatchId:
          "dcc-app-match-001",
        matchId: "match-001",
        teamId: "T01",
        competitionId:
          "C-FRIENDLY-2026",
        opponentId: null,
        opponentDisplayName: "BISC 1",

        result: "Won",

        scheduledOvers: 30,
        revisedOvers: null,

        dccScore: 180,
        dccWickets: 7,
        dccBalls: 180,

        opponentScore: 150,
        opponentWickets: 10,
        opponentBalls: 172,

        matchNotes: "Won by 30 runs",
      });
    });

    it("publishes a 30-over fixture revised to 25 overs without rewriting the scheduled limit", () => {
      const innings:
        CanonicalPublicationInnings[] = [
          publicationInnings({
            inningsId: "innings-1",
            inningsNumber: 1,
            battingSideId:
              dccSide.sideId,
            bowlingSideId:
              opponentSide.sideId,
            originalScheduledBalls: 180,
            finalScheduledBalls: 150,
            runs: 160,
            wickets: 8,
            legalBalls: 150,
          }),
          publicationInnings({
            inningsId: "innings-2",
            inningsNumber: 2,
            battingSideId:
              opponentSide.sideId,
            bowlingSideId:
              dccSide.sideId,
            originalScheduledBalls: 180,
            finalScheduledBalls: 150,
            runs: 140,
            wickets: 9,
            legalBalls: 150,
          }),
        ];

      const published =
        buildCanonicalMatchTeamEntry({
          existingEntry,
          dccSide,
          opponentSide,
          innings,
          result: {
            resultType: "WIN",
            winnerSideId:
              dccSide.sideId,
            loserSideId:
              opponentSide.sideId,
            winMethod: "RUNS",
            runMargin: 20,
            wicketMargin: null,
            abandonmentReason: null,
          },
        });

      expect(
        published.scheduledOvers,
      ).toBe(30);

      expect(
        published.revisedOvers,
      ).toBe(25);

      expect(published.dccScore).toBe(
        160,
      );

      expect(
        published.dccWickets,
      ).toBe(8);

      expect(published.dccBalls).toBe(
        150,
      );

      expect(
        published.opponentScore,
      ).toBe(140);

      expect(
        published.opponentWickets,
      ).toBe(9);

      expect(
        published.opponentBalls,
      ).toBe(150);
    });

    it("uses the scorer original limit when the canonical fixture has no scheduled overs", () => {
  const entryWithoutScheduledOvers:
    ExistingCanonicalMatchTeamEntry = {
      ...existingEntry,
      scheduledOvers: null,
    };

  const innings:
    CanonicalPublicationInnings[] = [
      publicationInnings({
        inningsId: "innings-1",
        inningsNumber: 1,
        battingSideId:
          dccSide.sideId,
        bowlingSideId:
          opponentSide.sideId,
        originalScheduledBalls: 180,
        finalScheduledBalls: 150,
        runs: 160,
        wickets: 8,
        legalBalls: 150,
      }),
      publicationInnings({
        inningsId: "innings-2",
        inningsNumber: 2,
        battingSideId:
          opponentSide.sideId,
        bowlingSideId:
          dccSide.sideId,
        originalScheduledBalls: 180,
        finalScheduledBalls: 150,
        runs: 140,
        wickets: 9,
        legalBalls: 150,
      }),
    ];

  const published =
    buildCanonicalMatchTeamEntry({
      existingEntry:
        entryWithoutScheduledOvers,
      dccSide,
      opponentSide,
      innings,
      result: {
        resultType: "WIN",
        winnerSideId:
          dccSide.sideId,
        loserSideId:
          opponentSide.sideId,
        winMethod: "RUNS",
        runMargin: 20,
        wicketMargin: null,
        abandonmentReason: null,
      },
    });

  expect(published.scheduledOvers).toBe(
    30,
  );

  expect(published.revisedOvers).toBe(
    25,
  );
});

    it("maps DCC and opponent scores by batting side when DCC bats second", () => {
      const innings:
        CanonicalPublicationInnings[] = [
          publicationInnings({
            inningsId: "innings-1",
            inningsNumber: 1,
            battingSideId:
              opponentSide.sideId,
            bowlingSideId:
              dccSide.sideId,
            originalScheduledBalls: 180,
            finalScheduledBalls: 180,
            runs: 149,
            wickets: 8,
            legalBalls: 180,
          }),
          publicationInnings({
            inningsId: "innings-2",
            inningsNumber: 2,
            battingSideId:
              dccSide.sideId,
            bowlingSideId:
              opponentSide.sideId,
            originalScheduledBalls: 180,
            finalScheduledBalls: 180,
            runs: 150,
            wickets: 4,
            legalBalls: 137,
          }),
        ];

      const published =
        buildCanonicalMatchTeamEntry({
          existingEntry,
          dccSide,
          opponentSide,
          innings,
          result: {
            resultType: "WIN",
            winnerSideId:
              dccSide.sideId,
            loserSideId:
              opponentSide.sideId,
            winMethod: "CHASE",
            runMargin: null,
            wicketMargin: 6,
            abandonmentReason: null,
          },
        });

      expect(published.dccScore).toBe(
        150,
      );

      expect(
        published.dccWickets,
      ).toBe(4);

      expect(published.dccBalls).toBe(
        137,
      );

      expect(
        published.opponentScore,
      ).toBe(149);

      expect(
        published.opponentWickets,
      ).toBe(8);

      expect(
        published.opponentBalls,
      ).toBe(180);

      expect(published.result).toBe(
        "Won",
      );

      expect(
        published.matchNotes,
      ).toBe("Won by 6 wickets");
    });

    it("preserves existing competition and opponent identity", () => {
      const entryWithCanonicalOpponent:
        ExistingCanonicalMatchTeamEntry = {
          ...existingEntry,
          competitionId: "C99",
          opponentId: "O99",
          opponentDisplayName:
            "Canonical Opposition XI",
        };

      const innings:
        CanonicalPublicationInnings[] = [
          publicationInnings({
            inningsId: "innings-1",
            inningsNumber: 1,
            battingSideId:
              dccSide.sideId,
            bowlingSideId:
              opponentSide.sideId,
            originalScheduledBalls: 180,
            finalScheduledBalls: 180,
            runs: 175,
            wickets: 6,
            legalBalls: 180,
          }),
          publicationInnings({
            inningsId: "innings-2",
            inningsNumber: 2,
            battingSideId:
              opponentSide.sideId,
            bowlingSideId:
              dccSide.sideId,
            originalScheduledBalls: 180,
            finalScheduledBalls: 180,
            runs: 150,
            wickets: 10,
            legalBalls: 170,
          }),
        ];

      const published =
        buildCanonicalMatchTeamEntry({
          existingEntry:
            entryWithCanonicalOpponent,
          dccSide,
          opponentSide,
          innings,
          result: {
            resultType: "WIN",
            winnerSideId:
              dccSide.sideId,
            loserSideId:
              opponentSide.sideId,
            winMethod: "RUNS",
            runMargin: 25,
            wicketMargin: null,
            abandonmentReason: null,
          },
        });

      expect(
        published.sourceMatchId,
      ).toBe("dcc-app-match-001");

      expect(published.matchId).toBe(
        "match-001",
      );

      expect(published.teamId).toBe(
        "T01",
      );

      expect(
        published.competitionId,
      ).toBe("C99");

      expect(published.opponentId).toBe(
        "O99",
      );

      expect(
        published.opponentDisplayName,
      ).toBe(
        "Canonical Opposition XI",
      );
    });

    it("rejects a scorer DCC side that does not match the canonical team entry", () => {
      const wrongDccSide:
        CanonicalPublicationSide = {
          ...dccSide,
          canonicalTeamId: "T02",
        };

      expect(() =>
        buildCanonicalMatchTeamEntry({
          existingEntry,
          dccSide: wrongDccSide,
          opponentSide,
          innings: [],
          result: {
            resultType: "TIE",
            winnerSideId: null,
            loserSideId: null,
            winMethod: null,
            runMargin: null,
            wicketMargin: null,
            abandonmentReason: null,
          },
        }),
      ).toThrow(
        "The scorer DCC side does not match the canonical match team entry.",
      );
    });

    it("publishes an abandonment before play without fabricating innings scores", () => {
  const published =
    buildCanonicalMatchTeamEntry({
      existingEntry,
      dccSide,
      opponentSide,
      innings: [],
      result: {
        resultType: "ABANDONED",
        winnerSideId: null,
        loserSideId: null,
        winMethod: null,
        runMargin: null,
        wicketMargin: null,
        abandonmentReason:
          "Persistent rain",
      },
    });

  expect(published).toMatchObject({
    result: "Abandoned",
    scheduledOvers: 30,
    revisedOvers: null,

    dccScore: null,
    dccWickets: null,
    dccBalls: null,

    opponentScore: null,
    opponentWickets: null,
    opponentBalls: null,

    matchNotes:
      "Match abandoned: Persistent rain",
  });
});

it("publishes only the innings that existed when a match is abandoned during the first innings", () => {
  const innings:
    CanonicalPublicationInnings[] = [
      publicationInnings({
        inningsId: "innings-1",
        inningsNumber: 1,
        battingSideId:
          dccSide.sideId,
        bowlingSideId:
          opponentSide.sideId,
        originalScheduledBalls: 180,
        finalScheduledBalls: 180,
        runs: 73,
        wickets: 3,
        legalBalls: 76,
      }),
    ];

  const published =
    buildCanonicalMatchTeamEntry({
      existingEntry,
      dccSide,
      opponentSide,
      innings,
      result: {
        resultType: "ABANDONED",
        winnerSideId: null,
        loserSideId: null,
        winMethod: null,
        runMargin: null,
        wicketMargin: null,
        abandonmentReason:
          "Persistent rain",
      },
    });

  expect(published).toMatchObject({
    result: "Abandoned",

    dccScore: 73,
    dccWickets: 3,
    dccBalls: 76,

    opponentScore: null,
    opponentWickets: null,
    opponentBalls: null,

    matchNotes:
      "Match abandoned: Persistent rain",
  });
});

it("publishes both actual scores when a match is abandoned during the second innings", () => {
  const innings:
    CanonicalPublicationInnings[] = [
      publicationInnings({
        inningsId: "innings-1",
        inningsNumber: 1,
        battingSideId:
          dccSide.sideId,
        bowlingSideId:
          opponentSide.sideId,
        originalScheduledBalls: 180,
        finalScheduledBalls: 180,
        runs: 164,
        wickets: 8,
        legalBalls: 180,
      }),
      publicationInnings({
        inningsId: "innings-2",
        inningsNumber: 2,
        battingSideId:
          opponentSide.sideId,
        bowlingSideId:
          dccSide.sideId,
        originalScheduledBalls: 180,
        finalScheduledBalls: 180,
        runs: 82,
        wickets: 4,
        legalBalls: 91,
      }),
    ];

  const published =
    buildCanonicalMatchTeamEntry({
      existingEntry,
      dccSide,
      opponentSide,
      innings,
      result: {
        resultType: "ABANDONED",
        winnerSideId: null,
        loserSideId: null,
        winMethod: null,
        runMargin: null,
        wicketMargin: null,
        abandonmentReason:
          "Bad light",
      },
    });

  expect(published).toMatchObject({
    result: "Abandoned",

    dccScore: 164,
    dccWickets: 8,
    dccBalls: 180,

    opponentScore: 82,
    opponentWickets: 4,
    opponentBalls: 91,

    matchNotes:
      "Match abandoned: Bad light",
  });
});

    it("rejects publication when both completed innings are not available", () => {
      const innings:
        CanonicalPublicationInnings[] = [
          publicationInnings({
            inningsId: "innings-1",
            inningsNumber: 1,
            battingSideId:
              dccSide.sideId,
            bowlingSideId:
              opponentSide.sideId,
            originalScheduledBalls: 180,
            finalScheduledBalls: 180,
            runs: 170,
            wickets: 7,
            legalBalls: 180,
          }),
        ];

      expect(() =>
        buildCanonicalMatchTeamEntry({
          existingEntry,
          dccSide,
          opponentSide,
          innings,
          result: {
            resultType: "WIN",
            winnerSideId:
              dccSide.sideId,
            loserSideId:
              opponentSide.sideId,
            winMethod: "RUNS",
            runMargin: 20,
            wicketMargin: null,
            abandonmentReason: null,
          },
        }),
      ).toThrow(
        "Both completed innings are required for canonical publication.",
      );
    });
  });

  describe("buildCanonicalDccPlayerPerformances", () => {
    const participants:
      CanonicalPublicationParticipant[] = [
        {
          matchParticipantId:
            "dcc-batter-1",
          sideId: dccSide.sideId,
          participantType: "DCC",
          dccPlayerId: "P01",
          displayName: "DCC Batter One",
        },
        {
          matchParticipantId:
            "dcc-batter-2",
          sideId: dccSide.sideId,
          participantType: "DCC",
          dccPlayerId: "P02",
          displayName: "DCC Batter Two",
        },
        {
          matchParticipantId:
            "dcc-batter-3",
          sideId: dccSide.sideId,
          participantType: "DCC",
          dccPlayerId: "P03",
          displayName: "DCC Batter Three",
        },
        {
          matchParticipantId:
            "dcc-bowler",
          sideId: dccSide.sideId,
          participantType: "DCC",
          dccPlayerId: "P04",
          displayName: "DCC Bowler",
        },
        {
          matchParticipantId:
            "dcc-keeper",
          sideId: dccSide.sideId,
          participantType: "DCC",
          dccPlayerId: "P05",
          displayName: "DCC Keeper",
        },
        {
          matchParticipantId:
            "dcc-fielder",
          sideId: dccSide.sideId,
          participantType: "DCC",
          dccPlayerId: "P06",
          displayName: "DCC Fielder",
        },
        {
          matchParticipantId:
            "guest-player",
          sideId: dccSide.sideId,
          participantType: "GUEST",
          dccPlayerId: null,
          displayName: "Guest Player",
        },
        {
          matchParticipantId:
            "external-player",
          sideId: opponentSide.sideId,
          participantType: "EXTERNAL",
          dccPlayerId: null,
          displayName: "External Player",
        },
      ];

    function buildPlayerTestInnings(
      input?: {
        battingEvents?: CricketEvent[];
        bowlingEvents?: CricketEvent[];
        battingState?: InningsState;
        bowlingState?: InningsState;
      },
    ): CanonicalPublicationInnings[] {
      return [
        publicationInnings({
          inningsId: "dcc-innings",
          inningsNumber: 1,
          battingSideId: dccSide.sideId,
          bowlingSideId:
            opponentSide.sideId,
          originalScheduledBalls: 180,
          finalScheduledBalls: 180,
          runs:
            input?.battingState?.runs ??
            0,
          wickets:
            input?.battingState?.wickets ??
            0,
          legalBalls:
            input?.battingState
              ?.legalBalls ?? 0,
          openingStrikerParticipantId:
            "dcc-batter-1",
          openingNonStrikerParticipantId:
            "dcc-batter-2",
          events:
            input?.battingEvents ?? [],
          state:
            input?.battingState ??
            inningsState(0, 0, 0),
        }),
        publicationInnings({
          inningsId:
            "opponent-innings",
          inningsNumber: 2,
          battingSideId:
            opponentSide.sideId,
          bowlingSideId:
            dccSide.sideId,
          originalScheduledBalls: 180,
          finalScheduledBalls: 180,
          runs:
            input?.bowlingState?.runs ??
            0,
          wickets:
            input?.bowlingState
              ?.wickets ?? 0,
          legalBalls:
            input?.bowlingState
              ?.legalBalls ?? 0,
          openingStrikerParticipantId:
            "opponent-batter-1",
          openingNonStrikerParticipantId:
            "opponent-batter-2",
          events:
            input?.bowlingEvents ?? [],
          state:
            input?.bowlingState ??
            inningsState(0, 0, 0),
        }),
      ];
    }

    function publishPlayers(
      innings:
        CanonicalPublicationInnings[],
      playerList = participants,
    ) {
      return buildCanonicalDccPlayerPerformances(
        {
          sourceMatchId:
            "dcc-app-match-001",
          teamId: "T01",
          dccSide,
          participants: playerList,
          innings,
        },
      );
    }

    it("publishes opening batting positions and later batter entry order", () => {
      const battingState =
        inningsState(35, 1, 30);

      battingState.batters = {
        "dcc-batter-1": {
          participantId:
            "dcc-batter-1",
          runs: 20,
          balls: 15,
          fours: 3,
          sixes: 0,
          dismissed: true,
          retired: false,
        },
        "dcc-batter-2": {
          participantId:
            "dcc-batter-2",
          runs: 10,
          balls: 10,
          fours: 1,
          sixes: 0,
          dismissed: false,
          retired: false,
        },
        "dcc-batter-3": {
          participantId:
            "dcc-batter-3",
          runs: 5,
          balls: 5,
          fours: 0,
          sixes: 0,
          dismissed: false,
          retired: false,
        },
      };

      const battingEvents:
        CricketEvent[] = [
          {
            id: "wicket-1",
            type: "DELIVERY",
            strikerId:
              "dcc-batter-1",
            nonStrikerId:
              "dcc-batter-2",
            bowlerId:
              "opponent-bowler",
            batRuns: 0,
            wicket: {
              type: "BOWLED",
              dismissedBatterId:
                "dcc-batter-1",
            },
          },
          {
            id: "enter-3",
            type: "BATTER_ENTERED",
            batterId:
              "dcc-batter-3",
            end: "STRIKER",
          },
        ];

      const published =
        publishPlayers(
          buildPlayerTestInnings({
            battingEvents,
            battingState,
          }),
        );

      const batterOne =
        published.find(
          (player) =>
            player.playerId === "P01",
        );

      const batterTwo =
        published.find(
          (player) =>
            player.playerId === "P02",
        );

      const batterThree =
        published.find(
          (player) =>
            player.playerId === "P03",
        );

      expect(batterOne).toMatchObject({
        batted: true,
        battingPosition: 1,
        runs: 20,
        ballsFaced: 15,
        fours: 3,
        sixes: 0,
        dismissalType: "Bowled",
        isNotOut: false,
      });

      expect(batterTwo).toMatchObject({
        batted: true,
        battingPosition: 2,
        runs: 10,
        ballsFaced: 10,
        fours: 1,
        sixes: 0,
        dismissalType: null,
        isNotOut: true,
      });

      expect(batterThree).toMatchObject({
        batted: true,
        battingPosition: 3,
        runs: 5,
        ballsFaced: 5,
        dismissalType: null,
        isNotOut: true,
      });
    });

    it("does not assign a second batting position when a retired batter returns", () => {
      const battingState =
        inningsState(20, 0, 18);

      battingState.batters = {
        "dcc-batter-1": {
          participantId:
            "dcc-batter-1",
          runs: 10,
          balls: 9,
          fours: 1,
          sixes: 0,
          dismissed: false,
          retired: false,
        },
        "dcc-batter-2": {
          participantId:
            "dcc-batter-2",
          runs: 5,
          balls: 5,
          fours: 0,
          sixes: 0,
          dismissed: false,
          retired: false,
        },
        "dcc-batter-3": {
          participantId:
            "dcc-batter-3",
          runs: 5,
          balls: 4,
          fours: 0,
          sixes: 0,
          dismissed: false,
          retired: false,
        },
      };

      const events:
        CricketEvent[] = [
          {
            id: "retire-1",
            type: "BATTER_RETIRED",
            batterId:
              "dcc-batter-1",
          },
          {
            id: "enter-3",
            type: "BATTER_ENTERED",
            batterId:
              "dcc-batter-3",
            end: "STRIKER",
          },
          {
            id: "return-1",
            type: "BATTER_RETURNED",
            batterId:
              "dcc-batter-1",
            end: "STRIKER",
          },
        ];

      const published =
        publishPlayers(
          buildPlayerTestInnings({
            battingEvents: events,
            battingState,
          }),
        );

      expect(
        published.find(
          (player) =>
            player.playerId === "P01",
        )?.battingPosition,
      ).toBe(1);

      expect(
        published.find(
          (player) =>
            player.playerId === "P02",
        )?.battingPosition,
      ).toBe(2);

      expect(
        published.find(
          (player) =>
            player.playerId === "P03",
        )?.battingPosition,
      ).toBe(3);
    });

    it("publishes bowler totals, wides, no-balls and a completed maiden", () => {
      const bowlingState =
        inningsState(8, 0, 8);

      bowlingState.bowlers = {
        "dcc-bowler": {
          participantId:
            "dcc-bowler",
          legalBalls: 8,
          runsConceded: 5,
          wickets: 0,
        },
      };

      const bowlingEvents:
        CricketEvent[] = [
          delivery({ id: "ball-1" }),
          delivery({ id: "ball-2" }),
          delivery({ id: "ball-3" }),
          delivery({ id: "ball-4" }),
          delivery({ id: "ball-5" }),
          delivery({ id: "ball-6" }),
          {
            id: "over-1",
            type: "OVER_ENDED",
          },
          delivery({
            id: "wide-1",
            extras: {
              wides: 2,
            },
          }),
          delivery({
            id: "no-ball-1",
            extras: {
              noBalls: 1,
            },
          }),
          delivery({
            id: "runs-1",
            batRuns: 2,
          }),
          delivery({
            id: "bye-1",
            extras: {
              byes: 2,
            },
          }),
          delivery({
            id: "leg-bye-1",
            extras: {
              legByes: 1,
            },
          }),
        ];

      const published =
        publishPlayers(
          buildPlayerTestInnings({
            bowlingEvents,
            bowlingState,
          }),
        );

      const bowler =
        published.find(
          (player) =>
            player.playerId === "P04",
        );

      expect(bowler).toMatchObject({
        bowled: true,
        bowlingBalls: 8,
        maidens: 1,
        runsConceded: 5,
        wickets: 0,
        wides: 2,
        noBalls: 1,
      });
    });

    it("does not count an unfinished zero-run over as a maiden", () => {
      const bowlingState =
        inningsState(0, 0, 5);

      bowlingState.bowlers = {
        "dcc-bowler": {
          participantId:
            "dcc-bowler",
          legalBalls: 5,
          runsConceded: 0,
          wickets: 0,
        },
      };

      const bowlingEvents:
        CricketEvent[] = [
          delivery({ id: "ball-1" }),
          delivery({ id: "ball-2" }),
          delivery({ id: "ball-3" }),
          delivery({ id: "ball-4" }),
          delivery({ id: "ball-5" }),
        ];

      const published =
        publishPlayers(
          buildPlayerTestInnings({
            bowlingEvents,
            bowlingState,
          }),
        );

      expect(
        published.find(
          (player) =>
            player.playerId === "P04",
        )?.maidens,
      ).toBe(0);
    });

    it("publishes the complete bowler wicket-type breakdown without crediting run-outs", () => {
      const bowlingState =
        inningsState(10, 7, 42);

      bowlingState.bowlers = {
        "dcc-bowler": {
          participantId:
            "dcc-bowler",
          legalBalls: 42,
          runsConceded: 10,
          wickets: 6,
        },
      };

      const bowlingEvents:
        CricketEvent[] = [
          delivery({
            id: "bowled",
            wicket: {
              type: "BOWLED",
              dismissedBatterId:
                "opponent-batter-1",
            },
          }),
          delivery({
            id: "caught",
            wicket: {
              type: "CAUGHT",
              dismissedBatterId:
                "opponent-batter-2",
              fielderId:
                "dcc-fielder",
            },
          }),
          delivery({
            id: "lbw",
            wicket: {
              type: "LBW",
              dismissedBatterId:
                "opponent-batter-3",
            },
          }),
          delivery({
            id: "stumped",
            wicket: {
              type: "STUMPED",
              dismissedBatterId:
                "opponent-batter-4",
              fielderId:
                "dcc-keeper",
            },
          }),
          delivery({
            id: "caught-and-bowled",
            wicket: {
              type:
                "CAUGHT_AND_BOWLED",
              dismissedBatterId:
                "opponent-batter-5",
            },
          }),
          delivery({
            id: "hit-wicket",
            wicket: {
              type: "HIT_WICKET",
              dismissedBatterId:
                "opponent-batter-6",
            },
          }),
          delivery({
            id: "run-out",
            wicket: {
              type: "RUN_OUT",
              dismissedBatterId:
                "opponent-batter-7",
              runOutEnd:
                "STRIKER_END",
              fielderIds: [
                "dcc-fielder",
              ],
            },
          }),
        ];

      const published =
        publishPlayers(
          buildPlayerTestInnings({
            bowlingEvents,
            bowlingState,
          }),
        );

      const bowler =
        published.find(
          (player) =>
            player.playerId === "P04",
        );

      expect(bowler).toMatchObject({
        wickets: 6,
        wicketsBowled: 1,
        wicketsCaught: 1,
        wicketsLbw: 1,
        wicketsStumped: 1,
        wicketsCaughtAndBowled: 1,
        wicketsHitWicket: 1,
      });
    });

    it("publishes catches, stumpings and run-outs from authoritative replay state including caught-and-bowled catch credit", () => {
      const bowlingState =
        inningsState(20, 4, 24);

      bowlingState.bowlers = {
        "dcc-bowler": {
          participantId:
            "dcc-bowler",
          legalBalls: 24,
          runsConceded: 20,
          wickets: 3,
        },
      };

      bowlingState.fielders = {
        "dcc-bowler": {
          participantId:
            "dcc-bowler",
          catches: 1,
          stumpings: 0,
          runOuts: 0,
        },
        "dcc-keeper": {
          participantId:
            "dcc-keeper",
          catches: 0,
          stumpings: 1,
          runOuts: 0,
        },
        "dcc-fielder": {
          participantId:
            "dcc-fielder",
          catches: 1,
          stumpings: 0,
          runOuts: 1,
        },
      };

      const bowlingEvents:
        CricketEvent[] = [
          delivery({
            id: "caught",
            wicket: {
              type: "CAUGHT",
              dismissedBatterId:
                "opponent-batter-1",
              fielderId:
                "dcc-fielder",
            },
          }),
          delivery({
            id: "stumped",
            wicket: {
              type: "STUMPED",
              dismissedBatterId:
                "opponent-batter-2",
              fielderId:
                "dcc-keeper",
            },
          }),
          delivery({
            id: "caught-and-bowled",
            wicket: {
              type:
                "CAUGHT_AND_BOWLED",
              dismissedBatterId:
                "opponent-batter-3",
            },
          }),
          delivery({
            id: "run-out",
            wicket: {
              type: "RUN_OUT",
              dismissedBatterId:
                "opponent-batter-4",
              runOutEnd:
                "STRIKER_END",
              fielderIds: [
                "dcc-fielder",
                "dcc-fielder",
              ],
            },
          }),
        ];

      const published =
        publishPlayers(
          buildPlayerTestInnings({
            bowlingEvents,
            bowlingState,
          }),
        );

      expect(
        published.find(
          (player) =>
            player.playerId === "P04",
        ),
      ).toMatchObject({
        wickets: 3,
        wicketsCaughtAndBowled: 1,
        catches: 1,
        stumpings: 0,
        runOuts: 0,
      });

      expect(
        published.find(
          (player) =>
            player.playerId === "P05",
        ),
      ).toMatchObject({
        catches: 0,
        stumpings: 1,
        runOuts: 0,
      });

      expect(
        published.find(
          (player) =>
            player.playerId === "P06",
        ),
      ).toMatchObject({
        catches: 1,
        stumpings: 0,
        runOuts: 1,
      });
    });

    it("uses the correction-aware effective event stream for bowler detail statistics", () => {
      const bowlingState =
        inningsState(1, 1, 1);

      bowlingState.bowlers = {
        "dcc-bowler": {
          participantId:
            "dcc-bowler",
          legalBalls: 1,
          runsConceded: 0,
          wickets: 1,
        },
      };

      const originalDelivery =
        delivery({
          id: "original-delivery",
          extras: {
            wides: 3,
          },
        });

      const replacementDelivery =
        delivery({
          id: "replacement-delivery",
          wicket: {
            type: "BOWLED",
            dismissedBatterId:
              "opponent-batter-1",
          },
        });

      const bowlingEvents:
        CricketEvent[] = [
          originalDelivery,
          {
            id: "replace-delivery",
            type: "EVENT_REPLACED",
            targetEventId:
              "original-delivery",
            replacement:
              replacementDelivery,
          },
        ];

      const published =
        publishPlayers(
          buildPlayerTestInnings({
            bowlingEvents,
            bowlingState,
          }),
        );

      const bowler =
        published.find(
          (player) =>
            player.playerId === "P04",
        );

      expect(bowler).toMatchObject({
        bowlingBalls: 1,
        wickets: 1,
        wides: 0,
        noBalls: 0,
        wicketsBowled: 1,
      });
    });

    it("ignores voided deliveries when deriving bowler detail statistics", () => {
      const bowlingState =
        inningsState(0, 0, 0);

      const bowlingEvents:
        CricketEvent[] = [
          delivery({
            id: "void-me",
            extras: {
              wides: 4,
            },
          }),
          {
            id: "void-event",
            type: "EVENT_VOIDED",
            targetEventId: "void-me",
          },
        ];

      const published =
        publishPlayers(
          buildPlayerTestInnings({
            bowlingEvents,
            bowlingState,
          }),
        );

      const bowler =
        published.find(
          (player) =>
            player.playerId === "P04",
        );

      expect(bowler).toMatchObject({
        bowled: false,
        bowlingBalls: null,
        maidens: null,
        runsConceded: null,
        wickets: null,
        wides: null,
        noBalls: null,
      });
    });

    it("excludes guest and external participants from canonical DCC player performances", () => {
      const published =
        publishPlayers(
          buildPlayerTestInnings(),
        );

      expect(
        published.map(
          (player) => player.playerId,
        ),
      ).toEqual([
        "P01",
        "P02",
        "P03",
        "P04",
        "P05",
        "P06",
      ]);

      expect(
        published.some(
          (player) =>
            player.playerId ===
            "guest-player",
        ),
      ).toBe(false);

      expect(
        published.some(
          (player) =>
            player.playerId ===
            "external-player",
        ),
      ).toBe(false);
    });

    it("rejects duplicate canonical DCC players in scorer participants", () => {
      const duplicateParticipants:
        CanonicalPublicationParticipant[] = [
          ...participants,
          {
            matchParticipantId:
              "duplicate-p01",
            sideId: dccSide.sideId,
            participantType: "DCC",
            dccPlayerId: "P01",
            displayName:
              "Duplicate P01",
          },
        ];

      expect(() =>
        publishPlayers(
          buildPlayerTestInnings(),
          duplicateParticipants,
        ),
      ).toThrow(
        "DCC player P01 appears more than once in the scorer participants.",
      );
    });
  });
});