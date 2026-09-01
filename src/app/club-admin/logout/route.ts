import { NextResponse } from "next/server";
import { CLUB_ADMIN_COOKIE } from "../auth";

export async function POST() {
  const response = new NextResponse(
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
    value: "",
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax",
    path: "/club-admin",
    maxAge: 0,
  });

  return response;
}