"use client";



import { useState, useTransition } from "react";

import {

  addPlayerToSelection,

  createMatchSelection,

  createMatchSelectionFromPrevious,

  moveSelectionPlayer,

  publishMatchSelection,

  removePlayerFromSelection,

  reopenMatchSelection,

  setSelectionCaptain,

  setSelectionPlayerCar,

  setSelectionPlayerRole,

  setSelectionWicketkeeper,

  type SelectionRole,

} from "./actions";



type PlayerRole =
  | "Batter"
  | "Pace Bowler"
  | "Spin Bowler"
  | "Batting Pace All-rounder"
  | "Pace Bowling All-rounder"
  | "Batting Spin All-rounder"
  | "Spin Bowling All-rounder"
  | "Wicketkeeper Batter";

type Player = {
  player_id: string;
  player_name: string;
  role: PlayerRole | null;
  photo_url: string | null;
};



type SelectedPlayer = Player & {

  selection_role: SelectionRole;

  selection_order: number | null;

  is_captain: boolean;

  is_wicketkeeper: boolean;

  has_car: boolean;

};



type AvailabilityStatus =

  | "Available"

  | "Unavailable"

  | "Not Responded"

  | null;



type PlayerAvailability = {

  player_id: string;

  status: AvailabilityStatus;

};



type TeamSelectionManagerProps = {

  matchId: string;

  teamId: string;

  teamName: string;

  fixtureLabel: string;

  matchDateLabel: string;

  venueName: string | null;

  selectionId: number | null;

  selectionStatus: "Draft" | "Published" | null;

  teamPlayers: Player[];

  otherPlayers: Player[];

  selectedPlayers: SelectedPlayer[];

  availability: PlayerAvailability[];

};



type ActionResult = {

  ok: boolean;

  message: string;

};



function availabilityClasses(status: AvailabilityStatus) {

  if (status === "Available") {

    return "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300";

  }



  if (status === "Unavailable") {

    return "border-red-400/20 bg-red-400/[0.08] text-red-300";

  }



  if (status === "Not Responded") {

    return "border-amber-400/20 bg-amber-400/[0.08] text-amber-300";

  }



  return "border-white/10 bg-white/[0.04] text-zinc-500";

}



function availabilityLabel(status: AvailabilityStatus) {

  return status ?? "No Poll";

}



function playerInitials(playerName: string) {
  return playerName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function PlayerAvatar({ player }: { player: Player }) {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] text-sm font-bold text-zinc-300">
      <span aria-hidden="true">{playerInitials(player.player_name)}</span>
      {player.photo_url ? (
        <img
          src={player.photo_url}
          alt={`${player.player_name} profile`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.remove();
          }}
        />
      ) : null}
    </div>
  );
}

function BatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M15.8 2.8 19 6l-8.6 11.5-3.9-3.9L15.8 2.8Z" fill="currentColor" opacity="0.9" />
      <path d="m6.5 13.6-2.8 2.8 3.9 3.9 2.8-2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m3.4 20.6 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PaceBallIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.2 5.2c2.1 2.2 3.3 4.5 3.6 6.8.3 2.4-.3 4.7-1.8 6.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 7.5H1.8M3.2 12H1M4 16.5H1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SpinBallIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.6 6.1c1.8 2 2.8 3.9 3 5.9.2 2-.3 4-1.6 5.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.1 5.8A9.2 9.2 0 0 1 19 7.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="m18.5 4.7.8 2.8-2.9.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GlovesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M7.2 11.2V6.4a1.2 1.2 0 0 1 2.4 0v3.2-4.1a1.2 1.2 0 0 1 2.4 0v4-3.2a1.2 1.2 0 0 1 2.4 0v3.9-2.4a1.2 1.2 0 0 1 2.4 0v5.6c0 4-2.3 6.1-5.8 6.1-3 0-4.7-1.6-5.8-4.1l-1.4-3.1a1.4 1.4 0 0 1 2.5-1.2l.9 1.8v-1.7Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RoleIcons({ role }: { role: PlayerRole }) {
  const iconClass = "inline-flex items-center gap-1 text-amber-300";

  switch (role) {
    case "Batter":
      return <span className={iconClass}><BatIcon /></span>;
    case "Pace Bowler":
      return <span className={iconClass}><PaceBallIcon /></span>;
    case "Spin Bowler":
      return <span className={iconClass}><SpinBallIcon /></span>;
    case "Batting Pace All-rounder":
      return <span className={iconClass}><BatIcon /><PaceBallIcon /></span>;
    case "Pace Bowling All-rounder":
      return <span className={iconClass}><PaceBallIcon /><BatIcon /></span>;
    case "Batting Spin All-rounder":
      return <span className={iconClass}><BatIcon /><SpinBallIcon /></span>;
    case "Spin Bowling All-rounder":
      return <span className={iconClass}><SpinBallIcon /><BatIcon /></span>;
    case "Wicketkeeper Batter":
      return <span className={iconClass}><GlovesIcon /><BatIcon /></span>;
  }
}

