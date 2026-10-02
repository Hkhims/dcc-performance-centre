import Link from "next/link";



import { redirect } from "next/navigation";



import { getScorerSnapshot } from "@/lib/app-scorer/scoring-service";



import { deriveMatchState } from "@/lib/cricket-engine/match-engine";



import { createClient } from "@/lib/supabase/server";



import ScorerControls from "./ScorerControls";



import InningsBreakControls from "./InningsBreakControls";



import CompleteMatchControl from "./CompleteMatchControl";



import AbandonMatchControl from "./AbandonMatchControl";

import BreakControl from "./BreakControl";
import StickyScoreBar from "./StickyScoreBar";







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



type AbandonedResultRow = {

  abandonment_reason: string | null;

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







  const { data: sessionData, error: sessionError } = await supabase



  .from("scoring_sessions")



  .select("status,match_id")



  .eq("scoring_session_id", scoringSessionId)



  .maybeSingle();







if (sessionError) {



  throw new Error(



    `Unable to load scoring session: ${sessionError.message}`,



  );



}







if (!sessionData) {



  throw new Error("Scoring session not found.");



}







const sessionStatus = sessionData.status;



if (sessionStatus === "Abandoned") {

  const { data: resultData, error: resultError } = await supabase

    .from("app_scorer_match_results")

    .select("abandonment_reason")

    .eq("scoring_session_id", scoringSessionId)

    .eq("result_type", "ABANDONED")

    .maybeSingle();



  if (resultError) {

    throw new Error(

      `Unable to load abandoned match result: ${resultError.message}`,

    );

  }



  const result = resultData as AbandonedResultRow | null;



  const { data: abandonedInningsData, error: abandonedInningsError } =

  await supabase

    .from("scoring_innings")

    .select("innings_id")

    .eq("scoring_session_id", scoringSessionId)

    .order("innings_number", { ascending: false })

    .limit(1)

    .maybeSingle();



if (abandonedInningsError) {

  throw new Error(

    `Unable to load abandoned innings: ${abandonedInningsError.message}`,

  );

}



const abandonedSnapshot = abandonedInningsData

  ? await getScorerSnapshot(abandonedInningsData.innings_id)

  : null;



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

            Match Abandoned

          </h1>

        </header>



        <section className="py-8">

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">

            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">

              Final Status

            </p>



            <h2 className="mt-3 text-2xl font-bold">

              Match abandoned

            </h2>



            <p className="mt-4 text-zinc-400">

              {result?.abandonment_reason ?? "No reason recorded."}

            </p>

            {abandonedSnapshot ? (

  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">

    <p className="text-sm text-zinc-500">

      Score at abandonment

    </p>



    <p className="mt-2 text-3xl font-black">

      {abandonedSnapshot.runs}/{abandonedSnapshot.wickets}

    </p>



    <p className="mt-1 text-sm font-semibold text-zinc-400">

      {formatOvers(

        abandonedSnapshot.completedOvers,

        abandonedSnapshot.legalBallsInCurrentOver,

      )}{" "}

      overs

    </p>

  </div>

) : null}

            <p className="mt-6 text-sm text-zinc-500">

              All scoring recorded before abandonment has been preserved.

            </p>

          </div>

        </section>

      </div>

    </main>

  );

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



    throw new Error(



      `Unable to load active innings: ${inningsError.message}`,



    );



  }







  const innings = inningsData as InningsLookupRow | null;







  if (!innings) {



    const { data: firstInningsData, error: firstInningsError } =



      await supabase



        .from("scoring_innings")



        .select(



          "innings_id,batting_side_id,bowling_side_id,status",



        )



        .eq("scoring_session_id", scoringSessionId)



        .eq("innings_number", 1)



        .maybeSingle();







    if (firstInningsError) {



      throw new Error(



        `Unable to load first innings: ${firstInningsError.message}`,



      );



    }







    if (



      !firstInningsData ||



      firstInningsData.status !== "Completed"



    ) {



      throw new Error(



        "This scoring session does not have an innings in progress.",



      );



    }







    const { data: secondInningsData, error: secondInningsError } =



      await supabase



        .from("scoring_innings")



        .select("innings_id,batting_side_id,bowling_side_id,status")



        .eq("scoring_session_id", scoringSessionId)



        .eq("innings_number", 2)



        .maybeSingle();







    if (secondInningsData?.status === "Completed") {



  const [firstInningsSnapshot, secondInningsSnapshot] =



    await Promise.all([



      getScorerSnapshot(firstInningsData.innings_id),



      getScorerSnapshot(secondInningsData.innings_id),



    ]);







  const matchState = deriveMatchState([



    {



      battingSideId: firstInningsData.batting_side_id,



      bowlingSideId: firstInningsData.bowling_side_id,



      runs: firstInningsSnapshot.runs,



      wickets: firstInningsSnapshot.wickets,



      completed: true,



    },



    {



      battingSideId: secondInningsData.batting_side_id,



      bowlingSideId: secondInningsData.bowling_side_id,



      runs: secondInningsSnapshot.runs,



      wickets: secondInningsSnapshot.wickets,



      completed: true,



    },



  ]);







  if (!matchState.completed || !matchState.result) {



    throw new Error(



      "The completed innings did not produce a valid match result.",



    );



  }







  const { data: sideData, error: sideError } = await supabase



    .from("match_sides")



    .select("side_id,display_name")



    .eq("scoring_session_id", scoringSessionId);







  if (sideError) {



    throw new Error(



      `Unable to load match sides: ${sideError.message}`,



    );



  }







  const sideName = (sideId: string) =>



    sideData?.find((side) => side.side_id === sideId)



      ?.display_name ?? "Unknown side";







  let resultText: string;







  if (matchState.result.type === "WIN") {



    resultText =



      matchState.result.method === "RUNS"



        ? `${sideName(matchState.result.winnerSideId)} won by ${matchState.result.runMargin} runs`



        : `${sideName(matchState.result.winnerSideId)} won by ${matchState.result.wicketMargin} wickets`;



  } else if (matchState.result.type === "TIE") {



    resultText = "Match tied";



  } else {



    resultText = `Match abandoned: ${matchState.result.reason}`;



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



            {sessionStatus === "FinalReview"



              ? "Final Review"



              : "Match Complete"}



          </h1>



        </header>







        <section className="py-8">



          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">



            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">



              Final Result



            </p>







            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">



              {resultText}



            </h2>







            <div className="mt-8 grid gap-4 sm:grid-cols-2">



              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">



                <p className="text-sm text-zinc-500">1st Innings</p>



                <p className="mt-2 text-lg font-semibold">



                  {sideName(firstInningsData.batting_side_id)}



                </p>



                <p className="mt-1 text-3xl font-black">



                  {firstInningsSnapshot.runs}/



                  {firstInningsSnapshot.wickets}



                </p>



              </div>







              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">



                <p className="text-sm text-zinc-500">2nd Innings</p>



                <p className="mt-2 text-lg font-semibold">



                  {sideName(secondInningsData.batting_side_id)}



                </p>



                <p className="mt-1 text-3xl font-black">



                  {secondInningsSnapshot.runs}/



                  {secondInningsSnapshot.wickets}



                </p>



              </div>



              {sessionStatus === "FinalReview" ? (



  <CompleteMatchControl



    scoringSessionId={scoringSessionId}



    firstInningsId={firstInningsData.innings_id}



    secondInningsId={secondInningsData.innings_id}



  />



) : null}



            </div>



          </div>



        </section>



      </div>



    </main>







  );



}







if (secondInningsData) {



  throw new Error(



    `The second innings is ${secondInningsData.status} but is not currently in progress.`,



  );



}







    if (secondInningsData) {



      throw new Error(



        "The second innings exists but is not currently in progress.",



      );



    }







    const firstInningsSnapshot = await getScorerSnapshot(



      firstInningsData.innings_id,



    );







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







    const participants =



      (participantData ?? []) as ParticipantRow[];







    const playingParticipants = participants.filter(



      (participant) =>



        participant.participant_role === "PLAYING" &&



        participant.participation_status !== "REMOVED",



    );







    const secondInningsBatters = playingParticipants



      .filter(



        (participant) =>



          participant.side_id ===



          firstInningsData.bowling_side_id,



      )



      .map((participant) => ({



        participantId: participant.match_participant_id,



        displayName: participant.display_name,



      }));







    const secondInningsBowlers = playingParticipants



      .filter(



        (participant) =>



          participant.side_id ===



          firstInningsData.batting_side_id,



      )



      .map((participant) => ({



        participantId: participant.match_participant_id,



        displayName: participant.display_name,



      }));







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



              Innings Break



            </h1>



          </header>







          <section className="py-8">



            <InningsBreakControls



              scoringSessionId={scoringSessionId}



              firstInningsId={firstInningsData.innings_id}



              firstInningsRuns={firstInningsSnapshot.runs}



              battingParticipants={secondInningsBatters}



              bowlingParticipants={secondInningsBowlers}



            />



          </section>



        </div>



      </main>



    );



  }







  const snapshot = await getScorerSnapshot(



    innings.innings_id,



  );







  const [matchContextResponse, liveSideResponse] = await Promise.all([
    supabase
      .from("matches")
      .select("fixture_label,match_date,venue_name,stats_category")
      .eq("match_id", sessionData.match_id)
      .maybeSingle(),
    supabase
      .from("match_sides")
      .select("side_id,display_name")
      .eq("scoring_session_id", scoringSessionId),
  ]);

  if (matchContextResponse.error) {
    throw new Error(`Unable to load match context: ${matchContextResponse.error.message}`);
  }

  if (liveSideResponse.error) {
    throw new Error(`Unable to load match sides: ${liveSideResponse.error.message}`);
  }

  const liveSides = liveSideResponse.data ?? [];
  const battingSideName =
    liveSides.find((side) => side.side_id === innings.batting_side_id)?.display_name ??
    "Batting side";
  const bowlingSideName =
    liveSides.find((side) => side.side_id === innings.bowling_side_id)?.display_name ??
    "Bowling side";
  const matchContext = matchContextResponse.data;

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


  const strikerState = snapshot.strikerParticipantId
    ? snapshot.state.batters[snapshot.strikerParticipantId]
    : null;
  const nonStrikerState = snapshot.nonStrikerParticipantId
    ? snapshot.state.batters[snapshot.nonStrikerParticipantId]
    : null;
  const bowlerState = snapshot.bowlerParticipantId
    ? snapshot.state.bowlers[snapshot.bowlerParticipantId]
    : null;
  const currentRunRate = snapshot.legalBalls > 0
    ? ((snapshot.runs * 6) / snapshot.legalBalls).toFixed(2)
    : "0.00";
  const bowlerOvers = bowlerState
    ? formatOvers(Math.floor(bowlerState.legalBalls / 6), bowlerState.legalBalls % 6)
    : "0.0";
  const matchMeta = [
    matchContext?.stats_category,
    matchContext?.match_date
      ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
          new Date(`${matchContext.match_date}T12:00:00`),
        )
      : null,
    matchContext?.venue_name,
  ].filter(Boolean).join(" · ");







  return (
    <main className="min-h-screen bg-[#05070d] px-3 py-3 text-white sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-4 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <Link
              href="/portal/team-admin"
              className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"
            >
              ← Team Admin
            </Link>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.22em] text-amber-400">
              DCC App Scorer · Live
            </p>
          </div>
          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 text-xs font-bold text-emerald-300">
            ● Scoring
          </div>
        </header>

        <StickyScoreBar
          battingSideName={battingSideName}
          score={`${snapshot.runs}/${snapshot.wickets}`}
          overs={formatOvers(snapshot.completedOvers, snapshot.legalBallsInCurrentOver)}
        />

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20">
          <div className="border-b border-white/10 px-4 py-4 sm:px-7 sm:py-5">
            <div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Match</p>
                <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                  {battingSideName} <span className="text-zinc-600">vs</span> {bowlingSideName}
                </h1>
                {matchMeta ? <p className="mt-1 text-sm text-zinc-500">{matchMeta}</p> : null}
              </div>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-7 sm:py-7">
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-400">
                  {battingSideName}
                </p>
                <div id="scorer-hero-score" className="mt-1 flex items-end gap-4">
                  <p className="text-6xl font-black tracking-[-0.06em] sm:text-7xl">
                    {snapshot.runs}/{snapshot.wickets}
                  </p>
                  <p className="mb-2 text-lg font-bold text-zinc-400">
                    {formatOvers(snapshot.completedOvers, snapshot.legalBallsInCurrentOver)} ov
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-zinc-300">
                    CRR {currentRunRate}
                  </span>
                  {snapshot.state.chase ? (
                    <>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-zinc-300">
                        Target {snapshot.state.chase.target}
                      </span>
                      <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1.5 text-amber-200">
                        Need {snapshot.state.chase.runsRequired}
                        {snapshot.state.chase.ballsRemaining !== null
                          ? ` from ${snapshot.state.chase.ballsRemaining}`
                          : ""}
                      </span>
                    </>
                  ) : null}
                </div>

                <div className="mt-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600">This over</p>
                  <div className="mt-2 flex min-h-10 flex-wrap items-center gap-2">
                    {snapshot.currentOver.length > 0 ? snapshot.currentOver.map((delivery, index) => (
                      <span
                        key={`${delivery}-${index}`}
                        className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-xs font-black ${
                          delivery === "W"
                            ? "border-rose-400/30 bg-rose-400/[0.10] text-rose-200"
                            : "border-white/10 bg-white/[0.05] text-zinc-200"
                        }`}
                      >
                        {delivery}
                      </span>
                    )) : (
                      <span className="text-sm text-zinc-600">No deliveries yet</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:gap-3">
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-300">On strike</p>
                      <p className="mt-1 truncate text-lg font-black">
                        {snapshot.state.endRecommendation.reason === "ALL_OUT" && snapshot.strikerParticipantId === null
                          ? "Innings complete"
                          : participantName(snapshot.strikerParticipantId)}
                        {snapshot.strikerParticipantId ? <span className="text-amber-300"> *</span> : null}
                      </p>
                    </div>
                    {strikerState ? (
                      <p className="shrink-0 text-lg font-black">
                        {strikerState.runs} <span className="text-sm font-semibold text-zinc-500">({strikerState.balls})</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-600">Non-striker</p>
                      <p className="mt-1 truncate font-bold">{participantName(snapshot.nonStrikerParticipantId)}</p>
                    </div>
                    {nonStrikerState ? (
                      <p className="shrink-0 font-black">
                        {nonStrikerState.runs} <span className="text-xs font-semibold text-zinc-500">({nonStrikerState.balls})</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-400/15 bg-sky-400/[0.035] p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-300">Bowling</p>
                      <p className="mt-1 truncate font-bold">{participantName(snapshot.bowlerParticipantId)}</p>
                    </div>
                    {bowlerState ? (
                      <p className="shrink-0 text-sm font-black text-zinc-300">
                        {bowlerOvers} · {bowlerState.runsConceded} · {bowlerState.wickets}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600">Match controls</p>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <BreakControl
                  scoringSessionId={scoringSessionId}
                  inningsId={snapshot.inningsId}
                  activeBreak={snapshot.state.break}
                />
                {sessionStatus === "InProgress" && !snapshot.state.break.active ? (
                  <AbandonMatchControl scoringSessionId={scoringSessionId} />
                ) : null}
              </div>
            </div>

            {!snapshot.state.break.active ? (
              <ScorerControls
                scoringSessionId={scoringSessionId}
                inningsId={snapshot.inningsId}
                strikerParticipantId={snapshot.strikerParticipantId}
                nonStrikerParticipantId={snapshot.nonStrikerParticipantId}
                bowlerParticipantId={snapshot.bowlerParticipantId}
                previousOverBowlerParticipantId={snapshot.previousOverBowlerParticipantId}
                battingParticipants={battingParticipants}
                bowlingParticipants={bowlingParticipants}
                canAddBattingOppositionPlayer={externalSideId === innings.batting_side_id}
                canAddBowlingOppositionPlayer={externalSideId === innings.bowling_side_id}
                overReadyToEnd={snapshot.overReadyToEnd}
                endRecommendation={snapshot.state.endRecommendation}
                canUndo={snapshot.eventCount > 0}
              />
            ) : null}
          </div>
        </section>


      </div>
    </main>
  );
}
