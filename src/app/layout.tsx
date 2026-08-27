import type { Metadata } from "next";
import "./globals.css";
import SiteShell from "./components/SiteShell";

export const metadata: Metadata = {
  title: {
    default: "DCC Performance Centre",
    template: "%s | DCC Performance Centre",
  },
  description:
    "Results, statistics, team performance and player records from Dunmurry Cricket Club's 2026 season.",
  applicationName: "DCC Performance Centre",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}