"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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

  const [statsOpen, setStatsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const statsActive =
    pathname === "/stats" || pathname.startsWith("/stats/");

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setStatsOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#050914] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05070d]/95 backdrop-blur">
        <div className="flex w-full items-center px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/dcc-logo.png"
              alt="Dunmurry Cricket Club logo"
              width={56}
              height={74}
              priority
              className="h-auto w-12"
            />

            <div className="hidden sm:block">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-white">
                Dunmurry Cricket Club
              </p>

              <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[#d4af37]">
                Performance Centre
              </p>
            </div>
          </Link>

          {/* DESKTOP NAV */}
          <nav
            aria-label="Primary navigation"
            className="ml-auto hidden items-center gap-10 lg:flex"
          >
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-semibold uppercase tracking-[0.14em] transition ${
                    active
                      ? "text-[#d4af37]"
                      : "text-white hover:text-[#d4af37]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* DESKTOP STATS DROPDOWN */}
            <div
              className="relative"
              onMouseEnter={() => setStatsOpen(true)}
              onMouseLeave={() => setStatsOpen(false)}
            >
              <button
                type="button"
                onClick={() =>
                  setStatsOpen((current) => !current)
                }
                aria-expanded={statsOpen}
                aria-haspopup="menu"
                className={`inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] transition ${
                  statsActive
                    ? "text-[#d4af37]"
                    : "text-white hover:text-[#d4af37]"
                }`}
              >
                Stats

                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform duration-200 ${
                    statsOpen ? "rotate-180" : ""
                  }`}
                >
                  <path
                    d="M5 7.5L10 12.5L15 7.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {statsOpen && (
                <div className="absolute right-0 top-full pt-5">
                  <div
                    role="menu"
                    className="w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d14] p-2 shadow-2xl shadow-black/40"
                  >
                    <Link
                      href="/stats"
                      role="menuitem"
                      onClick={() => setStatsOpen(false)}
                      className="block rounded-xl px-4 py-3 transition hover:bg-white/5"
                    >
                      <p
                        className={`text-sm font-semibold ${
                          pathname === "/stats"
                            ? "text-[#d4af37]"
                            : "text-white"
                        }`}
                      >
                        Season Stats
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                        Leaders, records and player performance.
                      </p>
                    </Link>

                    <Link
                      href="/stats/fun"
                      role="menuitem"
                      onClick={() => setStatsOpen(false)}
                      className="block rounded-xl px-4 py-3 transition hover:bg-white/5"
                    >
                      <p
                        className={`text-sm font-semibold ${
                          pathname === "/stats/fun"
                            ? "text-[#d4af37]"
                            : "text-white"
                        }`}
                      >
                        Fun Stats
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                        The numbers nobody asked for.
                      </p>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* MOBILE HAMBURGER */}
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() =>
              setMobileMenuOpen((open) => !open)
            }
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white transition hover:border-[#d4af37] hover:text-[#d4af37] lg:hidden"
          >
            {mobileMenuOpen ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="h-6 w-6"
              >
                <path
                  d="M6 6L18 18M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="h-6 w-6"
              >
                <path
                  d="M4 7H20M4 12H20M4 17H20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>

        {/* MOBILE MENU */}
        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-[#070a11] lg:hidden">
            <nav className="flex w-full flex-col px-6 py-6">
              {navItems.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className={`border-b border-white/10 py-4 text-sm font-bold uppercase tracking-[0.14em] ${
                      active
                        ? "text-[#d4af37]"
                        : "text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <div className="py-4">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#d4af37]">
                  Stats
                </p>

                <div className="mt-3 flex flex-col gap-3 pl-4">
                  <Link
                    href="/stats"
                    onClick={closeMobileMenu}
                    className={`text-sm ${
                      pathname === "/stats"
                        ? "font-semibold text-[#d4af37]"
                        : "text-zinc-300"
                    }`}
                  >
                    Season Stats
                  </Link>

                  <Link
                    href="/stats/fun"
                    onClick={closeMobileMenu}
                    className={`text-sm ${
                      pathname === "/stats/fun"
                        ? "font-semibold text-[#d4af37]"
                        : "text-zinc-300"
                    }`}
                  >
                    Fun Stats
                  </Link>
                </div>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main>{children}</main>
    </div>
  );
}