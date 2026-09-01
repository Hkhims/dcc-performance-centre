import crypto from "crypto";
import { cookies } from "next/headers";

export const CLUB_ADMIN_COOKIE =
  "dcc-club-admin";

export function getAdminPassword() {
  const password =
    process.env.CLUB_ADMIN_PASSWORD;

  if (!password) {
    throw new Error(
      "CLUB_ADMIN_PASSWORD is not configured.",
    );
  }

  return password;
}

export function getSessionToken(
  password: string,
) {
  return crypto
    .createHmac("sha256", password)
    .update("dcc-club-admin-session")
    .digest("hex");
}

export function passwordsMatch(
  suppliedPassword: string,
  correctPassword: string,
) {
  const supplied =
    Buffer.from(suppliedPassword);

  const correct =
    Buffer.from(correctPassword);

  if (
    supplied.length !==
    correct.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    supplied,
    correct,
  );
}

export async function isClubAdminAuthenticated() {
  const password =
    process.env.CLUB_ADMIN_PASSWORD;

  if (!password) {
    return false;
  }

  const cookieStore =
    await cookies();

  const cookieValue =
    cookieStore.get(
      CLUB_ADMIN_COOKIE,
    )?.value;

  if (!cookieValue) {
    return false;
  }

  const expectedToken =
    getSessionToken(password);

  const received =
    Buffer.from(cookieValue);

  const expected =
    Buffer.from(expectedToken);

  if (
    received.length !==
    expected.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    received,
    expected,
  );
}