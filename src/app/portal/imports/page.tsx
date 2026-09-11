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

type MatchImport = {
  id: string;
  external_match_id: string;
  validation_status: "Clean" | "Review Required" | "Blocked";
  import_status:
    | "Imported"
    | "Needs Review"
    | "Approved"
    | "Rejected"
    | "Superseded";
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
};

type ExternalMatch = {
  id: string;
  provider: string;
  external_match_id: string;
  season: number;
  external_competition_name: string | null;
  external_home_team_name: string | null;
  external_away_team_name: string | null;
  start_datetime: string | null;
  match_status: string | null;
  is_complete: boolean | null;
  import_status:
    | "Detected"
    | "Imported"
    | "Needs Review"
    | "Approved"
    | "Changed Upstream"
    | "Rejected";
};

type QueueItem = {
  matchImport: MatchImport;
  externalMatch: ExternalMatch | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getValidationClasses(
  status: MatchImport["validation_status"],
) {
  if (status === "Clean") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  }

  if (status === "Blocked") {
    return "border-red-400/25 bg-red-400/10 text-red-300";
  }

  return "border-amber-400/25 bg-amber-400/10 text-amber-300";
}

function getImportClasses(
  status: MatchImport["import_status"],
) {
  if (status === "Needs Review") {
    return "border-amber-400/20 bg-amber-400/[0.08] text-amber-300";
  }

  return "border-sky-400/20 bg-sky-400/[0.08] text-sky-300";
}

