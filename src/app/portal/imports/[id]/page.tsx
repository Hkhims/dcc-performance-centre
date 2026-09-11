import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReviewActions from "./ReviewActions";
import MatchSummaryCorrections from "./MatchSummaryCorrections";

type PortalAccess = {
  user_id: string;
  player_id: string | null;
  account_role: "Player" | "Super Admin";
  account_status: "Invited" | "Active" | "Disabled";
  display_name: string | null;
  team_ids: string[];
};

type MatchImport = {
  id: number;
  external_match_id: number;
  validation_status: "Clean" | "Review Required" | "Blocked";
  import_status:
    | "Imported"
    | "Needs Review"
    | "Approved"
    | "Rejected"
    | "Superseded";
  parsed_payload: ParsedPayload;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  review_notes: string | null;
};

type ExternalMatch = {
  id: number;
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

type ParsedPayload = {
  parser_version?: number;
  match?: {
    season?: number;
    away_team?: string;
    home_team?: string;
    match_date?: string;
    is_complete?: boolean;
    result_text?: string;
    dcc_team_ids?: string[];
    match_status?: string;
    special_case?: string | null;
    competition_id?: string;
    competition_name?: string;
    external_competition_id?: string;
  };
  validation?: {
    status?: string;
    issues?: unknown[];
  };
  publication_policy?: {
    mode?: string;
    season?: number;
    canonical_tables_protected?: string[];
    canonical_overwrite_allowed?: boolean;
  };
  team_entries?: TeamEntry[];
  player_performances?: PlayerPerformance[];
};

type TeamEntry = {
  result?: string;
  team_id?: string;
  dcc_balls?: number | null;
  dcc_score?: number | null;
  dcc_wickets?: number | null;
  revised_overs?: number | null;
  competition_id?: string;
  opponent_balls?: number | null;
  opponent_score?: number | null;
  scheduled_overs?: number | null;
  opponent_wickets?: number | null;
  opponent_display_name?: string;
};

type PlayerPerformance = {
  runs?: number | null;
  fours?: number | null;
  sixes?: number | null;
  wides?: number | null;
  batted?: boolean;
  bowled?: boolean;
  catches?: number | null;
  maidens?: number | null;
  team_id?: string;
  wickets?: number | null;
  no_balls?: number | null;
  run_outs?: number | null;
  player_id?: string;
  stumpings?: number | null;
  is_not_out?: boolean | null;
  balls_faced?: number | null;
  bowling_balls?: number | null;
  runs_conceded?: number | null;
  dismissal_type?: string | null;
  batting_position?: number | null;
  external_player_name?: string;
  parser_notes?: unknown[];
};

type Correction = {
  id: number;
  match_import_id: number;
  entity_type: string;
  entity_key: string;
  field_name: string;
  original_value: unknown;
  corrected_value: unknown;
  reason: string;
  status: string;
  created_at: string;
  superseded_by: number | null;
  superseded_at: string | null;
  json_path: string[] | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unavailable";

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

function ballsToOvers(balls: number | null | undefined) {
  if (balls === null || balls === undefined) {
    return "—";
  }

  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function scoreText(
  score: number | null | undefined,
  wickets: number | null | undefined,
) {
  if (score === null || score === undefined) {
    return "—";
  }

  if (wickets === null || wickets === undefined) {
    return String(score);
  }

  return `${score}/${wickets}`;
}

function valueText(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function teamDisplayName(teamId: string | null | undefined) {
  switch (teamId) {
    case "T01":
      return "DCC 1";
    case "T02":
      return "DCC 2";
    case "T03":
      return "DCC 3";
    case "T04":
      return "DCC 4";
    case "T05":
      return "Midweek 1";
    case "T06":
      return "Midweek 2";
    default:
      return teamId ?? "Unavailable";
  }
}

function validationClasses(
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

export default async function MatchReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const importId = Number(id);

  if (!Number.isInteger(importId) || importId <= 0) {
    notFound();
  }

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

  const { data: importData, error: importError } =
    await supabase
      .from("match_imports")
      .select(
        `
          id,
          external_match_id,
          validation_status,
          import_status,
          parsed_payload,
          created_at,
          updated_at,
          reviewed_at,
          approved_at,
          review_notes
        `,
      )
      .eq("id", importId)
      .maybeSingle();

  if (importError) {
    throw new Error(
      `Unable to load match import: ${importError.message}`,
    );
  }

  if (!importData) {
    notFound();
  }

  const matchImport = importData as MatchImport;

  const { data: latestImportData, error: latestImportError } =
    await supabase
      .from("match_imports")
      .select("id, created_at")
      .eq("external_match_id", matchImport.external_match_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestImportError) {
    throw new Error(
      `Unable to determine latest import: ${latestImportError.message}`,
    );
  }

  const isLatestImport =
    Number(latestImportData?.id) === matchImport.id;

  const { data: externalMatchData, error: externalMatchError } =
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
      .eq("id", matchImport.external_match_id)
      .maybeSingle();

  if (externalMatchError) {
    throw new Error(
      `Unable to load external match: ${externalMatchError.message}`,
    );
  }

  const externalMatch =
    (externalMatchData ?? null) as ExternalMatch | null;

  const { data: correctionData, error: correctionError } =
    await supabase
      .from("match_import_corrections")
      .select(
        `
          id,
          match_import_id,
          entity_type,
          entity_key,
          field_name,
          original_value,
          corrected_value,
          reason,
          status,
          created_at,
          superseded_by,
          superseded_at,
          json_path
        `,
      )
      .eq("match_import_id", matchImport.id)
      .order("created_at", { ascending: true });

  if (correctionError) {
    throw new Error(
      `Unable to load match corrections: ${correctionError.message}`,
    );
  }

  const corrections = (correctionData ?? []) as Correction[];

  const payload = matchImport.parsed_payload ?? {};
  const match = payload.match ?? {};
  const validation = payload.validation ?? {};
  const publicationPolicy =
    payload.publication_policy ?? {};
  const teamEntries = payload.team_entries ?? [];
  const performances = payload.player_performances ?? [];

  const batting = performances
    .filter((player) => player.batted)
    .sort(
      (a, b) =>
        (a.batting_position ?? 999) -
        (b.batting_position ?? 999),
    );

  const bowling = performances.filter(
    (player) => player.bowled,
  );

  const fielding = performances.filter(
    (player) =>
      (player.catches ?? 0) > 0 ||
      (player.stumpings ?? 0) > 0 ||
      (player.run_outs ?? 0) > 0,
  );

  const validationIssues = Array.isArray(validation.issues)
    ? validation.issues
    : [];

  const homeTeam =
    match.home_team ??
    externalMatch?.external_home_team_name ??
    "Unknown home team";

  const awayTeam =
    match.away_team ??
    externalMatch?.external_away_team_name ??
    "Unknown away team";

  return (
    <main className="min-h-screen bg-[#05070d] px-4 py-10 text-white sm:px-6">
      <div className="w-full">
        <header className="border-b border-white/10 pb-8">
          <Link
            href="/portal/imports"
            className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"
          >
            ← Back to Match Review Queue
          </Link>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${validationClasses(
                    matchImport.validation_status,
                  )}`}
                >
                  {matchImport.validation_status}
                </span>

                <span className="rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-3 py-1 text-xs font-semibold text-sky-300">
                  {matchImport.import_status}
                </span>

                {!isLatestImport ? (
                  <span className="rounded-full border border-red-400/25 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-300">
                    Older import
                  </span>
                ) : null}

                {externalMatch?.import_status ===
                "Changed Upstream" ? (
                  <span className="rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-300">
                    Changed upstream
                  </span>
                ) : null}
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                {homeTeam}
                <span className="mx-2 font-normal text-zinc-600">
                  vs
                </span>
                {awayTeam}
              </h1>

              <p className="mt-3 text-zinc-400">
                {match.competition_name ??
                  externalMatch?.external_competition_name ??
                  "Competition unavailable"}
              </p>

              {match.result_text ? (
                <p className="mt-2 text-lg font-medium text-zinc-200">
                  {match.result_text}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 text-sm text-zinc-400 lg:text-right">
              <p>{formatDate(match.match_date)}</p>
              <p className="mt-1">
                Import #{matchImport.id}
              </p>
              <p className="mt-1">
                Parser v{payload.parser_version ?? "—"}
              </p>
            </div>
          </div>
        </header>

        {!isLatestImport ? (
          <section className="mt-8 rounded-2xl border border-red-400/25 bg-red-400/[0.07] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-300">
              Stale import warning
            </p>
            <p className="mt-3 max-w-4xl leading-7 text-zinc-300">
              This is not the latest import for this NV Play
              match. It is being shown for audit/history only and
              must not be treated as the current review candidate.
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Match status
            </p>
            <p className="mt-2 text-lg font-semibold">
              {match.match_status ??
                externalMatch?.match_status ??
                "Unavailable"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              DCC team
            </p>
            <p className="mt-2 text-lg font-semibold">
              {match.dcc_team_ids?.length
                ? match.dcc_team_ids
                    .map((teamId) =>
                      teamDisplayName(teamId),
                    )
                    .join(", ")
                : "Unavailable"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Source
            </p>
            <p className="mt-2 text-lg font-semibold">
              {externalMatch?.provider ?? "NV Play"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Imported
            </p>
            <p className="mt-2 text-lg font-semibold">
              {formatDateTime(matchImport.created_at)}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <p className="text-sm font-semibold text-amber-400">
            Validation
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            {validation.status ??
              matchImport.validation_status}
          </h2>

          {validationIssues.length === 0 ? (
            <p className="mt-4 text-zinc-400">
              No validation issues were recorded by the parser.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {validationIssues.map((issue, index) => (
                <li
                  key={index}
                  className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-4 text-sm leading-6 text-zinc-300"
                >
                  {valueText(issue)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-bold">
            Match summary
          </h2>

          <div className="mt-4 grid gap-4">
            {teamEntries.map((entry, index) => (
              <div
                key={`${entry.team_id ?? "team"}-${index}`}
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"
              >
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                      Team
                    </p>
                    <p className="mt-1 font-semibold">
                      {teamDisplayName(entry.team_id)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                      Result
                    </p>
                    <p className="mt-1 font-semibold">
                      {entry.result ?? "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                      DCC
                    </p>
                    <p className="mt-1 font-semibold">
                      {scoreText(
                        entry.dcc_score,
                        entry.dcc_wickets,
                      )}{" "}
                      ({ballsToOvers(entry.dcc_balls)} ov)
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                      Opponent
                    </p>
                    <p className="mt-1 font-semibold">
                      {scoreText(
                        entry.opponent_score,
                        entry.opponent_wickets,
                      )}{" "}
                      ({ballsToOvers(entry.opponent_balls)} ov)
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                      Scheduled
                    </p>
                    <p className="mt-1 font-semibold">
                      {entry.scheduled_overs ?? "—"} overs
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <MatchSummaryCorrections
          matchImportId={matchImport.id}
          teamEntries={teamEntries}
          corrections={corrections}
          isLatestImport={isLatestImport}
          importStatus={matchImport.import_status}
        />

        <section className="mt-10">
          <h2 className="text-2xl font-bold">
            Batting
          </h2>

          {batting.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-zinc-400">
              No DCC batting innings was recorded in the source.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Pos</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Dismissal</th>
                    <th className="px-4 py-3 text-right">R</th>
                    <th className="px-4 py-3 text-right">B</th>
                    <th className="px-4 py-3 text-right">4s</th>
                    <th className="px-4 py-3 text-right">6s</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {batting.map((player, index) => (
                    <tr
                      key={
                        player.player_id ??
                        `${player.external_player_name ?? "player"}-${index}`
                      }
                    >
                      <td className="px-4 py-3 text-zinc-500">
                        {player.batting_position ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-white">
                        {player.external_player_name ??
                          "Unknown player"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {player.dismissal_type ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {player.runs ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.balls_faced ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.fours ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.sixes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold">
            Bowling
          </h2>

          {bowling.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-zinc-400">
              No DCC bowling figures were recorded in the source.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3 text-right">O</th>
                    <th className="px-4 py-3 text-right">M</th>
                    <th className="px-4 py-3 text-right">R</th>
                    <th className="px-4 py-3 text-right">W</th>
                    <th className="px-4 py-3 text-right">Wd</th>
                    <th className="px-4 py-3 text-right">NB</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {bowling.map((player, index) => (
                    <tr
                      key={
                        player.player_id ??
                        `${player.external_player_name ?? "player"}-${index}`
                      }
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        {player.external_player_name ??
                          "Unknown player"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {ballsToOvers(player.bowling_balls)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.maidens ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.runs_conceded ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {player.wickets ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.wides ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.no_balls ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold">
            Fielding
          </h2>

          {fielding.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-zinc-400">
              No fielding credits were recorded in this import.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3 text-right">
                      Catches
                    </th>
                    <th className="px-4 py-3 text-right">
                      Stumpings
                    </th>
                    <th className="px-4 py-3 text-right">
                      Run outs
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {fielding.map((player, index) => (
                    <tr
                      key={
                        player.player_id ??
                        `${player.external_player_name ?? "player"}-${index}`
                      }
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        {player.external_player_name ??
                          "Unknown player"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.catches ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.stumpings ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {player.run_outs ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <ReviewActions
          matchImportId={matchImport.id}
          validationStatus={matchImport.validation_status}
          importStatus={matchImport.import_status}
          isLatestImport={isLatestImport}
        />

        <section className="mt-10">
          <h2 className="text-2xl font-bold">
            Corrections
          </h2>

          {corrections.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-zinc-400">
              No corrections have been recorded for this import.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {corrections.map((correction) => (
                <article
                  key={correction.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1 text-xs font-semibold text-amber-300">
                      {correction.status}
                    </span>

                    <span className="font-mono text-xs text-zinc-600">
                      Correction #{correction.id}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-semibold">
                    {correction.entity_type} ·{" "}
                    {correction.entity_key} ·{" "}
                    {correction.field_name}
                  </h3>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                        Original
                      </p>
                      <p className="mt-1 break-words text-sm text-zinc-400">
                        {valueText(correction.original_value)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">
                        Corrected
                      </p>
                      <p className="mt-1 break-words text-sm text-zinc-200">
                        {valueText(correction.corrected_value)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-zinc-400">
                    {correction.reason}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold">
            Publication policy
          </h2>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm font-semibold text-amber-400">
              {publicationPolicy.mode ?? "Unavailable"}
            </p>

            <div className="mt-4 space-y-2 text-sm text-zinc-400">
              <p>
                Canonical overwrite allowed:{" "}
                <span className="font-medium text-zinc-200">
                  {publicationPolicy.canonical_overwrite_allowed
                    ? "Yes"
                    : "No"}
                </span>
              </p>

              {publicationPolicy.canonical_tables_protected
                ?.length ? (
                <p>
                  Protected tables:{" "}
                  <span className="text-zinc-300">
                    {publicationPolicy.canonical_tables_protected.join(
                      ", ",
                    )}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-10 border-t border-white/10 py-8 text-sm text-zinc-500">
          <p>
            This page is read-only except for explicit review actions.
            Approval or rejection is performed only through audited
            backend functions with DCC permission checks.
          </p>
        </section>
      </div>
    </main>
  );
}