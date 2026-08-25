import type { Metadata } from "next";
import "./globals.css";
import SiteShell from "./components/SiteShell";

export const metadata: Metadata = {
  title: "DCC Performance Centre",
  description:
    "Results, statistics and performances from across Dunmurry Cricket Club.",
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