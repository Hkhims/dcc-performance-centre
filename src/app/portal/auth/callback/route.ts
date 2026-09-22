import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getPublicOrigin(request: Request) {
  const requestUrl = new URL(request.url);

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();

  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (forwardedHost) {
    const protocol =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : requestUrl.protocol.replace(":", "");

    return `${protocol}://${forwardedHost}`;
  }

  return requestUrl.origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/portal";
  const publicOrigin = getPublicOrigin(request);

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/portal/login?auth-error=callback",
        publicOrigin,
      ),
    );
  }

  const supabase = await createClient();

  const { error } =
    await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        "/portal/login?auth-error=callback",
        publicOrigin,
      ),
    );
  }

  const safeNext =
    next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/portal";

  return NextResponse.redirect(
    new URL(safeNext, publicOrigin),
  );
}