export default async function MatchReviewQueuePage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
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

  const hasCaptainAccess =
    access.team_ids.length > 0;

  if (!isSuperAdmin && !hasCaptainAccess) {
    redirect("/portal");
  }

  /*
   * Fetch every import visible to this authenticated user.
   *
   * Supabase RLS decides which rows the account is allowed to
   * see. We deliberately do not reproduce team permissions in
   * application code.
   *
   * We fetch all statuses first because we need to identify the
   * genuine latest import for each external match. Filtering to
   * pending statuses before doing that could accidentally surface
   * an older stale import.
   */
  const { data: importData, error: importsError } =
    await supabase
      .from("match_imports")
      .select(
        `
          id,
          external_match_id,
          validation_status,
          import_status,
          created_at,
          updated_at,
          reviewed_at,
          approved_at
        `,
      )
      .order("created_at", {
        ascending: false,
      });

  if (importsError) {
    throw new Error(
      `Unable to load match imports: ${importsError.message}`,
    );
  }

  const imports = (importData ?? []) as MatchImport[];

  /*
   * Because imports are ordered newest-first, the first row we
   * encounter for each external match is its current/latest import.
   */
  const latestImportByExternalMatch =
    new Map<string, MatchImport>();

  for (const matchImport of imports) {
    if (
      !latestImportByExternalMatch.has(
        matchImport.external_match_id,
      )
    ) {
      latestImportByExternalMatch.set(
        matchImport.external_match_id,
        matchImport,
      );
    }
  }

  const pendingImports = Array.from(
    latestImportByExternalMatch.values(),
  ).filter(
    (matchImport) =>
      matchImport.import_status === "Imported" ||
      matchImport.import_status === "Needs Review",
  );

  const externalMatchIds = pendingImports.map(
    (matchImport) => matchImport.external_match_id,
  );

  let externalMatches: ExternalMatch[] = [];

  if (externalMatchIds.length > 0) {
    const { data: externalMatchData, error: externalMatchesError } =
      await supabase
        .from("external_matches")
        .select(
          `
            id,
            provider,
            external_match_id,
            season,
            external_competition_name,
            external_home_team_name,
            external_away_team_name,
            start_datetime,
            match_status,
            is_complete,
            import_status
          `,
        )
        .in("id", externalMatchIds);

    if (externalMatchesError) {
      throw new Error(
        `Unable to load external matches: ${externalMatchesError.message}`,
      );
    }

    externalMatches =
      (externalMatchData ?? []) as ExternalMatch[];
  }

  const externalMatchById = new Map(
    externalMatches.map((match) => [match.id, match]),
  );

  const queueItems: QueueItem[] = pendingImports
    .map((matchImport) => ({
      matchImport,
      externalMatch:
        externalMatchById.get(
          matchImport.external_match_id,
        ) ?? null,
    }))
    .sort((a, b) => {
      const aDate =
        a.externalMatch?.start_datetime ??
        a.matchImport.created_at;

      const bDate =
        b.externalMatch?.start_datetime ??
        b.matchImport.created_at;

      return (
        new Date(bDate).getTime() -
        new Date(aDate).getTime()
      );
    });

  const reviewRequiredCount = queueItems.filter(
    ({ matchImport }) =>
      matchImport.validation_status === "Review Required",
  ).length;

  const blockedCount = queueItems.filter(
    ({ matchImport }) =>
      matchImport.validation_status === "Blocked",
  ).length;

  const cleanCount = queueItems.filter(
    ({ matchImport }) =>
      matchImport.validation_status === "Clean",
  ).length;

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
                Match administration
              </p>

              <h1 className="mt-2 text-4xl font-bold tracking-tight">
                Match Review Queue
              </h1>

              <p className="mt-3 max-w-3xl leading-7 text-zinc-400">
                Review the latest NV Play import for each match
                before anything is published to DCC canonical
                statistics.
              </p>
            </div>

            <div className="text-sm text-zinc-500">
              {isSuperAdmin
                ? "Super Admin · All DCC teams"
                : `Captain · ${access.team_ids.join(", ")}`}
            </div>
          </div>
        </header>

        <section className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Awaiting review
            </p>

            <p className="mt-2 text-3xl font-bold">
              {queueItems.length}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.045] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400/70">
              Clean
            </p>

            <p className="mt-2 text-3xl font-bold">
              {cleanCount}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/70">
              Review required
            </p>

            <p className="mt-2 text-3xl font-bold">
              {reviewRequiredCount}
            </p>
          </div>

          <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.045] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-400/70">
              Blocked
            </p>

            <p className="mt-2 text-3xl font-bold">
              {blockedCount}
            </p>
          </div>
        </section>

        {queueItems.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-8">
            <p className="text-sm font-semibold text-emerald-300">
              Queue clear
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              No matches are waiting for review.
            </h2>

            <p className="mt-3 max-w-2xl leading-7 text-zinc-400">
              When the NV Play importer creates a new match import
              that requires DCC review, it will appear here.
            </p>
          </section>
        ) : (
          <section className="space-y-4 pb-12">
            {queueItems.map(
              ({ matchImport, externalMatch }) => {
                const homeTeam =
                  externalMatch?.external_home_team_name ??
                  "Unknown home team";

                const awayTeam =
                  externalMatch?.external_away_team_name ??
                  "Unknown away team";

                const changedUpstream =
                  externalMatch?.import_status ===
                  "Changed Upstream";

                return (
                  <article
                    key={matchImport.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:border-white/20"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${getValidationClasses(
                              matchImport.validation_status,
                            )}`}
                          >
                            {matchImport.validation_status}
                          </span>

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${getImportClasses(
                              matchImport.import_status,
                            )}`}
                          >
                            {matchImport.import_status}
                          </span>

                          {changedUpstream ? (
                            <span className="rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-300">
                              Changed upstream
                            </span>
                          ) : null}
                        </div>

                        <h2 className="mt-4 text-xl font-bold sm:text-2xl">
                          {homeTeam}
                          <span className="mx-2 font-normal text-zinc-600">
                            vs
                          </span>
                          {awayTeam}
                        </h2>

                        <p className="mt-2 text-sm text-zinc-400">
                          {externalMatch?.external_competition_name ??
                            "Competition unavailable"}
                        </p>
                      </div>

                      <div className="shrink-0 text-left lg:text-right">
                        <p className="text-sm font-medium text-zinc-300">
                          {formatDateTime(
                            externalMatch?.start_datetime ??
                              null,
                          )}
                        </p>

                        <p className="mt-1 text-xs text-zinc-600">
                          Imported{" "}
                          {formatDateTime(
                            matchImport.created_at,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-3 border-t border-white/10 pt-5 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                          Provider
                        </p>

                        <p className="mt-1 text-zinc-300">
                          {externalMatch?.provider ??
                            "NV Play"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                          Match status
                        </p>

                        <p className="mt-1 text-zinc-300">
                          {externalMatch?.match_status ??
                            "Unavailable"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                          Import ID
                        </p>

                        <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                          {matchImport.id}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5">
                      <Link
                        href={`/portal/imports/${matchImport.id}`}
                        className="inline-flex rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14]"
                      >
                        Review match →
                      </Link>
                    </div>
                  </article>
                );
              },
            )}
          </section>
        )}
      </div>
    </main>
  );
}
