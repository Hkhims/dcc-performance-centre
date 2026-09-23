import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalNavigation from "./PortalNavigation";

type PortalAccess = {
  player_id: string | null;
  account_role: "User" | "Super Admin";
  account_status: "Invited" | "Active" | "Disabled";
  display_name: string | null;
  team_ids: string[];
};

export default async function PortalAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/portal/login");
  }

  const { data, error } = await supabase.rpc(
    "get_my_portal_access",
  );

  if (error) {
    throw new Error(
      `Unable to load Portal access: ${error.message}`,
    );
  }

  const access = (data?.[0] ?? null) as PortalAccess | null;

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      {access?.account_status === "Active" && (
        <PortalNavigation
          displayName={access.display_name}
          hasPlayerProfile={Boolean(access.player_id)}
          isSuperAdmin={access.account_role === "Super Admin"}
          hasTeamAdminAccess={access.team_ids.length > 0}
        />
      )}

      {children}
    </div>
  );
}