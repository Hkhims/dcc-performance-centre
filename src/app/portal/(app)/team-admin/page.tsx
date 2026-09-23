
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PortalAccess = {
  account_role: "User" | "Super Admin";
  account_status: "Invited" | "Active" | "Disabled";
  team_ids: string[];
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

  const managedTeams = (teams ?? []).filter(
    (team) =>
      isSuperAdmin || access.team_ids.includes(team.team_id),
  );

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">
      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] p-7">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
          DCC Administration
        </p>

        <h1 className="mt-3 text-3xl font-bold">
          Team Admin Dashboard
        </h1>

        <p className="mt-4 max-w-3xl leading-7 text-zinc-300">
          Manage your DCC teams and access the existing match
          review workflow.
        </p>

        <Link
          href="/portal/imports"
          className="mt-6 inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          Open Match Reviews
        </Link>
      </section>
    </main>
  );
}