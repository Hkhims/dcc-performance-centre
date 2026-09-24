import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PortalAccess = {
  account_role: "User" | "Super Admin";
  account_status: "Invited" | "Active" | "Disabled";
  team_ids: string[];
};

type DccTeam = {
  team_id: string;
  team_name: string;
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
                <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Availability
                  </p>

                  <p className="mt-2 text-lg font-semibold">
                    Not Open
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    Availability management will be connected to
                    this fixture next.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Team Selection
                  </p>

                  <p className="mt-2 text-lg font-semibold">
                    Not Started
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    Team selection will remain available whether
                    or not an availability poll is opened.
                  </p>
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