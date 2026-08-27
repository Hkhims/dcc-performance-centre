"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/matches", label: "Matches" },
  { href: "/teams", label: "Teams" },
  { href: "/players", label: "Players" },
];

export default function SiteShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [statsOpen, setStatsOpen] =
    useState(false);

  const statsActive =
    pathname === "/stats" ||
    pathname.startsWith("/stats/");

  return (
    <div className="min-h-screen bg-[#050914] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050914]/95 backdrop-blur">
        <div className="flex w-full items-center justify-between px-5 py-4">
          <Link
            href="/"
            className="flex items-center gap-3"
          >
            <Image
  src="/images/dcc-logo.png"
  alt="Dunmurry Cricket Club logo"
  width={48}
  height={48}
  className="h-12 w-12 object-contain"
/>

            <div>
              <p className="text-sm font-black uppercase tracking-wide">
                Dunmurry Cricket Club
              </p>

              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Performance Centre
              </p>
            </div>
          </Link>

          {/* DESKTOP NAV */}
          <nav aria-label="Primary navigation" className="hidden items-center gap-7 md:flex">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(
                      item.href,
                    );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-semibold transition ${
                    active
                      ? "text-[#d4af37]"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* STATS DROPDOWN */}
            <div
              className="relative"
              onMouseEnter={() =>
                setStatsOpen(true)
              }
              onMouseLeave={() =>
                setStatsOpen(false)
              }
            >
              <button
                type="button"
                onClick={() =>
                  setStatsOpen(
                    (current) => !current,
                  )
                }
                aria-expanded={statsOpen}
                aria-haspopup="menu"
                className={`inline-flex items-center gap-1.5 text-sm font-semibold transition ${
                  statsActive
                    ? "text-[#d4af37]"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Stats

                <span
                  aria-hidden="true"
                  className={`text-[10px] transition-transform ${
                    statsOpen
                      ? "rotate-180"
                      : ""
                  }`}
                >
                  ▾
                </span>
              </button>

              {statsOpen && (
                <div className="absolute right-0 top-full pt-3">
                  <div
                    role="menu"
                    className="w-52 overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl shadow-black/30"
                  >
                    <Link
                      href="/stats"
                      role="menuitem"
                      onClick={() =>
                        setStatsOpen(false)
                      }
                      className={`block border-b border-white/10 px-4 py-3.5 transition hover:bg-white/[0.04] ${
                        pathname === "/stats"
                          ? "bg-[#d4af37]/10"
                          : ""
                      }`}
                    >
                      <p
                        className={`text-sm font-bold ${
                          pathname === "/stats"
                            ? "text-[#d4af37]"
                            : "text-white"
                        }`}
                      >
                        Season Stats
                      </p>

                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        Leaders, records and
                        player performance.
                      </p>
                    </Link>

                    <Link
                      href="/stats/fun"
                      role="menuitem"
                      onClick={() =>
                        setStatsOpen(false)
                      }
                      className={`block px-4 py-3.5 transition hover:bg-white/[0.04] ${
                        pathname ===
                        "/stats/fun"
                          ? "bg-[#d4af37]/10"
                          : ""
                      }`}
                    >
                      <p
                        className={`text-sm font-bold ${
                          pathname ===
                          "/stats/fun"
                            ? "text-[#d4af37]"
                            : "text-white"
                        }`}
                      >
                        Fun Stats
                      </p>

                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        The numbers nobody
                        asked for.
                      </p>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main className="pb-20 md:pb-0">
        {children}
      </main>

      {/* MOBILE STATS MENU */}
      {statsOpen && (
        <div className="fixed inset-x-4 bottom-20 z-50 md:hidden">
          <div
            role="menu"
            className="ml-auto w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl shadow-black/40"
          >
            <Link
              href="/stats"
              role="menuitem"
              onClick={() => setStatsOpen(false)}
              className={`block border-b border-white/10 px-5 py-4 transition active:bg-white/[0.04] ${
                pathname === "/stats"
                  ? "bg-[#d4af37]/10"
                  : ""
              }`}
            >
              <p
                className={`text-sm font-bold ${
                  pathname === "/stats"
                    ? "text-[#d4af37]"
                    : "text-white"
                }`}
              >
                Season Stats
              </p>

              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Leaders, records and player performance.
              </p>
            </Link>

            <Link
              href="/stats/fun"
              role="menuitem"
              onClick={() => setStatsOpen(false)}
              className={`block px-5 py-4 transition active:bg-white/[0.04] ${
                pathname === "/stats/fun"
                  ? "bg-[#d4af37]/10"
                  : ""
              }`}
            >
              <p
                className={`text-sm font-bold ${
                  pathname === "/stats/fun"
                    ? "text-[#d4af37]"
                    : "text-white"
                }`}
              >
                Fun Stats
              </p>

              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                The numbers nobody asked for.
              </p>
            </Link>
          </div>
        </div>
      )}

      {/* MOBILE NAV */}
      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#08101d]/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setStatsOpen(false)}
                className={`flex min-h-16 items-center justify-center px-2 text-xs font-semibold ${
                  active
                    ? "text-[#d4af37]"
                    : "text-slate-400"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() =>
              setStatsOpen((current) => !current)
            }
            aria-expanded={statsOpen}
            aria-haspopup="menu"
            className={`flex min-h-16 items-center justify-center gap-1 px-2 text-xs font-semibold ${
              statsActive
                ? "text-[#d4af37]"
                : "text-slate-400"
            }`}
          >
            Stats
            <span
              aria-hidden="true"
              className={`text-[9px] transition-transform ${
                statsOpen ? "rotate-180" : ""
              }`}
            >
              ▴
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}