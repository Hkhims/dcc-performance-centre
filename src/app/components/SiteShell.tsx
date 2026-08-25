"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/matches", label: "Matches" },
  { href: "/teams", label: "Teams" },
  { href: "/players", label: "Players" },
  { href: "/stats", label: "Stats" },
];

export default function SiteShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#050914] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050914]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#d4af37]/40 bg-[#0b1220] text-sm font-black text-[#d4af37]">
              DCC
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-wide">
                Dunmurry Cricket Club
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Performance Centre
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

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
          </nav>
        </div>
      </header>

      <main className="pb-20 md:pb-0">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#08101d]/95 backdrop-blur md:hidden">
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
                className={`flex min-h-16 items-center justify-center px-2 text-xs font-semibold ${
                  active ? "text-[#d4af37]" : "text-slate-400"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}