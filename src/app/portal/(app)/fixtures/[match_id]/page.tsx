import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AvailabilityResponseControls from "./AvailabilityResponseControls";

type PortalAccess = {
  player_id: string | null;
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

type AvailabilityPoll = {
  poll_id: number;
  status: "Open" | "Closed";
};

type AvailabilityAudience = {
  player_id: string;
};

type AvailabilityResponse = {
  availability_status: "Available" | "Unavailable";
};

type MatchSelection = {
  selection_id: number;
  status: "Draft" | "Published";
};

type SelectionPlayer = {
  player_id: string;
  batting_position: number | null;
  is_captain: boolean;
  is_wicketkeeper: boolean;
  selection_role: "Playing" | "Reserve";
};

type Player = {
  player_id: string;
  player_name: string;
};

type FixturePageProps = {
  params: Promise<{
    match_id: string;
  }>;
};

function formatMatchDate(match: Match) {
  const value =
    match.start_datetime ?? `${match.match_date}T12:00:00`;

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

export default async function PlayerFixturePage({
  params,
}: FixturePageProps) {
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

  if (
    !access ||
    access.account_status !== "Active" ||
    !access.player_id
  ) {
    redirect("/portal");
  }

  const playerId = access.player_id;

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
    redirect("/portal/cricket");
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

  if (teamEntries.length === 0) {
    redirect("/portal/cricket");
  }

  const teamIds = teamEntries.map((entry) => entry.team_id);

  const [
    { data: membershipData, error: membershipError },
    { data: pollData, error: pollError },
    { data: selectionData, error: selectionError },
  ] = await Promise.all([
    supabase
      .from("team_player_memberships")
      .select("team_id")
      .eq("player_id", playerId)
      .eq("active", true)
      .in("team_id", teamIds),

    supabase
      .from("match_availability_polls")
      .select("poll_id, team_id, status")
      .eq("match_id", matchId),

    supabase
      .from("match_selections")
      .select("selection_id, team_id, status")
      .eq("match_id", matchId),
  ]);

  if (membershipError) {
    throw new Error(
      `Unable to load team membership: ${membershipError.message}`,
    );
  }

  if (pollError) {
    throw new Error(
      `Unable to load availability poll: ${pollError.message}`,
    );
  }

  if (selectionError) {
    throw new Error(
      `Unable to load team selection: ${selectionError.message}`,
    );
  }

  const membershipTeamIds = new Set(
    (membershipData ?? []).map(
      (membership) => membership.team_id as string,
    ),
  );

  const polls = (pollData ?? []) as Array<
    AvailabilityPoll & {
      team_id: string;
    }
  >;

  const selections = (selectionData ?? []) as Array<
    MatchSelection & {
      team_id: string;
    }
  >;

  /*
   * A player's access to the fixture is deliberately broader than
   * current team membership alone.
   *
   * The availability audience is snapshotted when the poll opens,
   * and a player may also have been selected for the match without
   * being a normal member of that team.
   */
  const audienceChecks = await Promise.all(
    polls.map(async (poll) => {
      const { data, error } = await supabase
        .from("match_availability_audience")
        .select("player_id")
        .eq("poll_id", poll.poll_id)
        .eq("player_id", playerId)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Unable to verify availability audience: ${error.message}`,
        );
      }

      return data
        ? {
            teamId: poll.team_id,
            poll,
          }
        : null;
    }),
  );

  const publishedSelections = selections.filter(
    (selection) => selection.status === "Published",
  );

  const selectionChecks = await Promise.all(
    publishedSelections.map(async (selection) => {
      const { data, error } = await supabase
        .from("match_selection_players")
        .select("player_id")
        .eq("selection_id", selection.selection_id)
        .eq("player_id", playerId)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Unable to verify team selection: ${error.message}`,
        );
      }

      return data
        ? {
            teamId: selection.team_id,
            selection,
          }
        : null;
    }),
  );

  const audienceAccess = audienceChecks.find(Boolean) ?? null;
  const selectionAccess = selectionChecks.find(Boolean) ?? null;

  const accessibleTeamId =
    teamEntries.find((entry) =>
      membershipTeamIds.has(entry.team_id),
    )?.team_id ??
    audienceAccess?.teamId ??
    selectionAccess?.teamId ??
    null;

  if (!accessibleTeamId) {
    redirect("/portal/cricket");
  }

  const teamEntry =
    teamEntries.find(
      (entry) => entry.team_id === accessibleTeamId,
    ) ?? null;

  if (!teamEntry) {
    redirect("/portal/cricket");
  }

  const { data: teamData, error: teamError } =
    await supabase
      .from("teams")
      .select("team_id, team_name")
      .eq("team_id", accessibleTeamId)
      .maybeSingle();

  if (teamError) {
    throw new Error(
      `Unable to load team: ${teamError.message}`,
    );
  }

  const team = teamData as Team | null;

  if (!team) {
    redirect("/portal/cricket");
  }

  const poll =
    polls.find(
      (candidate) =>
        candidate.team_id === accessibleTeamId,
    ) ?? null;

  const publishedSelection =
    publishedSelections.find(
      (candidate) =>
        candidate.team_id === accessibleTeamId,
    ) ?? null;

  let isInAvailabilityAudience = false;
  let availabilityStatus:
    | "Available"
    | "Unavailable"
    | "Not Responded" = "Not Responded";

  if (poll) {
    const { data: audienceData, error: audienceError } =
      await supabase
        .from("match_availability_audience")
        .select("player_id")
        .eq("poll_id", poll.poll_id)
        .eq("player_id", playerId)
        .maybeSingle();

    if (audienceError) {
      throw new Error(
        `Unable to load your availability access: ${audienceError.message}`,
      );
    }

    isInAvailabilityAudience = Boolean(
      audienceData as AvailabilityAudience | null,
    );

    if (isInAvailabilityAudience) {
      const { data: responseData, error: responseError } =
        await supabase
          .from("match_availability")
          .select("availability_status")
          .eq("poll_id", poll.poll_id)
          .eq("player_id", playerId)
          .maybeSingle();

      if (responseError) {
        throw new Error(
          `Unable to load your availability: ${responseError.message}`,
        );
      }

      const response =
        responseData as AvailabilityResponse | null;

      availabilityStatus =
        response?.availability_status ?? "Not Responded";
    }
  }

  let selectedPlayers: SelectionPlayer[] = [];
  let playersById = new Map<string, Player>();

  if (publishedSelection) {
    const { data: selectedPlayerData, error: selectedPlayerError } =
      await supabase
        .from("match_selection_players")
        .select(
          `
            player_id,
            batting_position,
            is_captain,
            is_wicketkeeper,
            selection_role
          `,
        )
        .eq(
          "selection_id",
          publishedSelection.selection_id,
        );

    if (selectedPlayerError) {
      throw new Error(
        `Unable to load published team: ${selectedPlayerError.message}`,
      );
    }

    selectedPlayers =
      (selectedPlayerData ?? []) as SelectionPlayer[];

    const selectedPlayerIds = selectedPlayers.map(
      (player) => player.player_id,
    );

    if (selectedPlayerIds.length > 0) {
      const { data: playerData, error: playerError } =
        await supabase
          .from("players")
          .select("player_id, player_name")
          .in("player_id", selectedPlayerIds);

      if (playerError) {
        throw new Error(
          `Unable to load selected players: ${playerError.message}`,
        );
      }

      playersById = new Map(
        ((playerData ?? []) as Player[]).map((player) => [
          player.player_id,
          player,
        ]),
      );
    }
  }

  const playingPlayers = selectedPlayers
    .filter(
      (player) => player.selection_role === "Playing",
    )
    .sort((a, b) => {
      const aPosition =
        a.batting_position ?? Number.MAX_SAFE_INTEGER;
      const bPosition =
        b.batting_position ?? Number.MAX_SAFE_INTEGER;

      return aPosition - bPosition;
    });

  const reservePlayers = selectedPlayers
    .filter(
      (player) => player.selection_role === "Reserve",
    )
    .sort((a, b) => {
      const aName =
        playersById.get(a.player_id)?.player_name ??
        a.player_id;
      const bName =
        playersById.get(b.player_id)?.player_name ??
        b.player_id;

      return aName.localeCompare(bName);
    });

  const formattedMatchDate = formatMatchDate(match);

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-6xl">
        <header className="border-b border-white/10 pb-8">
          <Link
            href="/portal/cricket"
            className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"
          >
            ← Back to Cricket
          </Link>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
                Player Fixture Centre
              </p>

              <h1 className="mt-2 text-4xl font-bold tracking-tight">
                {match.fixture_label}
              </h1>

              <p className="mt-3 text-zinc-300">
                {formattedMatchDate}
              </p>

              <p className="mt-2 text-sm text-zinc-500">
                {match.venue_name ??
                  "Venue not yet available"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-zinc-300">
                {team.team_name}
              </span>

              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-zinc-300">
                {match.stats_category}
              </span>

              <span className="rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-3 py-1 text-xs font-semibold text-sky-300">
                {match.status}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-5 py-8 lg:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Fixture
            </p>

            <h2 className="mt-2 text-xl font-bold">
              Match details
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs text-zinc-500">
                  DCC Team
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">
                  {team.team_name}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">
                  Opposition
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">
                  {teamEntry.opponent_display_name ??
                    "Opponent unavailable"}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">
                  Date &amp; time
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">
                  {formattedMatchDate}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">
                  Venue
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">
                  {match.venue_name ??
                    "Venue not yet available"}
                </p>
              </div>
            </div>
          </article>

          <article
            id="availability"
            className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.035] p-6 lg:col-span-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Availability
                </p>

                <h2 className="mt-2 text-xl font-bold">
                  Your availability
                </h2>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  !poll
                    ? "bg-white/10 text-white/60"
                    : poll.status === "Open"
                      ? "bg-emerald-400/10 text-emerald-300"
                      : "bg-amber-400/10 text-amber-300"
                }`}
              >
                {!poll ? "Not Open" : poll.status}
              </span>
            </div>

            {!poll ? (
              <p className="mt-5 text-sm leading-6 text-zinc-400">
                Availability has not been opened for this
                fixture yet.
              </p>
            ) : !isInAvailabilityAudience ? (
              <p className="mt-5 text-sm leading-6 text-zinc-400">
                You are not part of the availability audience
                for this fixture.
              </p>
            ) : (
              <AvailabilityResponseControls
                matchId={match.match_id}
                pollId={poll.poll_id}
                currentStatus={availabilityStatus}
                pollStatus={poll.status}
              />
            )}
          </article>
        </section>

        <section
          id="team-selection"
          className="scroll-mt-24 pb-8"
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Team Selection
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  {publishedSelection
                    ? "Published team"
                    : "Not published yet"}
                </h2>
              </div>

              {publishedSelection ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1 text-xs font-semibold text-emerald-300">
                  Published
                </span>
              ) : null}
            </div>

            {!publishedSelection ? (
              <p className="mt-4 text-sm leading-6 text-zinc-400">
                The team for this fixture has not been
                published yet. Draft selections are visible
                only to authorised Team Admins.
              </p>
            ) : (
              <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
                <div>
                  <p className="text-sm font-semibold text-zinc-300">
                    Playing team
                  </p>

                  {playingPlayers.length > 0 ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                      {playingPlayers.map((selectedPlayer, index) => {
                        const player =
                          playersById.get(
                            selectedPlayer.player_id,
                          );

                        const isCurrentPlayer =
                          selectedPlayer.player_id === playerId;

                        return (
                          <div
                            key={selectedPlayer.player_id}
                            className={`flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 last:border-b-0 ${
                              isCurrentPlayer
                                ? "bg-amber-400/[0.07]"
                                : "bg-black/10"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="w-6 shrink-0 text-sm font-semibold text-zinc-500">
                                {selectedPlayer.batting_position ??
                                  index + 1}
                              </span>

                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-zinc-200">
                                  {player?.player_name ??
                                    selectedPlayer.player_id}
                                  {isCurrentPlayer
                                    ? " (You)"
                                    : ""}
                                </p>

                                {(selectedPlayer.is_captain ||
                                  selectedPlayer.is_wicketkeeper) && (
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {selectedPlayer.is_captain ? (
                                      <span className="text-xs font-semibold text-amber-300">
                                        Captain
                                      </span>
                                    ) : null}

                                    {selectedPlayer.is_wicketkeeper ? (
                                      <span className="text-xs font-semibold text-sky-300">
                                        Wicketkeeper
                                      </span>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500">
                      No playing players are listed.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-zinc-300">
                    Reserves
                  </p>

                  {reservePlayers.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {reservePlayers.map((selectedPlayer) => {
                        const player =
                          playersById.get(
                            selectedPlayer.player_id,
                          );

                        const isCurrentPlayer =
                          selectedPlayer.player_id === playerId;

                        return (
                          <div
                            key={selectedPlayer.player_id}
                            className={`rounded-xl border px-4 py-3 ${
                              isCurrentPlayer
                                ? "border-amber-400/20 bg-amber-400/[0.07]"
                                : "border-white/10 bg-black/10"
                            }`}
                          >
                            <p className="text-sm font-semibold text-zinc-200">
                              {player?.player_name ??
                                selectedPlayer.player_id}
                              {isCurrentPlayer ? " (You)" : ""}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500">
                      No reserve players are listed.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {match.status === "Completed" ? (
          <section className="pb-8">
            <Link
              href={`/matches/${match.match_id}`}
              className="inline-flex rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-5 py-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14]"
            >
              View match scorecard →
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}