import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-[#05070d] px-6 py-16 text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
        <section className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/30 sm:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-400">
            Dunmurry Cricket Club
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            Reset password
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Enter the email address linked to your DCC Portal
            account and we&apos;ll send you a reset link.
          </p>

          <ForgotPasswordForm />
        </section>
      </div>
    </main>
  );
}
