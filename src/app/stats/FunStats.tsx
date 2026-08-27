import Link from "next/link";

export type FunStat = {
  key: string;
  eyebrow: string;
  title: string;
  playerName: string;
  playerSlug: string;
  value: string;
  unit: string;
  detail?: string;
  secondaryDetail?: string;
  tone?: "neutral" | "mischief";
  featured?: boolean;
};

type FunStatsProps = {
  stats: FunStat[];
};

export default function FunStats({
  stats,
}: FunStatsProps) {
  const featuredStats = stats.filter(
    (stat) => stat.featured,
  );

  const regularStats = stats.filter(
    (stat) => !stat.featured,
  );

  return (
    <>
      {featuredStats.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {featuredStats.map((stat) => (
            <Link
              key={stat.key}
              href={`/players/${stat.playerSlug}?fromFun=1`}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#13223a] via-[#0b1728] to-[#07101d] p-6 transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/35 sm:p-7"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_18%,rgba(212,175,55,0.12),transparent_38%)]" />

              <div className="relative">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  {stat.eyebrow}
                </p>

                <p className="mt-2 text-xs font-bold uppercase tracking-[0.17em] text-[#d4af37]">
                  {stat.title}
                </p>

                <div className="mt-8 flex items-end justify-between gap-5">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-black text-white transition group-hover:text-[#d4af37]">
                      {stat.playerName}
                    </p>

                    {stat.detail && (
                      <p className="mt-2 text-sm text-slate-400">
                        {stat.detail}
                      </p>
                    )}

                    {stat.secondaryDetail && (
                      <p className="mt-1 text-xs text-slate-500">
                        {stat.secondaryDetail}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                      {stat.value}
                    </p>

                    <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                      {stat.unit}
                    </p>
                  </div>
                </div>

                <div className="mt-6 border-t border-white/10 pt-4 text-right">
                  <span className="text-xs font-semibold text-slate-600 transition group-hover:text-[#d4af37]">
                    View player →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {regularStats.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {regularStats.map((stat) => (
            <Link
              key={stat.key}
              href={`/players/${stat.playerSlug}?fromFun=1`}
              className={`group relative overflow-hidden rounded-2xl border p-5 transition duration-200 hover:-translate-y-0.5 sm:p-6 ${
                stat.tone === "mischief"
                  ? "border-amber-300/10 bg-gradient-to-br from-[#111522] to-[#0b1220] hover:border-amber-300/25"
                  : "border-white/10 bg-[#0b1220] hover:border-[#d4af37]/30 hover:bg-[#0d1626]"
              }`}
            >
              <div className="flex min-h-[170px] flex-col">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                    {stat.eyebrow}
                  </p>

                  <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">
                    {stat.title}
                  </p>
                </div>

                <div className="mt-6 flex flex-1 items-end justify-between gap-5">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-white transition group-hover:text-[#d4af37]">
                      {stat.playerName}
                    </p>

                    {stat.detail && (
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">
                        {stat.detail}
                      </p>
                    )}

                    {stat.secondaryDetail && (
                      <p className="mt-1 text-[11px] text-slate-600">
                        {stat.secondaryDetail}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                      {stat.value}
                    </p>

                    <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.15em] text-slate-600">
                      {stat.unit}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}