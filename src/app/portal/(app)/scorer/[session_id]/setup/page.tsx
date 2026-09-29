import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MatchSetupControls from "./MatchSetupControls";

type PageProps = {
  params: Promise<{ session_id: string }>;
};

type ScoringSessionRow = {
  scoring_session_id: string;
  status: string;
  toss_winner_side_id: string | null;
  toss_decision: string | null;
};

type MatchSideRow = {
  side_id: string;
  side_number: number;
  side_type: string;
  display_name: string;
};

type DccPlayerRow = {
  player_id: string;
  player_name: string;
};

type MatchParticipantRow = {
  match_participant_id: string;
  side_id: string;
  participant_type: string;
  display_name: string;
  participant_role: string;
  participation_status: string;
};

export default async function MatchSetupPage({ params }: PageProps) {
  const { session_id: scoringSessionId } = await params;
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) redirect("/portal/login");

  const { data: accessData, error: accessError } =
    await supabase.rpc("get_my_portal_access");

  if (accessError) {
    throw new Error(`Unable to load Portal access: ${accessError.message}`);
  }

  const access = accessData?.[0] ?? null;
  if (!access || access.account_status !== "Active") redirect("/portal");

  const { data: sessionData, error: sessionError } = await supabase
    .from("scoring_sessions")
    .select("scoring_session_id,status,toss_winner_side_id,toss_decision")
    .eq("scoring_session_id", scoringSessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Unable to load scoring session: ${sessionError.message}`);
  }

  const session = sessionData as ScoringSessionRow | null;
  if (!session) throw new Error("Scoring session not found.");

  if (session.status === "InProgress") {
    redirect(`/portal/scorer/${scoringSessionId}`);
  }

  if (session.status !== "Setup" && session.status !== "Ready") {
    throw new Error(
      `Match setup is not available while the scoring session is ${session.status}.`,
    );
  }

  const [
    { data: sideData, error: sideError },
    { data: participantData, error: participantError },
    { data: dccPlayerData, error: dccPlayerError },
  ] = await Promise.all([
    supabase
      .from("match_sides")
      .select("side_id,side_number,side_type,display_name")
      .eq("scoring_session_id", scoringSessionId)
      .order("side_number"),
    supabase
      .from("match_participants")
      .select(
        "match_participant_id,side_id,participant_type,display_name,participant_role,participation_status",
      )
      .eq("scoring_session_id", scoringSessionId)
      .order("display_name"),
    supabase
      .from("players")
      .select("player_id,player_name")
      .eq("active", true)
      .order("player_name"),
  ]);

  if (sideError) throw new Error(`Unable to load match sides: ${sideError.message}`);
  if (participantError) {
    throw new Error(`Unable to load match participants: ${participantError.message}`);
  }
  if (dccPlayerError) {
    throw new Error(`Unable to load DCC players: ${dccPlayerError.message}`);
  }

  const dccPlayers = (dccPlayerData ?? []) as DccPlayerRow[];
  const sides = (sideData ?? []) as MatchSideRow[];
  const participants = (participantData ?? []) as MatchParticipantRow[];

  if (sides.length !== 2) {
    throw new Error("App Scorer setup requires exactly two match sides.");
  }

  const dccSide = sides.find((side) => side.side_type === "DCC_TEAM");
  const oppositionSide = sides.find((side) => side.side_type === "EXTERNAL");

  if (!dccSide || !oppositionSide) {
    throw new Error(
      "App Scorer setup requires one DCC side and one external opposition side.",
    );
  }

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
            Match Setup
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Confirm the match-day players, add the opposition, record the toss
            and choose the opening batters and bowler.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="rounded-full border border-white/10 px-3 py-1">
              {dccSide.display_name}
            </span>
            <span>vs</span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              {oppositionSide.display_name}
            </span>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1 text-amber-300">
              {session.status}
            </span>
          </div>
        </header>

        <section className="py-8">
          <MatchSetupControls
            scoringSessionId={scoringSessionId}
            sides={sides.map((side) => ({
              sideId: side.side_id,
              displayName: side.display_name,
              sideType: side.side_type,
            }))}
            dccPlayers={dccPlayers.map((player) => ({
              playerId: player.player_id,
              playerName: player.player_name,
            }))}
            participants={participants.map((participant) => ({
              participantId: participant.match_participant_id,
              sideId: participant.side_id,
              displayName: participant.display_name,
              participantType: participant.participant_type,
              participantRole: participant.participant_role,
              participationStatus: participant.participation_status,
            }))}
            tossWinnerSideId={session.toss_winner_side_id}
            tossDecision={session.toss_decision}
          />
        </section>
      </div>
    </main>
  );
}
