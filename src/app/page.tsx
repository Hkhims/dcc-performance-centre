export default function Home() {
  return (
    <main className="min-h-screen bg-[#050914] text-white">
      <section className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-[#d4af37]">
            Dunmurry Cricket Club
          </p>

          <h1 className="text-5xl font-black uppercase tracking-tight sm:text-7xl">
            Performance Centre
          </h1>

          <p className="mt-5 text-xl font-semibold uppercase tracking-[0.25em] text-blue-400">
            2026 Season
          </p>

          <p className="mx-auto mt-6 max-w-2xl text-base text-slate-300 sm:text-lg">
            Results, statistics and performances from across Dunmurry Cricket Club.
          </p>
        </div>
      </section>
    </main>
  );
}