import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markAllNotificationsAsRead } from "./actions";
import NotificationLink from "./NotificationLink";
import {
  notificationTypeLabel,
  resolveNotificationHref,
  type PortalNotification,
} from "./notification-routing";

type AvailabilityPollMatch = {
  poll_id: number;
  match_id: string;
};

function formatNotificationDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function NotificationsPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/portal/login");
  }

  const userId = claimsData.claims.sub;

  const { data: notificationData, error: notificationError } =
    await supabase
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
      .limit(100);

  if (notificationError) {
    throw new Error(
      `Unable to load notifications: ${notificationError.message}`,
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

  const availabilityPollMatches = new Map<number, string>();

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

  const unreadCount = notifications.filter(
    (notification) => !notification.read_at,
  ).length;

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-4xl">
        <header className="border-b border-white/10 pb-8">
          <Link
            href="/portal"
            className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"
          >
            ← Back to Portal
          </Link>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-400">
                DCC App
              </p>

              <h1 className="mt-2 text-4xl font-bold tracking-tight">
                Notifications
              </h1>

              <p className="mt-3 text-zinc-400">
                {unreadCount === 0
                  ? "You're all caught up."
                  : `${unreadCount} unread ${
                      unreadCount === 1
                        ? "notification"
                        : "notifications"
                    }.`}
              </p>
            </div>

            {unreadCount > 0 ? (
              <form
                action={async () => {
                  "use server";
                  await markAllNotificationsAsRead();
                }}
              >
                <button
                  type="submit"
                  className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
                >
                  Mark all as read
                </button>
              </form>
            ) : null}
          </div>
        </header>

        <section className="py-8">
          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
              <div
                aria-hidden="true"
                className="text-3xl"
              >
                🔔
              </div>

              <h2 className="mt-4 text-xl font-bold">
                No notifications yet
              </h2>

              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-400">
                Match updates, availability reminders and
                published team selections will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => {
                const href = resolveNotificationHref(
                  notification,
                  availabilityPollMatches,
                );

                const unread = !notification.read_at;

                return (
                  <NotificationLink
                    key={notification.id}
                    notificationId={notification.id}
                    href={href}
                    unread={unread}
                    className={`group block rounded-2xl border p-5 transition ${
                      unread
                        ? "border-amber-400/20 bg-amber-400/[0.06] hover:bg-amber-400/[0.1]"
                        : "border-white/10 bg-white/[0.025] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex gap-4">
                      <div className="pt-1">
                        <span
                          aria-label={
                            unread ? "Unread" : "Read"
                          }
                          className={`block h-2.5 w-2.5 rounded-full ${
                            unread
                              ? "bg-amber-400"
                              : "bg-zinc-700"
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">
                            {notificationTypeLabel(
                              notification.notification_type,
                            )}
                          </span>

                          <span className="text-xs text-zinc-500">
                            {formatNotificationDate(
                              notification.created_at,
                            )}
                          </span>
                        </div>

                        <h2
                          className={`mt-2 text-base ${
                            unread
                              ? "font-bold text-white"
                              : "font-semibold text-zinc-300"
                          }`}
                        >
                          {notification.title}
                        </h2>

                        {notification.message ? (
                          <p className="mt-1 text-sm leading-6 text-zinc-400">
                            {notification.message}
                          </p>
                        ) : null}

                        <p className="mt-3 text-xs font-semibold text-zinc-500 transition group-hover:text-amber-300">
                          View →
                        </p>
                      </div>
                    </div>
                  </NotificationLink>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}