function PlayerRoleDisplay({ role }: { role: PlayerRole | null }) {
  if (!role) {
    return <span className="text-xs text-zinc-600">Role not set</span>;
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400">
      <RoleIcons role={role} />
      <span>{role}</span>
    </span>
  );
}

function publishedPlayerName(player: SelectedPlayer) {

  const suffixes: string[] = [];



  if (player.is_captain) {

    suffixes.push("(C)");

  }



  if (player.is_wicketkeeper) {

    suffixes.push("🧤");

  }



  if (player.has_car) {

    suffixes.push("🚗");

  }



  if (suffixes.length === 0) {

    return player.player_name;

  }



  return `${player.player_name} ${suffixes.join(" ")}`;

}



function reservePlayerName(player: SelectedPlayer) {

  return player.has_car

    ? `${player.player_name} 🚗`

    : player.player_name;

}



function sortPlayingPlayers(players: SelectedPlayer[]) {

  return [...players].sort((a, b) => {

    const aOrder =

      a.selection_order ?? Number.MAX_SAFE_INTEGER;

    const bOrder =

      b.selection_order ?? Number.MAX_SAFE_INTEGER;



    if (aOrder !== bOrder) {

      return aOrder - bOrder;

    }



    return a.player_name.localeCompare(b.player_name);

  });

}



