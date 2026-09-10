import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const next =
    requestUrl.searchParams.get("next") ??
    "/portal";

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/portal/login?auth-error=recovery",
        request.url,
      ),
    );
  }

  const supabase = await createClient();

  const { error } =
    await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        "/portal/login?auth-error=recovery",
        request.url,
      ),
    );
  }

  const safeNext =
    next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/portal";

  return NextResponse.redirect(
    new URL(safeNext, request.url),
  );
}
