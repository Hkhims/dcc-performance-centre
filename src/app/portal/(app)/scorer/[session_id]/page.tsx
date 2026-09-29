import Link from "next/link";
import { redirect } from "next/navigation";
import { getScorerSnapshot } from "@/lib/app-scorer/scoring-service";
import { createClient } from "@/lib/supabase/server";
import ScorerControls from "./ScorerControls";

type PageProps = {
  params: Promise<{ session_id: string }>;
};

type InningsLookupRow = {
  innings_id: string;
  batting_side_id: string;
  bowling_side_id: string;
};

type ParticipantRow = {
  match_participant_id: string;
  side_id: string;
  display_name: string;
  participant_role: string;
  participation_status: string;
};

function formatOvers(completedOvers: number, legalBallsInCurrentOver: number) {
  return `${completedOvers}.${legalBallsInCurrentOver}`;
}

export default async function ScorerPage({ params }: PageProps) {
  const { session_id: scoringSessionId } = await params;
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/portal/login");
  }

  const { data: accessData, error: accessError } =
    await supabase.rpc("get_my_portal_access");

  if (accessError) {
    throw new Error(`Unable to load Portal access: ${accessError.message}`);
  }

  const access = accessData?.[0] ?? null;
  if (!access || access.account_status !== "Active") {
    redirect("/portal");
  }

  const { data: inningsData, error: inningsError } =
    await supabase
      .from("scoring_innings")
      .select("innings_id,batting_side_id,bowling_side_id")
      .eq("scoring_session_id", scoringSessionId)
      .eq("status", "InProgress")
      .order("innings_number", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (inningsError) {
    throw new Error(`Unable to load active innings: ${inningsError.message}`);
  }

  const innings = inningsData as InningsLookupRow | null;
  if (!innings) {
    throw new Error("This scoring session does not have an innings in progress.");
  }

  const snapshot = await getScorerSnapshot(innings.innings_id);

  const { data: externalSideData, error: externalSideError } =
    await supabase
      .from("match_sides")
      .select("side_id")
      .eq("scoring_session_id", scoringSessionId)
      .eq("side_type", "EXTERNAL")
      .maybeSingle();

  if (externalSideError) {
    throw new Error(
      `Unable to load opposition side: ${externalSideError.message}`,
    );
  }

  const externalSideId =
    typeof externalSideData?.side_id === "string"
      ? externalSideData.side_id
      : null;

  const { data: participantData, error: participantError } =
    await supabase
      .from("match_participants")
      .select(
        "match_participant_id,side_id,display_name,participant_role,participation_status",
      )
      .eq("scoring_session_id", scoringSessionId);

  if (participantError) {
    throw new Error(
      `Unable to load scorer participants: ${participantError.message}`,
    );
  }

  const participants = (participantData ?? []) as ParticipantRow[];
  const playingParticipants = participants.filter(
    (participant) =>
      participant.participant_role === "PLAYING" &&
      participant.participation_status !== "REMOVED",
  );

  const dismissedBatterIds = new Set(
    Object.values(snapshot.state.batters)
      .filter((batter) => batter.dismissed)
      .map((batter) => batter.participantId),
  );

  const battingParticipants = playingParticipants
    .filter(
      (participant) =>
        participant.side_id === innings.batting_side_id &&
        !dismissedBatterIds.has(participant.match_participant_id),
    )
    .map((participant) => ({
      participantId: participant.match_participant_id,
      displayName: participant.display_name,
    }));

  const bowlingParticipants = playingParticipants
    .filter((participant) => participant.side_id === innings.bowling_side_id)
    .map((participant) => ({
      participantId: participant.match_participant_id,
      displayName: participant.display_name,
    }));

  const participantName = (participantId: string | null) => {
    if (!participantId) return "Selection required";

    return (
      participants.find(
        (participant) =>
          participant.match_participant_id === participantId,
      )?.display_name ?? "Unknown player"
    );
  };

  return (
    <main className="min-h-screen bg-[#05070d] px-4 py-8 text-white sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <header className="border-b border-white/10 pb-6">
          <Link
            href="/portal/team-admin"
            className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"
          >
            ← Back to Team Admin
          </Link>

          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
            DCC App Scorer
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Live Scoring
          </h1>
        </header>

        <section className="py-8">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Score
                </p>

                <p className="mt-2 text-6xl font-black tracking-tight sm:text-7xl">
                  {snapshot.runs}/{snapshot.wickets}
                </p>

                <p className="mt-2 text-lg font-semibold text-zinc-400">
                  {formatOvers(
                    snapshot.completedOvers,
                    snapshot.legalBallsInCurrentOver,
                  )}{" "}
                  overs
                </p>
              </div>

              <div className="grid gap-3 text-sm sm:min-w-80">
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                  <span className="text-zinc-500">Striker · </span>
                  <span className="font-semibold text-amber-300">
                    {participantName(snapshot.strikerParticipantId)}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
                  <span className="text-zinc-500">Non-striker · </span>
                  <span className="font-semibold">
                    {participantName(snapshot.nonStrikerParticipantId)}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
                  <span className="text-zinc-500">Bowler · </span>
                  <span className="font-semibold">
                    {participantName(snapshot.bowlerParticipantId)}
                  </span>
                </div>
              </div>
            </div>

            <ScorerControls
              scoringSessionId={scoringSessionId}
              inningsId={snapshot.inningsId}
              strikerParticipantId={snapshot.strikerParticipantId}
              nonStrikerParticipantId={snapshot.nonStrikerParticipantId}
              bowlerParticipantId={snapshot.bowlerParticipantId}
              previousOverBowlerParticipantId={
                snapshot.previousOverBowlerParticipantId
              }
              battingParticipants={battingParticipants}
              bowlingParticipants={bowlingParticipants}
              canAddBattingOppositionPlayer={
                externalSideId === innings.batting_side_id
              }
              canAddBowlingOppositionPlayer={
                externalSideId === innings.bowling_side_id
              }
              overReadyToEnd={snapshot.overReadyToEnd}
              canUndo={snapshot.eventCount > 0}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-600">
            <span>Ledger events: {snapshot.eventCount}</span>
            <span>Next sequence: {snapshot.nextSequenceKey}</span>
            <span>Legal balls: {snapshot.legalBalls}</span>
            {snapshot.overReadyToEnd ? (
              <span className="text-sky-400">Over ready to end</span>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
