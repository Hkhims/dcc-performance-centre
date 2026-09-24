"use client";

import { FormEvent, useState, useTransition } from "react";
import { createAdHocTeamMatch } from "./actions";

type CreateMatchFormProps = {
  teamId: string;
  teamName: string;
  season: number;
};

type MatchCategory = "Friendly" | "Warm-up";
type HomeAway = "Home" | "Away" | "Neutral" | "";

export default function CreateMatchForm({
  teamId,
  teamName,
  season,
}: CreateMatchFormProps) {
  const [category, setCategory] =
    useState<MatchCategory>("Friendly");
  const [opponent, setOpponent] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [homeAway, setHomeAway] =
    useState<HomeAway>("");
  const [venue, setVenue] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const cleanOpponent = opponent.trim();

    if (!cleanOpponent) {
      setMessage("Enter the opposition name.");
      return;
    }

    if (!matchDate) {
      setMessage("Choose the match date.");
      return;
    }

    const fixtureLabel =
      `${teamName} vs ${cleanOpponent}`;

    let startDateTime: string | null = null;

    if (matchTime) {
      const localDateTime = new Date(
        `${matchDate}T${matchTime}:00`,
      );

      if (Number.isNaN(localDateTime.getTime())) {
        setMessage("The selected match time is invalid.");
        return;
      }

      startDateTime = localDateTime.toISOString();
    }

    startTransition(async () => {
      const result = await createAdHocTeamMatch(
        teamId,
        season,
        matchDate,
        startDateTime,
        fixtureLabel,
        category,
        cleanOpponent,
        venue,
        homeAway,
      );

      setMessage(result.message);

      if (result.ok) {
        setOpponent("");
        setMatchDate("");
        setMatchTime("");
        setHomeAway("");
        setVenue("");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-5"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-zinc-300">
            Match type
          </span>

          <select
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value as MatchCategory,
              )
            }
            disabled={isPending}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/50"
          >
            <option value="Friendly">Friendly</option>
            <option value="Warm-up">Warm-up</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-300">
            Opposition
          </span>

          <input
            type="text"
            value={opponent}
            onChange={(event) =>
              setOpponent(event.target.value)
            }
            disabled={isPending}
            placeholder="e.g. Belfast Super Kings"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-300">
            Match date
          </span>

          <input
            type="date"
            value={matchDate}
            onChange={(event) =>
              setMatchDate(event.target.value)
            }
            disabled={isPending}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/50"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-300">
            Start time
          </span>

          <input
            type="time"
            value={matchTime}
            onChange={(event) =>
              setMatchTime(event.target.value)
            }
            disabled={isPending}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/50"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-300">
            Location
          </span>

          <select
            value={homeAway}
            onChange={(event) =>
              setHomeAway(
                event.target.value as HomeAway,
              )
            }
            disabled={isPending}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/50"
          >
            <option value="">Not specified</option>
            <option value="Home">Home</option>
            <option value="Away">Away</option>
            <option value="Neutral">Neutral</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-300">
            Venue
          </span>

          <input
            type="text"
            value={venue}
            onChange={(event) =>
              setVenue(event.target.value)
            }
            disabled={isPending}
            placeholder="Optional"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">
          Friendly and warm-up matches do not count towards
          official season statistics.
        </p>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-fit rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-5 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create Match"}
        </button>
      </div>

      {message ? (
        <p className="text-sm text-zinc-300">
          {message}
        </p>
      ) : null}
    </form>
  );
}