import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AvailabilityControls from "./AvailabilityControls";
import CreateMatchForm from "./CreateMatchForm";
import TeamMembershipManager from "./TeamMembershipManager";

type PortalAccess = {
  account_role: "User" | "Super Admin";
  account_status: "Invited" | "Active" | "Disabled";
  team_ids: string[];
};

type DccTeam = {
  team_id: string;
  team_name: string;
};

type DccPlayer = {
  player_id: string;
  player_name: string;
};

type TeamPlayerMembership = {
  player_id: string;
};

type TeamMatchEntry = {
  match_id: string;
  opponent_display_name: string | null;
};

type ScheduledMatch = {
  match_id: string;
  season: number;
  match_date: string;
  start_datetime: string | null;
  fixture_label: string;
  status: string;
  venue_name: string | null;
  home_away: string | null;
  stats_category: string;
};

type TeamAdminTeamPageProps = {
  params: Promise<{
    team_id: string;
  }>;
};

function getMatchTimestamp(match: ScheduledMatch) {
  const value =
    match.start_datetime ??
    `${match.match_date}T00:00:00`;

  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp)
    ? Number.MAX_SAFE_INTEGER
    : timestamp;
}

function formatMatchDate(match: ScheduledMatch) {
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

export default async function TeamAdminTeamPage({
  params,
}: TeamAdminTeamPageProps) {
  const { team_id: teamId } = await params;

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

  const access = (accessData?.[0] ?? null) as PortalAccess | null;

  if (!access || access.account_status !== "Active") {
    redirect("/portal");
  }

  const isSuperAdmin =
    access.account_role === "Super Admin";

  const canManageTeam =
    isSuperAdmin || access.team_ids.includes(teamId);

  if (!canManageTeam) {
    redirect("/portal/team-admin");
  }

  const { data: teamData, error: teamError } = await supabase
    .from("teams")
    .select("team_id, team_name")
    .eq("team_id", teamId)
    .maybeSingle();

  if (teamError) {
    throw new Error(
      `Unable to load DCC team: ${teamError.message}`,
    );
  }

  const team = teamData as DccTeam | null;

  if (!team) {
    redirect("/portal/team-admin");
  }
  const [
  { data: playerData, error: playersError },
  { data: membershipData, error: membershipsError },
] = await Promise.all([
  supabase
    .from("players")
    .select("player_id, player_name")
    .eq("active", true)
    .order("player_name"),
  supabase
    .from("team_player_memberships")
    .select("player_id")
    .eq("team_id", teamId)
    .eq("active", true),
]);

if (playersError) {
  throw new Error(
    `Unable to load active DCC players: ${playersError.message}`,
  );
}

if (membershipsError) {
  throw new Error(
    `Unable to load team player memberships: ${membershipsError.message}`,
  );
}

const activePlayers = (playerData ?? []) as DccPlayer[];

const activeMemberships =
  (membershipData ?? []) as TeamPlayerMembership[];

const activePlayerById = new Map(
  activePlayers.map((player) => [
    player.player_id,
    player,
  ]),
);

const teamMembers = activeMemberships
  .map((membership) =>
    activePlayerById.get(membership.player_id),
  )
  .filter(
    (player): player is DccPlayer =>
      player !== undefined,
  );

  const { data: teamEntryData, error: teamEntriesError } =
    await supabase
      .from("match_team_entries")
      .select("match_id, opponent_display_name")
      .eq("team_id", teamId);

  if (teamEntriesError) {
    throw new Error(
      `Unable to load team match entries: ${teamEntriesError.message}`,
    );
  }

  const teamEntries =
    (teamEntryData ?? []) as TeamMatchEntry[];

  const matchIds = teamEntries.map(
    (entry) => entry.match_id,
  );

  let scheduledMatches: ScheduledMatch[] = [];

  if (matchIds.length > 0) {
    const { data: matchData, error: matchesError } =
      await supabase
        .from("matches")
        .select(
          `
            match_id,
            season,
            match_date,
            start_datetime,
            fixture_label,
            status,
            venue_name,
            home_away,
            stats_category
          `,
        )
        .in("match_id", matchIds)
        .eq("status", "Scheduled");

    if (matchesError) {
      throw new Error(
        `Unable to load scheduled matches: ${matchesError.message}`,
      );
    }

    scheduledMatches =
      (matchData ?? []) as ScheduledMatch[];
  }

  scheduledMatches.sort(
    (a, b) =>
      getMatchTimestamp(a) - getMatchTimestamp(b),
  );

  const opponentByMatchId = new Map(
    teamEntries.map((entry) => [
      entry.match_id,
      entry.opponent_display_name,
    ]),
  );

  const nextFixture = scheduledMatches[0] ?? null;
    let availabilityPoll: {
    poll_id: number;
    status: string;
    opened_at: string | null;
    closed_at: string | null;
  } | null = null;

  let availabilityCounts = {
    total: 0,
    available: 0,
    unavailable: 0,
    notResponded: 0,
  };

  if (nextFixture) {
    const { data: pollData, error: pollError } = await supabase
      .from("match_availability_polls")
      .select("poll_id, status, opened_at, closed_at")
      .eq("match_id", nextFixture.match_id)
      .eq("team_id", team.team_id)
      .maybeSingle();

    if (pollError) {
      console.error(
        "Failed to load match availability poll:",
        pollError,
      );
    }

    availabilityPoll = pollData;

    if (availabilityPoll) {
      const [
        { data: audienceData, error: audienceError },
        { data: responseData, error: responseError },
      ] = await Promise.all([
        supabase
          .from("match_availability_audience")
          .select("player_id")
          .eq("poll_id", availabilityPoll.poll_id),
        supabase
          .from("match_availability")
          .select("player_id, availability_status")
          .eq("poll_id", availabilityPoll.poll_id),
      ]);

      if (audienceError) {
        console.error(
          "Failed to load match availability audience:",
          audienceError,
        );
      }

      if (responseError) {
        console.error(
          "Failed to load match availability responses:",
          responseError,
        );
      }

      const audience = audienceData ?? [];
      const responses = responseData ?? [];

      const available = responses.filter(
        (response) =>
          response.availability_status === "Available",
      ).length;

      const unavailable = responses.filter(
        (response) =>
          response.availability_status === "Unavailable",
      ).length;

      availabilityCounts = {
        total: audience.length,
        available,
        unavailable,
        notResponded: Math.max(
          audience.length - available - unavailable,
          0,
        ),
      };
    }
  }
  const laterFixtures = scheduledMatches.slice(1);

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">
      <div className="w-full">
        <header className="border-b border-white/10 pb-8">
          <Link
            href="/portal/team-admin"
            className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"
          >
            ← Back to Team Admin
          </Link>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
                Team Management
              </p>

              <h1 className="mt-2 text-4xl font-bold tracking-tight">
                {team.team_name}
              </h1>

              <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
                Manage upcoming fixtures, player availability,
                team selection, and match-day administration.
              </p>
            </div>

            <div className="text-sm text-zinc-500">
              {isSuperAdmin ? "Super Admin" : "Team Admin"}
            </div>
          </div>
        </header>

        <section className="py-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Next Fixture
          </p>

          {nextFixture ? (
            <article className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-400">
                    Upcoming
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    {nextFixture.fixture_label}
                  </h2>

                  <p className="mt-3 text-zinc-300">
                    {formatMatchDate(nextFixture)}
                  </p>

                  <p className="mt-2 text-sm text-zinc-500">
                    {nextFixture.venue_name ??
                      "Venue not yet available"}
                  </p>
                </div>

                <span className="w-fit rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-3 py-1 text-xs font-semibold text-sky-300">
                  Scheduled
                </span>
              </div>
<div className="mt-7 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
        Availability
      </p>

      <p className="mt-2 text-lg font-semibold text-white">
        {!availabilityPoll
          ? "Not Open"
          : availabilityPoll.status === "Open"
            ? "Open"
            : "Closed"}
      </p>
    </div>

    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        !availabilityPoll
          ? "bg-white/10 text-white/60"
          : availabilityPoll.status === "Open"
            ? "bg-emerald-400/10 text-emerald-300"
            : "bg-amber-400/10 text-amber-300"
      }`}
    >
      {!availabilityPoll
        ? "Not Open"
        : availabilityPoll.status === "Open"
          ? "Open"
          : "Closed"}
    </span>
  </div>

  {!availabilityPoll ? (
    <p className="mt-4 text-sm leading-6 text-white/60">
      Availability has not been opened for this match yet.
    </p>
  ) : (
    <div className="mt-5 grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-white/10 bg-black/10 p-3">
        <p className="text-xs text-white/50">Available</p>
        <p className="mt-1 text-xl font-semibold text-white">
          {availabilityCounts.available}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/10 p-3">
        <p className="text-xs text-white/50">Unavailable</p>
        <p className="mt-1 text-xl font-semibold text-white">
          {availabilityCounts.unavailable}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/10 p-3">
        <p className="text-xs text-white/50">Not Responded</p>
        <p className="mt-1 text-xl font-semibold text-white">
          {availabilityCounts.notResponded}
        </p>
      </div>
    </div>
  )}

  {availabilityPoll ? (
    <p className="mt-4 text-xs text-white/40">
      {availabilityCounts.total}{" "}
      {availabilityCounts.total === 1 ? "player" : "players"} in this
      availability poll.
    </p>
  ) : null}
  <AvailabilityControls
  matchId={nextFixture.match_id}
  teamId={team.team_id}
  pollId={availabilityPoll?.poll_id ?? null}
  status={availabilityPoll?.status ?? null}
/>
</div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-5">
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
    Team Selection
  </p>

  <p className="mt-2 text-lg font-semibold">
    Manage Selection
  </p>

  <p className="mt-2 text-sm leading-6 text-zinc-500">
    Build and publish the team independently of the
    availability poll.
  </p>

  <Link
    href={`/portal/team-admin/fixtures/${nextFixture.match_id}/selection`}
    className="mt-5 inline-flex rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14]"
  >
    Open Team Selection →
  </Link>
</div>
              </div>
            </article>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-7">
              <p className="text-sm font-semibold text-zinc-300">
                No upcoming fixture
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                No scheduled matches for {team.team_name}.
              </h2>

              <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
                When a future fixture is added to DCC canonical
                match data, the next scheduled match will appear
                here automatically.
              </p>
            </div>
          )}
        </section>
                <section className="pb-8">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
              Add Fixture
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Create a friendly or warm-up match
            </h2>

            <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
              Add a non-competitive DCC fixture for{" "}
              {team.team_name}. Official NCU fixtures are added
              through the NV Play integration and cannot be
              created here.
            </p>

            <CreateMatchForm
              teamId={team.team_id}
              teamName={team.team_name}
              season={2026}
            />
          </div>
        </section>
                <section className="pb-8">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
              Team Players
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Manage {team.team_name} players
            </h2>

            <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
              Maintain the normal player group for this team.
              These players form the default audience when match
              availability is opened.
            </p>

            <TeamMembershipManager
              teamId={team.team_id}
              teamName={team.team_name}
              players={activePlayers}
              members={teamMembers}
            />
          </div>
        </section>
        <section className="pb-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Upcoming Fixtures
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Later scheduled matches
            </h2>
          </div>

          {laterFixtures.length > 0 ? (
            <div className="mt-5 space-y-3">
              {laterFixtures.map((match) => (
                <article
                  key={match.match_id}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold">
                        {match.fixture_label}
                      </h3>

                      <p className="mt-1 text-sm text-zinc-500">
                        {opponentByMatchId.get(
                          match.match_id,
                        ) ?? "Opponent unavailable"}
                      </p>
                    </div>

                    <p className="text-sm text-zinc-400">
                      {formatMatchDate(match)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <p className="text-sm text-zinc-500">
                No later scheduled fixtures are currently
                available.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">
          <p className="text-sm font-semibold text-amber-400">
            Match administration
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            Match Review Queue
          </h2>

          <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
            Review completed NV Play imports for this season
            through the existing DCC match review workflow.
          </p>

          <Link
            href="/portal/imports"
            className="mt-6 inline-flex rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14]"
          >
            Open Match Review Queue →
          </Link>
        </section>
      </div>
    </main>
  );
}