"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type NotificationActionResult = {
  ok: boolean;
  message: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

async function requireSignedInUser() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return {
      supabase,
      userId: null,
    };
  }

  return {
    supabase,
    userId: claimsData.claims.sub,
  };
}

function revalidateNotifications() {
  revalidatePath("/portal", "layout");
  revalidatePath("/portal/notifications");
}

export async function markNotificationAsRead(
  notificationId: number,
): Promise<NotificationActionResult> {
  try {
    if (
      !Number.isInteger(notificationId) ||
      notificationId <= 0
    ) {
      return {
        ok: false,
        message: "A valid notification is required.",
      };
    }

    const { supabase, userId } =
      await requireSignedInUser();

    if (!userId) {
      return {
        ok: false,
        message:
          "You must be signed in to update notifications.",
      };
    }

    const { error } = await supabase
      .from("notifications")
      .update({
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateNotifications();

    return {
      ok: true,
      message: "Notification marked as read.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export async function markAllNotificationsAsRead(): Promise<NotificationActionResult> {
  try {
    const { supabase, userId } =
      await requireSignedInUser();

    if (!userId) {
      return {
        ok: false,
        message:
          "You must be signed in to update notifications.",
      };
    }

    const { error } = await supabase
      .from("notifications")
      .update({
        read_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidateNotifications();

    return {
      ok: true,
      message: "All notifications marked as read.",
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}