export default function Home() {
  return (
    <div className="bg-[#050914] text-white">
      {/* Hero */}
      <section className="flex min-h-[78vh] items-center border-b border-white/10 px-6">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-[#d4af37]">
            Dunmurry Cricket Club
          </p>

          <h1 className="max-w-5xl text-5xl font-black uppercase tracking-tight sm:text-7xl">
            Performance Centre
          </h1>

          <p className="mt-5 text-xl font-semibold uppercase tracking-[0.25em] text-blue-400">
            2026 Season
          </p>

          <p className="mt-6 max-w-2xl text-base text-slate-300 sm:text-lg">
            Results, statistics and performances from across Dunmurry Cricket Club.
          </p>
        </div>
      </section>

      {/* Season Snapshot */}
      <section className="border-b border-white/10 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
              2026 Season
            </p>
            <h2 className="mt-2 text-3xl font-black uppercase sm:text-4xl">
              Season Snapshot
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {["Matches Played", "Wins", "Runs Scored", "Wickets Taken"].map(
              (label) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-[#0b1220] p-6"
                >
                  <p className="text-sm uppercase tracking-wide text-slate-400">
                    {label}
                  </p>
                  <p className="mt-3 text-4xl font-black text-white">—</p>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* Latest Results */}
      <section className="border-b border-white/10 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
              Recent Cricket
            </p>
            <h2 className="mt-2 text-3xl font-black uppercase sm:text-4xl">
              Latest Results
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-white/10 bg-[#0b1220] p-6"
              >
                <p className="text-sm text-slate-400">Match data coming soon</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Season Standouts */}
      <section className="border-b border-white/10 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
              Top Performers
            </p>
            <h2 className="mt-2 text-3xl font-black uppercase sm:text-4xl">
              Season Standouts
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              "Leading Run Scorer",
              "Leading Wicket Taker",
              "Most Catches",
            ].map((label) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-[#0b1220] p-6"
              >
                <p className="text-sm uppercase tracking-wide text-slate-400">
                  {label}
                </p>
                <p className="mt-8 text-xl font-bold text-white">Coming soon</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leaderboard Preview */}
      <section className="border-b border-white/10 px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
              Performance Data
            </p>
            <h2 className="mt-2 text-3xl font-black uppercase sm:text-4xl">
              Leaderboard Preview
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {["Top Run Scorers", "Top Wicket Takers"].map((title) => (
              <div
                key={title}
                className="rounded-xl border border-white/10 bg-[#0b1220] p-6"
              >
                <h3 className="text-lg font-black uppercase">{title}</h3>
                <div className="mt-6 space-y-4">
                  {[1, 2, 3, 4, 5].map((rank) => (
                    <div
                      key={rank}
                      className="flex items-center justify-between border-b border-white/5 pb-3 text-sm"
                    >
                      <span className="text-slate-400">#{rank}</span>
                      <span className="text-slate-500">Awaiting data</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Explore DCC */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d4af37]">
              Explore
            </p>
            <h2 className="mt-2 text-3xl font-black uppercase sm:text-4xl">
              Explore DCC
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Teams", "Explore each DCC team's 2026 season."],
              ["Players", "Find a player and explore their performances."],
              ["Matches", "Browse results and match details."],
            ].map(([title, description]) => (
              <div
                key={title}
                className="rounded-xl border border-white/10 bg-[#0b1220] p-6"
              >
                <h3 className="text-xl font-black uppercase">{title}</h3>
                <p className="mt-3 text-sm text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}