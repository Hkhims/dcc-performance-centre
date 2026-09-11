import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    const protocol = forwardedProto ?? "https";

    return `${protocol}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  await supabase.auth.signOut();

  const origin = getRequestOrigin(request);

  return NextResponse.redirect(
    new URL("/portal/login", origin),
    {
      status: 303,
    },
  );
}