export type PortalNotification = {
  id: number;
  notification_type: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  message: string | null;
  read_at: string | null;
  created_at: string;
};

type AvailabilityPollMatch = {
  poll_id: number;
  match_id: string;
};

export function resolveNotificationHref(
  notification: PortalNotification,
  availabilityPollMatches: Map<number, string>,
) {
  if (
    notification.notification_type ===
      "AvailabilityReminder" &&
    notification.entity_type ===
      "MatchAvailabilityPoll" &&
    notification.entity_id
  ) {
    const pollId = Number(notification.entity_id);

    if (Number.isInteger(pollId)) {
      const matchId = availabilityPollMatches.get(pollId);

      if (matchId) {
        return `/portal/fixtures/${matchId}#availability`;
      }
    }
  }

  if (
    notification.notification_type ===
      "TeamSelectionPublished" &&
    notification.entity_type === "Match" &&
    notification.entity_id
  ) {
    return `/portal/fixtures/${notification.entity_id}#team-selection`;
  }

  if (
    notification.notification_type === "MatchStarted" &&
    notification.entity_type === "Match" &&
    notification.entity_id
  ) {
    return `/portal/fixtures/${notification.entity_id}`;
  }

  if (
    notification.notification_type ===
      "MatchResultPublished" &&
    notification.entity_type === "Match" &&
    notification.entity_id
  ) {
    return `/matches/${notification.entity_id}`;
  }

  return "/portal/notifications";
}

export function notificationTypeLabel(
  notificationType: string,
) {
  switch (notificationType) {
    case "AvailabilityReminder":
      return "Availability";

    case "TeamSelectionPublished":
      return "Team Selection";

    case "MatchStarted":
      return "Match";

    case "MatchResultPublished":
      return "Result";

    default:
      return "Notification";
  }
}