export default function TeamSelectionManager({

  matchId,

  teamId,

  teamName,

  fixtureLabel,

  matchDateLabel,

  venueName,

  selectionId,

  selectionStatus,

  teamPlayers,

  otherPlayers,

  selectedPlayers,

  availability,

}: TeamSelectionManagerProps) {

  const [isPending, startTransition] = useTransition();

  const [message, setMessage] = useState<string | null>(

    null,

  );

  const [messageOk, setMessageOk] = useState(true);

  const [otherPlayerSearch, setOtherPlayerSearch] =

    useState("");

  const [copyMessage, setCopyMessage] = useState<

    string | null

  >(null);



  const availabilityByPlayerId = new Map(

    availability.map((entry) => [

      entry.player_id,

      entry.status,

    ]),

  );



  const selectedPlayerIds = new Set(

    selectedPlayers.map((player) => player.player_id),

  );



  const playingPlayers = sortPlayingPlayers(

    selectedPlayers.filter(

      (player) => player.selection_role === "Playing",

    ),

  );



  const reservePlayers = selectedPlayers

    .filter(

      (player) => player.selection_role === "Reserve",

    )

    .sort((a, b) =>

      a.player_name.localeCompare(b.player_name),

    );



  const availableTeamPlayers = teamPlayers.filter(

    (player) => !selectedPlayerIds.has(player.player_id),

  );



  const normalTeamPlayerIds = new Set(

    teamPlayers.map((player) => player.player_id),

  );



  const availableOtherPlayers = otherPlayers

    .filter(

      (player) => !selectedPlayerIds.has(player.player_id),

    )

    .filter(

      (player) =>

        !normalTeamPlayerIds.has(player.player_id),

    );



  const otherSearchTerm = otherPlayerSearch

    .trim()

    .toLowerCase();



  const matchingOtherPlayers =

    otherSearchTerm.length > 0

      ? availableOtherPlayers.filter((player) =>

          player.player_name

            .toLowerCase()

            .includes(otherSearchTerm),

        )

      : [];



  function runAction(

    action: () => Promise<ActionResult>,

    options?: {

      quietSuccess?: boolean;

    },

  ) {

    setMessage(null);

    setCopyMessage(null);



    startTransition(async () => {

      const result = await action();



      if (result.ok && options?.quietSuccess) {

        return;

      }



      setMessageOk(result.ok);

      setMessage(result.message);

    });

  }



  async function copyPublishedTeam() {

    const lines: string[] = [];



    if (fixtureLabel.trim()) {

      lines.push(fixtureLabel.trim());

    }



    lines.push(matchDateLabel);



    if (venueName?.trim()) {

      lines.push(`Venue: ${venueName.trim()}`);

    }



    lines.push("");

    lines.push("Playing Team");



    playingPlayers.forEach((player, index) => {

      lines.push(

        `${index + 1}. ${publishedPlayerName(player)}`,

      );

    });



    if (reservePlayers.length > 0) {

      lines.push("");

      lines.push("Reserve Players");



      for (const player of reservePlayers) {

        lines.push(reservePlayerName(player));

      }

    }



    const text = lines.join("\n");



    try {

      await navigator.clipboard.writeText(text);

      setCopyMessage("Team copied.");

    } catch {

      setCopyMessage(

        "Could not copy the team automatically. Please try again.",

      );

    }

  }



  function renderAddButtons(player: Player) {

    return (

      <div className="flex shrink-0 flex-wrap gap-2">

        <button

          type="button"

          disabled={isPending}

          onClick={() =>

            runAction(() =>

              addPlayerToSelection(

                matchId,

                selectionId!,

                player.player_id,

                "Playing",

              ),

            )

          }

          className="rounded-lg border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"

        >

          Add to Team

        </button>



        <button

          type="button"

          disabled={isPending}

          onClick={() =>

            runAction(() =>

              addPlayerToSelection(

                matchId,

                selectionId!,

                player.player_id,

                "Reserve",

              ),

            )

          }

          className="rounded-lg border border-violet-400/20 bg-violet-400/[0.06] px-3 py-2 text-xs font-semibold text-violet-300 transition hover:bg-violet-400/[0.12] disabled:cursor-not-allowed disabled:opacity-50"

        >

          Add as Reserve

        </button>

      </div>

    );

  }



  function renderAvailablePlayer(player: Player) {

    const availabilityStatus =

      availabilityByPlayerId.get(player.player_id) ?? null;



    return (

      <div

        key={player.player_id}

        className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"

      >

        <div className="min-w-0">

          <p className="truncate font-medium">

            {player.player_name}

          </p>

          <div className="mt-1">
            <PlayerRoleDisplay role={player.role} />
          </div>



          <span

            className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${availabilityClasses(

              availabilityStatus,

            )}`}

          >

            {availabilityLabel(availabilityStatus)}

          </span>

        </div>



        {renderAddButtons(player)}

      </div>

    );

  }



  if (!selectionId || !selectionStatus) {

    return (

      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">

        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">

          Team Selection

        </p>



        <h2 className="mt-2 text-2xl font-bold">

          Build the team for {teamName}

        </h2>



        <p className="mt-3 max-w-3xl leading-7 text-zinc-400">

          Start a new draft or use the most recent published

          team for {teamName} as your starting point.

          Availability can help inform your choices, but it

          does not control who may be selected.

        </p>



        {message ? (

          <p

            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${

              messageOk

                ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"

                : "border-red-400/20 bg-red-400/[0.08] text-red-300"

            }`}

          >

            {message}

          </p>

        ) : null}



        <div className="mt-6 flex flex-wrap gap-3">

          <button

            type="button"

            disabled={isPending}

            onClick={() =>

              runAction(() =>

                createMatchSelection(matchId, teamId),

              )

            }

            className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"

          >

            {isPending

              ? "Starting…"

              : "Start New Selection"}

          </button>



          <button

            type="button"

            disabled={isPending}

            onClick={() =>

              runAction(() =>

                createMatchSelectionFromPrevious(

                  matchId,

                  teamId,

                ),

              )

            }

            className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-amber-400/30 hover:bg-amber-400/[0.08] hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"

          >

            {isPending ? "Starting…" : "Use Last Team"}

          </button>

        </div>

      </section>

    );

  }



  const isDraft = selectionStatus === "Draft";



  return (

    <div className="space-y-6">

      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">

          <div>

            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">

              Team Selection

            </p>



            <h2 className="mt-2 text-2xl font-bold">

              {teamName}

            </h2>



            <p className="mt-3 text-zinc-400">

              <span className="font-semibold text-white">

                {playingPlayers.length}

              </span>{" "}

              {playingPlayers.length === 1

                ? "playing player"

                : "playing players"}

              {reservePlayers.length > 0

                ? ` · ${reservePlayers.length} ${

                    reservePlayers.length === 1

                      ? "reserve"

                      : "reserves"

                  }`

                : ""}

            </p>

          </div>



          <span

            className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${

              isDraft

                ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-300"

                : "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"

            }`}

          >

            {selectionStatus}

          </span>

        </div>



        {message ? (

          <p

            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${

              messageOk

                ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"

                : "border-red-400/20 bg-red-400/[0.08] text-red-300"

            }`}

          >

            {message}

          </p>

        ) : null}

      </section>



      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

          <div>

            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">

              Playing Team

            </p>



            <h2 className="mt-2 text-2xl font-bold">

              {isDraft ? "Build the team" : "Published team"}

            </h2>



            {isDraft ? (

              <p className="mt-2 text-sm text-zinc-500">

                Use ↑ and ↓ to arrange the team in your

                preferred order.

              </p>

            ) : null}

          </div>



          {isDraft ? (

            <button

              type="button"

              disabled={isPending}

              onClick={() =>

                runAction(() =>

                  publishMatchSelection(

                    matchId,

                    selectionId,

                  ),

                )

              }

              className="w-fit rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"

            >

              {isPending ? "Working…" : "Publish Selection"}

            </button>

          ) : (

            <div className="flex flex-wrap gap-2">

              <button

                type="button"

                onClick={copyPublishedTeam}

                className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-black transition hover:bg-amber-300"

              >

                Copy Team

              </button>



              <button

                type="button"

                disabled={isPending}

                onClick={() =>

                  runAction(() =>

                    reopenMatchSelection(

                      matchId,

                      selectionId,

                    ),

                  )

                }

                className="rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-5 py-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"

              >

                {isPending

                  ? "Working…"

                  : "Return to Draft"}

              </button>

            </div>

          )}

        </div>



        {copyMessage ? (

          <p className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-300">

            {copyMessage}

          </p>

        ) : null}



        {playingPlayers.length > 0 ? (

          <div className="mt-6 space-y-3">

            {playingPlayers.map((player, index) => {

              const availabilityStatus =

                availabilityByPlayerId.get(

                  player.player_id,

                ) ?? null;



              const isFirst = index === 0;

              const isLast =

                index === playingPlayers.length - 1;



              return (

                <article

                  key={player.player_id}

                  className="rounded-2xl border border-white/10 bg-black/20 p-5"

                >

                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">

                    <div className="flex min-w-0 items-center gap-4">

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/[0.08] text-sm font-bold text-amber-300">

                        {index + 1}

                      </div>

                      {!isDraft ? <PlayerAvatar player={player} /> : null}



                      <div className="min-w-0">

                        <div className="flex flex-wrap items-center gap-2">

                          <p className="font-semibold text-white">

                            {isDraft

                              ? player.player_name

                              : publishedPlayerName(player)}

                          </p>



                          {isDraft &&

                          player.is_captain ? (

                            <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">

                              Captain

                            </span>

                          ) : null}



                          {isDraft &&

                          player.is_wicketkeeper ? (

                            <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-xs font-semibold text-sky-300">

                              WK

                            </span>

                          ) : null}



                          {isDraft && player.has_car ? (

                            <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">

                              🚗 Car

                            </span>

                          ) : null}



                          {isDraft ? (

                            <span

                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${availabilityClasses(

                                availabilityStatus,

                              )}`}

                            >

                              {availabilityLabel(

                                availabilityStatus,

                              )}

                            </span>

                          ) : null}

                        </div>

                        <div className="mt-2">
                          <PlayerRoleDisplay role={player.role} />
                        </div>

                      </div>

                    </div>



                    {isDraft ? (

                      <div className="flex flex-wrap items-center gap-2">

                        <button

                          type="button"

                          aria-label={`Move ${player.player_name} up`}

                          title="Move up"

                          disabled={isPending || isFirst}

                          onClick={() =>

                            runAction(

                              () =>

                                moveSelectionPlayer(

                                  matchId,

                                  selectionId,

                                  player.player_id,

                                  "Up",

                                ),

                              { quietSuccess: true },

                            )

                          }

                          className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-zinc-300 transition hover:border-amber-400/30 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-30"

                        >

                          ↑

                        </button>



                        <button

                          type="button"

                          aria-label={`Move ${player.player_name} down`}

                          title="Move down"

                          disabled={isPending || isLast}

                          onClick={() =>

                            runAction(

                              () =>

                                moveSelectionPlayer(

                                  matchId,

                                  selectionId,

                                  player.player_id,

                                  "Down",

                                ),

                              { quietSuccess: true },

                            )

                          }

                          className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-zinc-300 transition hover:border-amber-400/30 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-30"

                        >

                          ↓

                        </button>



                        <button

                          type="button"

                          disabled={

                            isPending ||

                            player.is_captain

                          }

                          onClick={() =>

                            runAction(() =>

                              setSelectionCaptain(

                                matchId,

                                selectionId,

                                player.player_id,

                              ),

                            )

                          }

                          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-amber-400/30 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"

                        >

                          Captain

                        </button>



                        <button

                          type="button"

                          disabled={

                            isPending ||

                            player.is_wicketkeeper

                          }

                          onClick={() =>

                            runAction(() =>

                              setSelectionWicketkeeper(

                                matchId,

                                selectionId,

                                player.player_id,

                              ),

                            )

                          }

                          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-sky-400/30 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"

                        >

                          WK

                        </button>



                        <button

                          type="button"

                          disabled={isPending}

                          onClick={() =>

                            runAction(() =>

                              setSelectionPlayerCar(

                                matchId,

                                selectionId,

                                player.player_id,

                                !player.has_car,

                              ),

                            )

                          }

                          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${

                            player.has_car

                              ? "border-emerald-400/30 bg-emerald-400/[0.10] text-emerald-300"

                              : "border-white/10 text-zinc-300 hover:border-emerald-400/30 hover:text-emerald-300"

                          }`}

                        >

                          🚗 Car

                        </button>



                        <button

                          type="button"

                          disabled={

                            isPending ||

                            player.is_captain ||

                            player.is_wicketkeeper

                          }

                          onClick={() =>

                            runAction(() =>

                              setSelectionPlayerRole(

                                matchId,

                                selectionId,

                                player.player_id,

                                "Reserve",

                              ),

                            )

                          }

                          className="rounded-lg border border-violet-400/20 px-3 py-2 text-xs font-semibold text-violet-300 transition hover:bg-violet-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"

                        >

                          Move to Reserve

                        </button>



                        <button

                          type="button"

                          disabled={isPending}

                          onClick={() =>

                            runAction(() =>

                              removePlayerFromSelection(

                                matchId,

                                selectionId,

                                player.player_id,

                              ),

                            )

                          }

                          className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"

                        >

                          Remove

                        </button>

                      </div>

                    ) : null}

                  </div>

                </article>

              );

            })}

          </div>

        ) : (

          <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-6">

            <p className="text-sm text-zinc-500">

              No playing players have been selected yet.

            </p>

          </div>

        )}

      </section>



      {isDraft || reservePlayers.length > 0 ? (

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">

          <div>

            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">

              Reserve Players

            </p>



            <h2 className="mt-2 text-2xl font-bold">

              {isDraft

                ? "Optional reserves"

                : "Reserve Players"}

            </h2>



            {isDraft ? (

              <p className="mt-3 max-w-3xl leading-7 text-zinc-400">

                Reserve players are optional and are not

                treated as playing participants.

              </p>

            ) : null}

          </div>



          {reservePlayers.length > 0 ? (

            <div className="mt-6 space-y-3">

              {reservePlayers.map((player) => {

                const availabilityStatus =

                  availabilityByPlayerId.get(

                    player.player_id,

                  ) ?? null;



                return (

                  <article

                    key={player.player_id}

                    className="rounded-2xl border border-white/10 bg-black/20 p-5"

                  >

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                      <div className="flex min-w-0 items-center gap-4">
                        {!isDraft ? <PlayerAvatar player={player} /> : null}
                        <div className="flex flex-wrap items-center gap-2">

                        <p className="font-semibold text-white">

                          {player.player_name}

                        </p>

                          <PlayerRoleDisplay role={player.role} />



                        {player.has_car ? (

                          <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">

                            🚗 Car

                          </span>

                        ) : null}



                        {isDraft ? (

                          <span

                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${availabilityClasses(

                              availabilityStatus,

                            )}`}

                          >

                            {availabilityLabel(

                              availabilityStatus,

                            )}

                          </span>

                        ) : null}

                      </div>
                      </div>



                      {isDraft ? (

                        <div className="flex flex-wrap gap-2">

                          <button

                            type="button"

                            disabled={isPending}

                            onClick={() =>

                              runAction(() =>

                                setSelectionPlayerCar(

                                  matchId,

                                  selectionId,

                                  player.player_id,

                                  !player.has_car,

                                ),

                              )

                            }

                            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${

                              player.has_car

                                ? "border-emerald-400/30 bg-emerald-400/[0.10] text-emerald-300"

                                : "border-white/10 text-zinc-300 hover:border-emerald-400/30 hover:text-emerald-300"

                            }`}

                          >

                            🚗 Car

                          </button>



                          <button

                            type="button"

                            disabled={isPending}

                            onClick={() =>

                              runAction(() =>

                                setSelectionPlayerRole(

                                  matchId,

                                  selectionId,

                                  player.player_id,

                                  "Playing",

                                ),

                              )

                            }

                            className="rounded-lg border border-emerald-400/20 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"

                          >

                            Move to Team

                          </button>



                          <button

                            type="button"

                            disabled={isPending}

                            onClick={() =>

                              runAction(() =>

                                removePlayerFromSelection(

                                  matchId,

                                  selectionId,

                                  player.player_id,

                                ),

                              )

                            }

                            className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"

                          >

                            Remove

                          </button>

                        </div>

                      ) : null}

                    </div>

                  </article>

                );

              })}

            </div>

          ) : (

            <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-6">

              <p className="text-sm text-zinc-500">

                No reserve players selected.

              </p>

            </div>

          )}

        </section>

      ) : null}



      {isDraft ? (

        <>

          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">

            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">

              {teamName} Players

            </p>



            <h2 className="mt-2 text-2xl font-bold">

              Add from {teamName}

            </h2>



            <p className="mt-3 max-w-3xl leading-7 text-zinc-400">

              These are the players currently assigned to{" "}

              {teamName}. Availability is shown as context

              only and does not control selection.

            </p>



            {availableTeamPlayers.length > 0 ? (

              <div className="mt-6 grid gap-3 md:grid-cols-2">

                {availableTeamPlayers.map((player) =>

                  renderAvailablePlayer(player),

                )}

              </div>

            ) : (

              <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-5">

                <p className="text-sm text-zinc-500">

                  All current {teamName} players are already

                  in this selection.

                </p>

              </div>

            )}

          </section>



          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7">

            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">

              Other DCC Players

            </p>



            <h2 className="mt-2 text-2xl font-bold">

              Add another DCC player

            </h2>



            <p className="mt-3 max-w-3xl leading-7 text-zinc-400">

              Need someone outside the normal {teamName}{" "}

              group? Search all other active DCC players here.

              Team membership does not restrict selection.

            </p>



            <input

              type="search"

              value={otherPlayerSearch}

              onChange={(event) =>

                setOtherPlayerSearch(event.target.value)

              }

              placeholder="Search other DCC players…"

              className="mt-6 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/40"

            />



            {otherSearchTerm.length === 0 ? (

              <div className="mt-4 rounded-xl border border-dashed border-white/10 p-5">

                <p className="text-sm text-zinc-500">

                  Start typing a player&apos;s name to search

                  outside the normal {teamName} group.

                </p>

              </div>

            ) : matchingOtherPlayers.length > 0 ? (

              <div className="mt-4 grid gap-3 md:grid-cols-2">

                {matchingOtherPlayers.map((player) =>

                  renderAvailablePlayer(player),

                )}

              </div>

            ) : (

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-5">

                <p className="text-sm text-zinc-500">

                  No matching DCC players found.

                </p>

              </div>

            )}

          </section>

        </>

      ) : null}

    </div>

  );

}