"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markNotificationAsRead } from "./actions";

type NotificationLinkProps = {
  notificationId: number;
  href: string;
  unread: boolean;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
};

export default function NotificationLink({
  notificationId,
  href,
  unread,
  className,
  children,
  onNavigate,
}: NotificationLinkProps) {
  const router = useRouter();

  async function handleClick(
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    if (!unread) {
      onNavigate?.();
      return;
    }

    event.preventDefault();

    const result = await markNotificationAsRead(
      notificationId,
    );

    onNavigate?.();

    /*
     * Reading the notification is secondary to navigation.
     * Even if the mutation fails, the user still reaches the
     * intended destination.
     */
    router.push(href);

    if (result.ok) {
      router.refresh();
    }
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={className}
    >
      {children}
    </Link>
  );
}