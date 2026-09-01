import { NextResponse } from "next/server";
import {
  CLUB_ADMIN_COOKIE,
  getAdminPassword,
  getSessionToken,
  passwordsMatch,
} from "../auth";

export async function POST(request: Request) {
  const formData = await request.formData();

  const submittedPassword = String(
    formData.get("password") ?? "",
  );

  const correctPassword =
    getAdminPassword();

  if (
    !passwordsMatch(
      submittedPassword,
      correctPassword,
    )
  ) {
    return new NextResponse(
      null,
      {
        status: 303,
        headers: {
          Location:
            "/club-admin?error=invalid-password",
        },
      },
    );
  }

  const response =
    new NextResponse(
      null,
      {
        status: 303,
        headers: {
          Location: "/club-admin",
        },
      },
    );

  response.cookies.set({
    name: CLUB_ADMIN_COOKIE,
    value: getSessionToken(
      correctPassword,
    ),
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax",
    path: "/club-admin",
    maxAge: 60 * 60 * 8,
  });

  return response;
}