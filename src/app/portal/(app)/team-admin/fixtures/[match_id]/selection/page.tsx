import Link from "next/link";







import { redirect } from "next/navigation";







import { createClient } from "@/lib/supabase/server";







import TeamSelectionManager from "./TeamSelectionManager";















type PortalAccess = {







  account_role: "User" | "Super Admin";







  account_status: "Invited" | "Active" | "Disabled";







  team_ids: string[];







};















type Match = {







  match_id: string;







  match_date: string;







  start_datetime: string | null;







  fixture_label: string;







  status: string;







  venue_name: string | null;







  stats_category: string;







};















type MatchTeamEntry = {







  team_id: string;







  opponent_display_name: string | null;







};















type Team = {







  team_id: string;







  team_name: string;







};















type PlayerRole =



  | "Batter"



  | "Pace Bowler"



  | "Spin Bowler"



  | "Batting Pace All-rounder"



  | "Pace Bowling All-rounder"



  | "Batting Spin All-rounder"



  | "Spin Bowling All-rounder"



  | "Wicketkeeper Batter";







type Player = {



  player_id: string;



  player_name: string;



  role: PlayerRole | null;



  photo_url: string | null;



};







type PlayerProfile = {



  player_id: string;



  role: PlayerRole | null;



  photo_url: string | null;



};















type TeamPlayerMembership = {







  player_id: string;







};















type MatchSelection = {







  selection_id: number;







  team_id: string;







  status: "Draft" | "Published";







};















type MatchSelectionPlayer = {







  player_id: string;







  selection_role: "Playing" | "Reserve";







  selection_order: number | null;







  is_captain: boolean;







  is_wicketkeeper: boolean;







  has_car: boolean;







};















type AvailabilityPoll = {







  poll_id: number;







};















type AvailabilityAudience = {







  player_id: string;







};















type AvailabilityResponse = {







  player_id: string;







  availability_status: "Available" | "Unavailable";







};















type TeamSelectionPageProps = {







  params: Promise<{







    match_id: string;







  }>;







};















function formatMatchDate(match: Match) {







  const value =







    match.start_datetime ??







    `${match.match_date}T12:00:00`;















  const date = new Date(value);















  if (Number.isNaN(date.getTime())) {







    return match.match_date;







  }















  return new Intl.DateTimeFormat("en-GB", {







    timeZone: "Europe/London",







    weekday: "long",







    day: "numeric",







    month: "long",







    year: "numeric",







    ...(match.start_datetime







      ? {







          hour: "2-digit",







          minute: "2-digit",







        }







      : {}),







  }).format(date);







}















