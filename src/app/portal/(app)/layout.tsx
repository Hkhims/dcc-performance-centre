import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalNavigation from "./PortalNavigation";
import {
  resolveNotificationHref,
  type PortalNotification,
} from "./notifications/notification-routing";
import type { NotificationBellItem } from "./NotificationBell";

type PortalAccess = {
  player_id: string | null;
  account_role: "User" | "Super Admin";
  account_status: "Invited" | "Active" | "Disabled";
  display_name: string | null;
  team_ids: string[];
};

type AvailabilityPollMatch = {
  poll_id: number;
  match_id: string;
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

  const userId = claimsData.claims.sub;

  const { data, error } = await supabase.rpc(
    "get_my_portal_access",
  );

  if (error) {
    throw new Error(
      `Unable to load Portal access: ${error.message}`,
    );
  }

  const access = (data?.[0] ?? null) as PortalAccess | null;

  let recentNotifications: NotificationBellItem[] = [];
  let unreadCount = 0;

  if (access?.account_status === "Active") {
    const [
      { data: notificationData, error: notificationError },
      { count, error: unreadError },
    ] = await Promise.all([
      supabase
        .from("notifications")
        .select(
          `
            id,
            notification_type,
            entity_type,
            entity_id,
            title,
            message,
            read_at,
            created_at
          `,
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),

      supabase
        .from("notifications")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("user_id", userId)
        .is("read_at", null),
    ]);

    if (notificationError) {
      throw new Error(
        `Unable to load recent notifications: ${notificationError.message}`,
      );
    }

    if (unreadError) {
      throw new Error(
        `Unable to load unread notifications: ${unreadError.message}`,
      );
    }

    const notifications =
      (notificationData ?? []) as PortalNotification[];

    const availabilityPollIds = Array.from(
      new Set(
        notifications
          .filter(
            (notification) =>
              notification.notification_type ===
                "AvailabilityReminder" &&
              notification.entity_type ===
                "MatchAvailabilityPoll" &&
              notification.entity_id,
          )
          .map((notification) =>
            Number(notification.entity_id),
          )
          .filter((pollId) => Number.isInteger(pollId)),
      ),
    );

    const availabilityPollMatches =
      new Map<number, string>();

    if (availabilityPollIds.length > 0) {
      const { data: pollData, error: pollError } =
        await supabase
          .from("match_availability_polls")
          .select("poll_id, match_id")
          .in("poll_id", availabilityPollIds);

      if (pollError) {
        throw new Error(
          `Unable to resolve availability notifications: ${pollError.message}`,
        );
      }

      for (const poll of (pollData ??
        []) as AvailabilityPollMatch[]) {
        availabilityPollMatches.set(
          poll.poll_id,
          poll.match_id,
        );
      }
    }

    recentNotifications = notifications.map(
      (notification) => ({
        ...notification,
        href: resolveNotificationHref(
          notification,
          availabilityPollMatches,
        ),
      }),
    );

    unreadCount = count ?? 0;
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      {access?.account_status === "Active" && (
        <PortalNavigation
          displayName={access.display_name}
          hasPlayerProfile={Boolean(access.player_id)}
          isSuperAdmin={access.account_role === "Super Admin"}
          hasTeamAdminAccess={access.team_ids.length > 0}
          notifications={recentNotifications}
          unreadNotificationCount={unreadCount}
        />
      )}

      {children}
    </div>
  );
}