"use client";

import Link from "next/link";
import { useState } from "react";
import {
  notificationTypeLabel,
  type PortalNotification,
} from "./notifications/notification-routing";
import NotificationLink from "./notifications/NotificationLink";

export type NotificationBellItem = PortalNotification & {
  href: string;
};

type NotificationBellProps = {
  notifications: NotificationBellItem[];
  unreadCount: number;
};

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const difference = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (difference < minute) {
    return "Just now";
  }

  if (difference < hour) {
    const minutes = Math.floor(difference / minute);
    return `${minutes}m ago`;
  }

  if (difference < day) {
    const hours = Math.floor(difference / hour);
    return `${hours}h ago`;
  }

  const days = Math.floor(difference / day);

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export default function NotificationBell({
  notifications,
  unreadCount,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-lg transition hover:bg-white/10"
      >
        <span aria-hidden="true">🔔</span>

        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black leading-none text-black">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div className="absolute right-0 z-50 mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#11151f] shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div>
                <p className="font-bold text-white">
                  Notifications
                </p>

                <p className="mt-0.5 text-xs text-zinc-500">
                  {unreadCount === 0
                    ? "You're all caught up."
                    : `${unreadCount} unread`}
                </p>
              </div>

              <Link
                href="/portal/notifications"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-amber-300 transition hover:text-amber-200"
              >
                View all
              </Link>
            </div>

            {notifications.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-semibold text-zinc-300">
                  Nothing new here
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Match and team updates will appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-[28rem] overflow-y-auto">
                {notifications.map((notification) => {
                  const unread = !notification.read_at;

                  return (
                    <NotificationLink
  key={notification.id}
  notificationId={notification.id}
  href={notification.href}
  unread={unread}
  onNavigate={() => setOpen(false)}
  className={`block border-b border-white/[0.07] px-4 py-4 transition last:border-b-0 ${
    unread
      ? "bg-amber-400/[0.055] hover:bg-amber-400/[0.09]"
      : "hover:bg-white/[0.04]"
  }`}
>
                      <div className="flex gap-3">
                        <span
                          aria-label={
                            unread ? "Unread" : "Read"
                          }
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            unread
                              ? "bg-amber-400"
                              : "bg-zinc-700"
                          }`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-400">
                              {notificationTypeLabel(
                                notification.notification_type,
                              )}
                            </p>

                            <p className="shrink-0 text-[11px] text-zinc-600">
                              {formatRelativeTime(
                                notification.created_at,
                              )}
                            </p>
                          </div>

                          <p
                            className={`mt-1 truncate text-sm ${
                              unread
                                ? "font-bold text-white"
                                : "font-semibold text-zinc-300"
                            }`}
                          >
                            {notification.title}
                          </p>

                          {notification.message ? (
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                              {notification.message}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </NotificationLink>
                  );
                })}
              </div>
            )}

            <div className="border-t border-white/10 p-3">
              <Link
                href="/portal/notifications"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-center text-sm font-semibold text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                See all notifications
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}