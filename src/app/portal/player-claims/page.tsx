import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClaimReviewActions from "./ClaimReviewActions";

type PortalAccess = {
  account_role: "User" | "Super Admin";
  account_status: "Invited" | "Active" | "Disabled";
};

type Claim = {
  claim_id: number;
  user_id: string;
  player_id: string;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  requested_at: string;
};

type UserProfile = {
  user_id: string;
  display_name: string | null;
};

type Player = {
  player_id: string;
  player_name: string;
};

export default async function PlayerClaimsPage() {
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

  if (
    !access ||
    access.account_status !== "Active" ||
    access.account_role !== "Super Admin"
  ) {
    redirect("/portal");
  }

  const { data: claimData, error: claimError } = await supabase
    .from("player_profile_claims")
    .select("claim_id, user_id, player_id, status, requested_at")
    .eq("status", "Pending")
    .order("requested_at", { ascending: true });

  if (claimError) {
    throw new Error(
      `Unable to load player-profile claims: ${claimError.message}`,
    );
  }

  const claims = (claimData ?? []) as Claim[];

  const userIds = [...new Set(claims.map((claim) => claim.user_id))];
  const playerIds = [
    ...new Set(claims.map((claim) => claim.player_id)),
  ];

  let userProfiles: UserProfile[] = [];
  let players: Player[] = [];

  if (userIds.length) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);

    if (error) {
      throw new Error(
        `Unable to load claimants: ${error.message}`,
      );
    }

    userProfiles = (data ?? []) as UserProfile[];
  }

  if (playerIds.length) {
    const { data, error } = await supabase
      .from("players")
      .select("player_id, player_name")
      .in("player_id", playerIds);

    if (error) {
      throw new Error(
        `Unable to load claimed players: ${error.message}`,
      );
    }

    players = (data ?? []) as Player[];
  }

  const userNameById = new Map(
    userProfiles.map((profile) => [
      profile.user_id,
      profile.display_name,
    ]),
  );

  const playerNameById = new Map(
    players.map((player) => [
      player.player_id,
      player.player_name,
    ]),
  );

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">
      <div className="w-full">
        <Link
          href="/portal"
          className="text-sm font-medium text-amber-400 transition hover:text-amber-300"
        >
          ← Back to DCC Portal
        </Link>

        <header className="mt-6 border-b border-white/10 pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
            Super Admin
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            Player Profile Claims
          </h1>

          <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
            Review requests from DCC account holders who want to link
            their account to an existing player profile.
          </p>
        </header>

        <section className="py-8">
          {claims.length ? (
            <div className="grid gap-5">
              {claims.map((claim) => (
                <article
                  key={claim.claim_id}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"
                >
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Account
                      </p>
                      <p className="mt-2 font-semibold">
                        {userNameById.get(claim.user_id) ??
                          "Unnamed DCC account"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Requested player
                      </p>
                      <p className="mt-2 font-semibold">
                        {playerNameById.get(claim.player_id) ??
                          claim.player_id}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Requested
                      </p>
                      <p className="mt-2 text-zinc-300">
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Europe/London",
                        }).format(new Date(claim.requested_at))}
                      </p>
                    </div>
                  </div>

                  <ClaimReviewActions claimId={claim.claim_id} />
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8">
              <h2 className="text-xl font-semibold">
                No pending claims
              </h2>

              <p className="mt-2 text-zinc-400">
                There are currently no player-profile claims waiting
                for review.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
