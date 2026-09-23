"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type PortalNavigationProps = {
  displayName: string | null;
  hasPlayerProfile: boolean;
  isSuperAdmin: boolean;
  hasTeamAdminAccess: boolean;
};

export default function PortalNavigation({
  displayName,
  hasPlayerProfile,
  isSuperAdmin,
  hasTeamAdminAccess,
}: PortalNavigationProps) {
  const pathname = usePathname();

  const links = [
    { label: "Home", href: "/portal" },
    { label: "Cricket", href: "/portal/cricket" },
    ...(hasPlayerProfile
      ? [{ label: "My Cricket", href: "/portal/my-cricket" }]
      : []),
    { label: "Club", href: "/portal/club" },
    { label: "Account", href: "/portal/account" },
  ];

  return (
    <header className="border-b border-white/10 bg-[#0b0e16]">
      <div className="mx-auto max-w-7xl px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
              Dunmurry Cricket Club
            </p>
            <p className="mt-1 text-xl font-bold">
              DCC App
            </p>
          </div>

          <div className="text-sm text-zinc-400">
            {displayName ? `Hello, ${displayName}` : "Welcome"}
          </div>
        </div>

        <nav
          aria-label="DCC App navigation"
          className="mt-5 flex flex-wrap gap-2"
        >
          {links.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-amber-400 text-black"
                    : "text-zinc-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {(isSuperAdmin || hasTeamAdminAccess) && (
          <div className="mt-4 flex flex-wrap gap-3 border-t border-white/10 pt-4 text-sm">
            {hasTeamAdminAccess && (
              <span className="text-amber-300">
                Team administration
              </span>
            )}

            {isSuperAdmin && (
              <span className="text-amber-300">
                Club administration
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}