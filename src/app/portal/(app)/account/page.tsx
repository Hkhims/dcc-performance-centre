import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PortalAccess = {
  player_id: string | null;
  account_role: "User" | "Super Admin";
  account_status: "Invited" | "Active" | "Disabled";
  display_name: string | null;
  team_ids: string[];
};

export default async function AccountPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_my_portal_access",
  );

  if (error) {
    throw new Error(
      `Unable to load account details: ${error.message}`,
    );
  }

  const access = (data?.[0] ?? null) as PortalAccess | null;

  if (!access || access.account_status !== "Active") {
    redirect("/portal");
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
        DCC App
      </p>

      <h1 className="mt-3 text-4xl font-bold tracking-tight">
        Account
      </h1>

      <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
        Manage your DCC account and player-profile connection.
      </p>

      <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-7">
        <h2 className="text-2xl font-bold">
          Your account
        </h2>

        <dl className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-zinc-400">
              Name
            </dt>
            <dd className="mt-1 font-semibold">
              {access.display_name ?? "Not provided"}
            </dd>
          </div>

          <div>
            <dt className="text-sm text-zinc-400">
              Account role
            </dt>
            <dd className="mt-1 font-semibold">
              {access.account_role}
            </dd>
          </div>

          <div>
            <dt className="text-sm text-zinc-400">
              Account status
            </dt>
            <dd className="mt-1 font-semibold">
              {access.account_status}
            </dd>
          </div>

          <div>
            <dt className="text-sm text-zinc-400">
              Player profile
            </dt>
            <dd className="mt-1 font-semibold">
              {access.player_id ?? "Not linked"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-7">
        <h2 className="text-2xl font-bold">
          Player profile connection
        </h2>

        {access.player_id ? (
          <p className="mt-3 leading-7 text-zinc-400">
            Your DCC account is linked to player profile{" "}
            <span className="font-semibold text-white">
              {access.player_id}
            </span>
            . You can access your personal cricket features
            through My Cricket.
          </p>
        ) : (
          <>
            <p className="mt-3 max-w-2xl leading-7 text-zinc-400">
              Your account is not currently linked to a DCC
              player profile. If you have an existing player
              profile, you can submit a claim for
              administrator approval.
            </p>

            <Link
              href="/portal/claim-player"
              className="mt-6 inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300"
            >
              Claim my player profile
            </Link>
          </>
        )}
      </section>

      <form
        action="/portal/logout"
        method="post"
        className="mt-8"
      >
        <button
          type="submit"
          className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white/10"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}