export default async function TeamSelectionPage({







  params,







}: TeamSelectionPageProps) {







  const { match_id: matchId } = await params;















  const supabase = await createClient();















  const { data: claimsData, error: claimsError } =







    await supabase.auth.getClaims();















  if (claimsError || !claimsData?.claims?.sub) {







    redirect("/portal/login");







  }















  const { data: accessData, error: accessError } =







    await supabase.rpc("get_my_portal_access");















  if (accessError) {







    throw new Error(







      `Unable to load Portal access: ${accessError.message}`,







    );







  }















  const access =







    (accessData?.[0] ?? null) as PortalAccess | null;















  if (!access || access.account_status !== "Active") {







    redirect("/portal");







  }















  const { data: matchData, error: matchError } =







    await supabase







      .from("matches")







      .select(







        `







          match_id,







          match_date,







          start_datetime,







          fixture_label,







          status,







          venue_name,







          stats_category







        `,







      )







      .eq("match_id", matchId)







      .maybeSingle();















  if (matchError) {







    throw new Error(







      `Unable to load match: ${matchError.message}`,







    );







  }















  const match = matchData as Match | null;















  if (!match) {







    redirect("/portal/team-admin");







  }















  const { data: teamEntryData, error: teamEntryError } =







    await supabase







      .from("match_team_entries")







      .select("team_id, opponent_display_name")







      .eq("match_id", matchId);















  if (teamEntryError) {







    throw new Error(







      `Unable to load match team: ${teamEntryError.message}`,







    );







  }















  const teamEntries =







    (teamEntryData ?? []) as MatchTeamEntry[];















  const manageableEntry =







    access.account_role === "Super Admin"







      ? (teamEntries[0] ?? null)







      : (teamEntries.find((entry) =>







          access.team_ids.includes(entry.team_id),







        ) ?? null);















  if (!manageableEntry) {







    redirect("/portal/team-admin");







  }















  const teamId = manageableEntry.team_id;















  const [







    { data: teamData, error: teamError },







    { data: playerData, error: playerError },







    { data: profileData, error: profileError },







    { data: membershipData, error: membershipError },







    { data: selectionData, error: selectionError },







  ] = await Promise.all([







    supabase







      .from("teams")







      .select("team_id, team_name")







      .eq("team_id", teamId)







      .maybeSingle(),















    supabase







      .from("players")







      .select("player_id, player_name")







      .eq("active", true)







      .order("player_name"),







    supabase



      .from("player_profiles")



      .select("player_id, role, photo_url"),















    supabase







      .from("team_player_memberships")







      .select("player_id")







      .eq("team_id", teamId)







      .eq("active", true),















    supabase







      .from("match_selections")







      .select("selection_id, team_id, status")







      .eq("match_id", matchId)







      .eq("team_id", teamId)







      .maybeSingle(),







  ]);















  if (teamError) {







    throw new Error(







      `Unable to load team: ${teamError.message}`,







    );







  }















  if (playerError) {



    throw new Error(



      `Unable to load active DCC players: ${playerError.message}`,



    );



  }







  if (profileError) {



    throw new Error(



      `Unable to load player profiles: ${profileError.message}`,



    );



  }







  if (membershipError) {







    throw new Error(







      `Unable to load team memberships: ${membershipError.message}`,







    );







  }















  if (selectionError) {







    throw new Error(







      `Unable to load team selection: ${selectionError.message}`,







    );







  }















  const team = teamData as Team | null;















  if (!team) {







    redirect("/portal/team-admin");







  }















  const playerProfiles =



    (profileData ?? []) as PlayerProfile[];







  const profileByPlayerId = new Map(



    playerProfiles.map((profile) => [



      profile.player_id,



      profile,



    ]),



  );







  const players: Player[] = (playerData ?? []).map((player) => {



    const profile = profileByPlayerId.get(player.player_id);







    return {



      player_id: player.player_id,



      player_name: player.player_name,



      role: profile?.role ?? null,



      photo_url: profile?.photo_url ?? null,



    };



  });















  const memberships =







    (membershipData ?? []) as TeamPlayerMembership[];















  const teamPlayerIds = new Set(







    memberships.map((membership) => membership.player_id),







  );















  const teamPlayers = players.filter((player) =>







    teamPlayerIds.has(player.player_id),







  );















  const otherPlayers = players.filter(







    (player) => !teamPlayerIds.has(player.player_id),







  );















  const selection =







    selectionData as MatchSelection | null;















  let selectedPlayers:







    Array<







      Player & {







        selection_role: "Playing" | "Reserve";







        selection_order: number | null;







        is_captain: boolean;







        is_wicketkeeper: boolean;







        has_car: boolean;







      }







    > = [];















  if (selection) {







    const {







      data: selectedPlayerData,







      error: selectedPlayerError,







    } = await supabase







      .from("match_selection_players")







      .select(







        `







          player_id,







          selection_role,







          selection_order,







          is_captain,



          is_wicketkeeper,



          has_car







        `,







      )







      .eq("selection_id", selection.selection_id);















    if (selectedPlayerError) {







      throw new Error(







        `Unable to load selected players: ${selectedPlayerError.message}`,







      );







    }















    const selectedRows =







      (selectedPlayerData ?? []) as MatchSelectionPlayer[];















    const playerById = new Map(







      players.map((player) => [







        player.player_id,







        player,







      ]),







    );















    selectedPlayers = selectedRows







      .map((row) => {







        const player = playerById.get(row.player_id);















        if (!player) {







          return null;







        }















        return {







          ...player,







          selection_role: row.selection_role,







          selection_order: row.selection_order,







          is_captain: row.is_captain,







          is_wicketkeeper: row.is_wicketkeeper,







          has_car: row.has_car,







        };







      })







      .filter(







        (







          player,







        ): player is Player & {







          selection_role: "Playing" | "Reserve";







          selection_order: number | null;







          is_captain: boolean;







          is_wicketkeeper: boolean;







          has_car: boolean;







        } => player !== null,







      );







  }















  const { data: pollData, error: pollError } =







    await supabase







      .from("match_availability_polls")







      .select("poll_id")







      .eq("match_id", matchId)







      .eq("team_id", teamId)







      .maybeSingle();















  if (pollError) {







    throw new Error(







      `Unable to load availability poll: ${pollError.message}`,







    );







  }















  const poll = pollData as AvailabilityPoll | null;















  const availability: Array<{







    player_id: string;







    status:







      | "Available"







      | "Unavailable"







      | "Not Responded";







  }> = [];















  if (poll) {







    const [







      { data: audienceData, error: audienceError },







      { data: responseData, error: responseError },







    ] = await Promise.all([







      supabase







        .from("match_availability_audience")







        .select("player_id")







        .eq("poll_id", poll.poll_id),















      supabase







        .from("match_availability")







        .select("player_id, availability_status")







        .eq("poll_id", poll.poll_id),







    ]);















    if (audienceError) {







      throw new Error(







        `Unable to load availability audience: ${audienceError.message}`,







      );







    }















    if (responseError) {







      throw new Error(







        `Unable to load availability responses: ${responseError.message}`,







      );







    }















    const audience =







      (audienceData ?? []) as AvailabilityAudience[];















    const responses =







      (responseData ?? []) as AvailabilityResponse[];















    const responseByPlayerId = new Map(







      responses.map((response) => [







        response.player_id,







        response.availability_status,







      ]),







    );















    for (const audiencePlayer of audience) {







      availability.push({







        player_id: audiencePlayer.player_id,







        status:







          responseByPlayerId.get(







            audiencePlayer.player_id,







          ) ?? "Not Responded",







      });







    }







  }















  const backHref =







    `/portal/team-admin/fixtures/${match.match_id}`;















  const formattedMatchDate = formatMatchDate(match);















  return (







    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">







      <div className="w-full">







        <header className="border-b border-white/10 pb-8">







          <Link







            href={backHref}







            className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"







          >







            ← Back to Fixture







          </Link>















          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">







            <div>







              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">







                Team Selection







              </p>















              <h1 className="mt-2 text-4xl font-bold tracking-tight">







                {match.fixture_label}







              </h1>















              <p className="mt-3 text-zinc-300">







                {formattedMatchDate}







              </p>















              <p className="mt-2 text-sm text-zinc-500">







                {manageableEntry.opponent_display_name ??







                  "Opponent unavailable"}







                {" · "}







                {match.venue_name ??







                  "Venue not yet available"}







              </p>







            </div>















            <div className="flex flex-wrap gap-2">







              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-zinc-300">







                {match.stats_category}







              </span>















              <span className="rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-3 py-1 text-xs font-semibold text-sky-300">







                {match.status}







              </span>







            </div>







          </div>







        </header>















        <div className="py-8">







          <TeamSelectionManager







            matchId={match.match_id}







            teamId={team.team_id}







            teamName={team.team_name}







            fixtureLabel={match.fixture_label}







            matchDateLabel={formattedMatchDate}







            venueName={match.venue_name}







            selectionId={







              selection?.selection_id ?? null







            }







            selectionStatus={







              selection?.status ?? null







            }







            teamPlayers={teamPlayers}







            otherPlayers={otherPlayers}







            selectedPlayers={selectedPlayers}







            availability={availability}







          />







        </div>







      </div>







    </main>







  );







}