import Link from "next/link";

export default function CricketPage() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
        DCC App
      </p>

      <h1 className="mt-3 text-4xl font-bold tracking-tight">
        Cricket
      </h1>

      <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
        Your home for Dunmurry Cricket Club fixtures,
        results, teams and match information.
      </p>

      <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-7">
        <h2 className="text-2xl font-bold">
          Fixtures and results
        </h2>

        <p className="mt-3 max-w-2xl leading-7 text-zinc-400">
          Explore DCC match results and scorecards in
          the Performance Centre while we develop the
          integrated DCC App cricket experience.
        </p>

        <Link
          href="/matches"
          className="mt-6 inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          View match results
        </Link>
      </section>
    </main>
  );
}