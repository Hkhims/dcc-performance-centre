"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage("");

    const supabase = createClient();

    const redirectTo =
      `${window.location.origin}` +
      "/portal/auth/callback?next=/portal/reset-password";

    const { error } =
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

    if (error) {
      setErrorMessage(
        "We could not send the password reset email. Please try again.",
      );
      setSubmitting(false);
      return;
    }

    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <div className="mt-8 space-y-5">
        <div className="rounded-xl border border-green-400/20 bg-green-400/10 px-4 py-4 text-sm leading-6 text-green-100">
          If that email address belongs to a DCC Portal account,
          a password reset link has been sent.
        </div>

        <Link
          href="/portal/login"
          className="inline-flex text-sm font-medium text-amber-400 transition hover:text-amber-300"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-zinc-200"
        >
          Email
        </label>

        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-amber-400/70"
        />
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
        >
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send reset link"}
      </button>

      <div className="text-center">
        <Link
          href="/portal/login"
          className="text-sm font-medium text-zinc-400 transition hover:text-white"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
