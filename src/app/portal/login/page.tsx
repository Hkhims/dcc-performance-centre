import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function PortalLoginPage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect("/portal");
  }

  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-16 text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
        <section className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30 sm:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-400">
            Dunmurry Cricket Club
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            DCC Portal
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Sign in with your DCC account to access your authorised club tools.
          </p>

          <LoginForm />
        </section>
      </div>
    </main>
  );
}
