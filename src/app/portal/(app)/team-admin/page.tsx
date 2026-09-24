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
  display_order: number | null;
};

export default async function TeamAdminPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/portal/login");
  }

  const { data, error } = await supabase.rpc(
    "get_my_portal_access",
  );

  if (error) {
    throw new Error(
      `Unable to load Portal access: ${error.message}`,
    );
  }

  const access = (data?.[0] ?? null) as PortalAccess | null;

  if (!access || access.account_status !== "Active") {
    redirect("/portal");
  }

  const isSuperAdmin =
    access.account_role === "Super Admin";

  if (!isSuperAdmin && access.team_ids.length === 0) {
    redirect("/portal");
  }

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("team_id, team_name, display_order")
    .order("display_order", { ascending: true });

  if (teamsError) {
    throw new Error(
      `Unable to load DCC teams: ${teamsError.message}`,
    );
  }

  const managedTeams = ((teams ?? []) as DccTeam[]).filter(
    (team) =>
      isSuperAdmin || access.team_ids.includes(team.team_id),
  );

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">
      <div className="w-full">
        <header className="border-b border-white/10 pb-8">
          <Link
            href="/portal"
            className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"
          >
            ← Back to DCC Portal
          </Link>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
                DCC Administration
              </p>

              <h1 className="mt-2 text-4xl font-bold tracking-tight">
                Team Admin Dashboard
              </h1>

              <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
                Manage your DCC teams, upcoming match workflows,
                and match reviews from one place.
              </p>
            </div>

            <div className="text-sm text-zinc-500">
              {isSuperAdmin
                ? "Super Admin · All DCC teams"
                : `Team Admin · ${managedTeams.length} ${
                    managedTeams.length === 1 ? "team" : "teams"
                  }`}
            </div>
          </div>
        </header>

        <section className="py-8">
          <div className="mb-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              My Teams
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Teams you manage
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Team management will include upcoming fixtures,
              availability, team selection, and match-day
              administration.
            </p>
          </div>

          {managedTeams.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {managedTeams.map((team) => (
                <article
                  key={team.team_id}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:border-amber-400/25 hover:bg-amber-400/[0.035]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/70">
                        DCC Team
                      </p>

                      <h3 className="mt-2 text-2xl font-bold">
                        {team.team_name}
                      </h3>
                    </div>

                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1 text-xs font-semibold text-emerald-300">
                      Managed
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-zinc-400">
                    View this team&apos;s fixtures and manage its
                    pre-match workflow.
                  </p>

                  <Link
                    href={`/portal/team-admin/teams/${team.team_id}`}
                    className="mt-6 inline-flex rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14]"
                  >
                    Open team →
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">
              <p className="text-zinc-400">
                No DCC teams are currently available to this
                account.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] p-7">
          <p className="text-sm font-semibold text-amber-400">
            Match administration
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            Match Review Queue
          </h2>

          <p className="mt-3 max-w-3xl leading-7 text-zinc-300">
            Review imported NV Play matches, inspect validation
            issues, and approve or reject imports before they are
            published to DCC canonical match data.
          </p>

          <Link
            href="/portal/imports"
            className="mt-6 inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Open Match Review Queue
          </Link>
        </section>
      </div>
    </main>
  );
}