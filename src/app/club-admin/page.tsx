import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import ClubAdminDashboard from "./ClubAdminDashboard";
import PasswordField from "./PasswordField";
import {
  isClubAdminAuthenticated,
} from "./auth";

export const metadata: Metadata = {
  title: "Club Admin",
  description:
    "Private Dunmurry Cricket Club administration dashboard.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ClubAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  const { error } = await searchParams;

  const isAuthenticated =
    await isClubAdminAuthenticated();

  // --------------------------------------------------
  // LOGIN SCREEN
  // --------------------------------------------------

  if (!isAuthenticated) {
    return (
      <section className="flex min-h-[70vh] items-center px-6 py-16">
        <div className="mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#13223a] via-[#0b1728] to-[#07101d]">
            <div className="p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d4af37]">
                Dunmurry Cricket Club
              </p>

              <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                Club Admin
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-400">
                This area is restricted to
                authorised club officials.
              </p>

              <form
                action="/club-admin/login"
                method="post"
                className="mt-8"
              >
                <label
                  htmlFor="password"
                  className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500"
                >
                  Password
                </label>

                <PasswordField />

                {error ===
                  "invalid-password" && (
                  <div className="mt-4 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3">
                    <p className="text-sm font-semibold text-red-400">
                      Incorrect password.
                      Please try again.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  className="mt-5 w-full rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#d4af37] transition hover:bg-[#d4af37]/15"
                >
                  Enter Club Admin
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // --------------------------------------------------
  // FETCH DATA
  // --------------------------------------------------

  const [
    playersResponse,
    performancesResponse,
    teamsResponse,
  ] = await Promise.all([
    supabase
      .from("players")
      .select(`
        player_id,
        player_name
      `)
      .order("player_name", {
        ascending: true,
      }),

    supabase
      .from(
        "player_match_performances",
      )
      .select(`
        player_id,
        source_match_id,
        team_id
      `),

    supabase
      .from("teams")
      .select(`
        team_id,
        team_name,
        display_order
      `)
      .order("display_order", {
        ascending: true,
      }),
  ]);

  if (playersResponse.error) {
    throw new Error(
      playersResponse.error.message,
    );
  }

  if (performancesResponse.error) {
    throw new Error(
      performancesResponse.error.message,
    );
  }

  if (teamsResponse.error) {
    throw new Error(
      teamsResponse.error.message,
    );
  }

  const players =
    playersResponse.data ?? [];

  const performances =
    performancesResponse.data ?? [];

  const teams =
    teamsResponse.data ?? [];

  // --------------------------------------------------
  // CALCULATE PLAYER APPEARANCES
  // --------------------------------------------------

  const adminPlayers = players
    .map((player) => {
      const playerPerformances =
        performances.filter(
          (performance) =>
            performance.player_id ===
            player.player_id,
        );

      const allMatches =
        new Set<string>();

      const teamMatchSets =
        new Map<
          string,
          Set<string>
        >();

      for (
        const performance of
        playerPerformances
      ) {
        const matchKey =
          `${performance.source_match_id}__${performance.team_id}`;

        allMatches.add(matchKey);

        if (
          !teamMatchSets.has(
            performance.team_id,
          )
        ) {
          teamMatchSets.set(
            performance.team_id,
            new Set<string>(),
          );
        }

        teamMatchSets
          .get(
            performance.team_id,
          )!
          .add(
            performance.source_match_id,
          );
      }

      const teamMatches: Record<
        string,
        number
      > = {};

      for (const team of teams) {
        teamMatches[
          team.team_id
        ] =
          teamMatchSets.get(
            team.team_id,
          )?.size ?? 0;
      }

      return {
        player_id:
          player.player_id,
        player_name:
          player.player_name,
        total_matches:
          allMatches.size,
        team_matches:
          teamMatches,
      };
    })
    .sort((a, b) =>
      a.player_name.localeCompare(
        b.player_name,
        "en-GB",
        {
          sensitivity: "base",
        },
      ),
    );

  // --------------------------------------------------
  // DASHBOARD
  // --------------------------------------------------

  return (
    <section className="px-4 py-8 sm:px-6 lg:py-10">
      <div className="site-container">
        {/* HERO */}

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#13223a] via-[#0b1728] to-[#07101d]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(212,175,55,0.11),transparent_34%)]" />

          <div className="relative px-6 py-8 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d4af37]">
                  Private Club Area
                </p>

                <h1 className="mt-3 text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">
                  Player Appearances
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                  2026 player participation
                  across all Dunmurry
                  Cricket Club teams and
                  competitions.
                </p>
              </div>

              <form
                action="/club-admin/logout"
                method="post"
              >
                <button
                  type="submit"
                  className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400 transition hover:border-white/20 hover:text-white"
                >
                  Log out
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* SUMMARY */}

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Registered Players
            </p>

            <p className="mt-2 text-3xl font-black text-white">
              {
                adminPlayers.length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Season
            </p>

            <p className="mt-2 text-3xl font-black text-white">
              2026
            </p>
          </div>
        </section>

        <ClubAdminDashboard
          players={adminPlayers}
          teams={teams}
        />
      </div>
    </section>
  );
}