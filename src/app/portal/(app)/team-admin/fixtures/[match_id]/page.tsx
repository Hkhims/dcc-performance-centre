import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AvailabilityControls from "../../teams/[team_id]/AvailabilityControls";

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

type AvailabilityPoll = {
  poll_id: number;
  status: "Open" | "Closed";
  opened_at: string | null;
  closed_at: string | null;
};

type AvailabilityAudience = {
  player_id: string;
};

type AvailabilityResponse = {
  player_id: string;
  availability_status: "Available" | "Unavailable";
};

type MatchSelection = {
  selection_id: number;
  status: "Draft" | "Published";
};

type FixtureManagementPageProps = {
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

export default async function FixtureManagementPage({
  params,
}: FixtureManagementPageProps) {
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
    { data: pollData, error: pollError },
    { data: selectionData, error: selectionError },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("team_id, team_name")
      .eq("team_id", teamId)
      .maybeSingle(),

    supabase
      .from("match_availability_polls")
      .select(
        "poll_id, status, opened_at, closed_at",
      )
      .eq("match_id", matchId)
      .eq("team_id", teamId)
      .maybeSingle(),

    supabase
      .from("match_selections")
      .select("selection_id, status")
      .eq("match_id", matchId)
      .eq("team_id", teamId)
      .maybeSingle(),
  ]);

  if (teamError) {
    throw new Error(
      `Unable to load team: ${teamError.message}`,
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

  const team = teamData as Team | null;

  if (!team) {
    redirect("/portal/team-admin");
  }

  const poll = pollData as AvailabilityPoll | null;

  const selection =
    selectionData as MatchSelection | null;

  let totalPlayers = 0;
  let availablePlayers = 0;
  let unavailablePlayers = 0;
  let notRespondedPlayers = 0;

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

    totalPlayers = audience.length;

    availablePlayers = responses.filter(
      (response) =>
        response.availability_status === "Available",
    ).length;

    unavailablePlayers = responses.filter(
      (response) =>
        response.availability_status === "Unavailable",
    ).length;

    notRespondedPlayers = Math.max(
      totalPlayers -
        availablePlayers -
        unavailablePlayers,
      0,
    );
  }

  const isPublished =
    selection?.status === "Published";

  const formattedMatchDate = formatMatchDate(match);

  const teamSelectionTitle = !selection
    ? "Not Started"
    : selection.status === "Draft"
      ? "Draft Selection"
      : "Team Published";

  const teamSelectionDescription = !selection
    ? "No team selection has been created for this fixture yet."
    : selection.status === "Draft"
      ? "A draft team exists for this fixture and can still be changed."
      : "The team for this fixture has been published.";

  const teamSelectionButton = !selection
    ? "Manage Team Selection →"
    : selection.status === "Draft"
      ? "Continue Team Selection →"
      : "View Published Team →";

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">
      <div className="w-full">
        <header className="border-b border-white/10 pb-8">
          <Link
            href={`/portal/team-admin/teams/${team.team_id}`}
            className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"
          >
            ← Back to {team.team_name}
          </Link>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
                Fixture Management
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
                {match.stats_category}
              </span>

              <span className="rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-3 py-1 text-xs font-semibold text-sky-300">
                {match.status}
              </span>

              {isPublished ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1 text-xs font-semibold text-emerald-300">
                  Team Published
                </span>
              ) : null}
            </div>
          </div>
        </header>

        <section className="py-8">
          <div className="grid gap-5 lg:grid-cols-3">
            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Fixture Information
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
                    {manageableEntry.opponent_display_name ??
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

                <div>
                  <p className="text-xs text-zinc-500">
                    Match category
                  </p>
                  <p className="mt-1 text-sm font-semibold text-zinc-200">
                    {match.stats_category}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Availability
                  </p>

                  <h2 className="mt-2 text-xl font-bold">
                    {!poll
                      ? "Not Open"
                      : poll.status === "Open"
                        ? "Open"
                        : "Closed"}
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
                  {!poll
                    ? "Not Open"
                    : poll.status === "Open"
                      ? "Open"
                      : "Closed"}
                </span>
              </div>

              {!poll ? (
                <p className="mt-4 text-sm leading-6 text-zinc-400">
                  Availability has not been opened for this
                  fixture yet. Opening it will snapshot the
                  current team membership as the response
                  audience.
                </p>
              ) : (
                <>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-xs text-zinc-500">
                        Available
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {availablePlayers}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-xs text-zinc-500">
                        Unavailable
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {unavailablePlayers}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-xs text-zinc-500">
                        Not Responded
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {notRespondedPlayers}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs leading-5 text-zinc-500">
                    {totalPlayers}{" "}
                    {totalPlayers === 1
                      ? "player"
                      : "players"}{" "}
                    in this availability poll.
                  </p>
                </>
              )}

              {isPublished ? (
                <div className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
                  <p className="text-sm leading-6 text-emerald-200/80">
                    Availability is locked while the team
                    selection is Published.
                  </p>
                </div>
              ) : (
                <AvailabilityControls
                  matchId={match.match_id}
                  teamId={team.team_id}
                  pollId={poll?.poll_id ?? null}
                  status={poll?.status ?? null}
                />
              )}
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Team Selection
                  </p>

                  <h2 className="mt-2 text-xl font-bold">
                    {teamSelectionTitle}
                  </h2>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    selection?.status === "Published"
                      ? "bg-emerald-400/10 text-emerald-300"
                      : selection?.status === "Draft"
                        ? "bg-amber-400/10 text-amber-300"
                        : "bg-white/10 text-white/60"
                  }`}
                >
                  {selection?.status ?? "Not Started"}
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-zinc-400">
                {teamSelectionDescription}
              </p>

              <p className="mt-3 text-xs leading-5 text-zinc-500">
                Availability informs team selection but never
                prevents a Team Admin from selecting a player.
              </p>

              <Link
                href={`/portal/team-admin/fixtures/${match.match_id}/selection`}
                className="mt-5 inline-flex rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14]"
              >
                {teamSelectionButton}
              </Link>
            </article>
          </div>
        </section>

        <section className="pb-8">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
            <p className="text-sm font-semibold text-zinc-300">
              Match lifecycle
            </p>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
              Availability and team selection are separate
              planning tools. Publishing a team automatically
              closes any open availability poll. The published
              selection records DCC&apos;s pre-match intention;
              the final scorecard will record who actually
              played.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}