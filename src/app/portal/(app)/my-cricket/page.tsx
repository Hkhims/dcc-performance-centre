import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PortalAccess = {
  player_id: string | null;
  account_status: "Invited" | "Active" | "Disabled";
};

export default async function MyCricketPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_my_portal_access",
  );

  if (error) {
    throw new Error(
      `Unable to load player access: ${error.message}`,
    );
  }

  const access = (data?.[0] ?? null) as PortalAccess | null;

  if (
    !access ||
    access.account_status !== "Active" ||
    !access.player_id
  ) {
    redirect("/portal");
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
        DCC App
      </p>

      <h1 className="mt-3 text-4xl font-bold tracking-tight">
        My Cricket
      </h1>

      <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
        Your personal cricket space at Dunmurry Cricket Club.
      </p>

      <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-7">
        <h2 className="text-2xl font-bold">
          Player dashboard
        </h2>

        <p className="mt-3 leading-7 text-zinc-400">
          Your player profile, match history and personal
          statistics will be brought together here.
        </p>
      </section>
    </main>
  );
}