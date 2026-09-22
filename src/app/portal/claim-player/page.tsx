import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClaimPlayerForm from "./ClaimPlayerForm";

type PortalAccess = {
  player_id: string | null;
  account_status: "Invited" | "Active" | "Disabled";
};

type PlayerClaim = {
  claim_id: number;
  player_id: string;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  requested_at: string;
};

export default async function ClaimPlayerPage() {
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

  if (access.player_id) {
    redirect("/portal");
  }

  const { data: claimData, error: claimError } = await supabase
    .from("player_profile_claims")
    .select("claim_id, player_id, status, requested_at")
    .eq("user_id", claimsData.claims.sub)
    .eq("status", "Pending")
    .maybeSingle();

  if (claimError) {
    throw new Error(
      `Unable to load player-profile claim: ${claimError.message}`,
    );
  }

  const pendingClaim = claimData as PlayerClaim | null;

  let pendingPlayerName: string | null = null;

  if (pendingClaim) {
    const { data: pendingPlayer, error: pendingPlayerError } =
      await supabase
        .from("players")
        .select("player_name")
        .eq("player_id", pendingClaim.player_id)
        .single();

    if (pendingPlayerError) {
      throw new Error(
        `Unable to load claimed player: ${pendingPlayerError.message}`,
      );
    }

    pendingPlayerName = pendingPlayer.player_name;
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("player_id, player_name")
    .order("player_name");

  if (playersError) {
    throw new Error(
      `Unable to load DCC players: ${playersError.message}`,
    );
  }

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/portal"
          className="text-sm font-medium text-amber-400 transition hover:text-amber-300"
        >
          ← Back to DCC Portal
        </Link>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-7 sm:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
            Dunmurry Cricket Club
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            Claim your DCC player profile
          </h1>

          {pendingClaim ? (
            <div className="mt-7 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] p-5">
              <p className="font-semibold text-amber-300">
                Claim awaiting review
              </p>

              <p className="mt-2 leading-7 text-zinc-300">
                You have requested to link your account to{" "}
                <span className="font-semibold text-white">
                  {pendingPlayerName ?? pendingClaim.player_id}
                </span>
                . A DCC administrator must approve the request before
                any player access is granted.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-3 leading-7 text-zinc-400">
                Find your existing DCC player profile below. Submitting
                a claim does not immediately link the profile to your
                account.
              </p>

              <ClaimPlayerForm players={players ?? []} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
