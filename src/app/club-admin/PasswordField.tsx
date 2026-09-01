"use client";

import { useState } from "react";

export default function PasswordField() {
  const [showPassword, setShowPassword] =
    useState(false);

  return (
    <div className="mt-2">
      <div className="relative">
        <input
          id="password"
          name="password"
          type={
            showPassword
              ? "text"
              : "password"
          }
          required
          autoComplete="current-password"
          placeholder="Enter club admin password"
          className="w-full rounded-xl border border-white/10 bg-[#07101d] px-4 py-3 pr-24 text-white outline-none transition placeholder:text-slate-600 focus:border-[#d4af37]/60"
        />

        <button
          type="button"
          onClick={() =>
            setShowPassword(
              (current) => !current,
            )
          }
          className="absolute inset-y-0 right-0 flex items-center px-4 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition hover:text-[#d4af37]"
          aria-label={
            showPassword
              ? "Hide password"
              : "Show password"
          }
        >
          {showPassword
            ? "Hide"
            : "Show"}
        </button>
      </div>
    </div>
  );
}