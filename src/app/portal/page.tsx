import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PortalAccess = {
  user_id: string;
  player_id: string | null;
  account_role: "Player" | "Super Admin";
  account_status: "Invited" | "Active" | "Disabled";
  display_name: string | null;
  team_ids: string[];
};

export default async function PortalPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
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
    return (
      <main className="min-h-screen bg-[#05070d] px-6 py-16 text-white">
        <div className="w-full">
          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
              DCC Portal
            </p>

            <h1 className="mt-3 text-3xl font-bold">
              Account not active
            </h1>

            <p className="mt-4 max-w-2xl text-zinc-300">
              Your sign-in is valid, but there is no active DCC
              Portal account linked to it yet.
            </p>

            <form
              action="/portal/logout"
              method="post"
              className="mt-7"
            >
              <button
                type="submit"
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Sign out
              </button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  const isSuperAdmin =
    access.account_role === "Super Admin";

  const hasCaptainAccess =
    access.team_ids.length > 0;

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">
      <div className="w-full">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
              Dunmurry Cricket Club
            </p>

            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              DCC Portal
            </h1>

            <p className="mt-3 text-zinc-400">
              Welcome
              {access.display_name
                ? `, ${access.display_name}`
                : ""}
              .
            </p>
          </div>

          <form action="/portal/logout" method="post">
            <button
              type="submit"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Account
            </p>

            <p className="mt-3 text-xl font-semibold">
              {access.account_role}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Team access
            </p>

            <p className="mt-3 text-xl font-semibold">
              {isSuperAdmin
                ? "All DCC teams"
                : hasCaptainAccess
                  ? access.team_ids.join(", ")
                  : "Player access"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Player link
            </p>

            <p className="mt-3 text-xl font-semibold">
              {access.player_id ?? "Not linked"}
            </p>
          </div>
        </section>

        {isSuperAdmin || hasCaptainAccess ? (
          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] p-7">
            <p className="text-sm font-semibold text-amber-400">
              Match administration
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Match Review Queue
            </h2>

            <p className="mt-3 max-w-3xl leading-7 text-zinc-300">
              Review imported matches, inspect validation issues,
              and approve or reject the latest import before it
              is published to DCC canonical match data.
            </p>

            <Link
              href="/portal/imports"
              className="mt-6 inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300"
            >
              Open Match Review Queue
            </Link>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">
            <h2 className="text-2xl font-bold">
              Player Portal
            </h2>

            <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
              Your DCC player account is active. Player-facing
              Portal features will appear here as they are added.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}