"use client";
import { useActionState, useEffect, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { login, forgotPassword } from "./actions";
import { clearProfileCache } from "@/lib/profile-cache";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");

  // Arriving at /login means the user signed out — clear stale profile data
  useEffect(() => { clearProfileCache(); }, []);
  const [showPassword, setShowPassword] = useState(false);

  const [loginError, loginAction, loginPending] = useActionState(login, undefined);
  const [forgotState, forgotAction, forgotPending] = useActionState(forgotPassword, undefined);

  function switchToForgot() {
    setMode("forgot");
  }

  function switchToLogin() {
    setMode("login");
  }

  if (forgotState?.sent && mode !== "sent") {
    setMode("sent");
  }

  return (
    <div className="min-h-screen bg-(--color-base) text-(--color-text-primary) flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* The mark is line art — it needs size to stay legible, so it leads
              rather than sitting inline beside the wordmark.
              next/image rather than a bare <img>: the source is 8587px wide and
              1.5MB, and this renders at 120. Without resizing, every sign-in
              would pull the full file. */}
          <Image
            src="/PH-wht-logo.png"
            alt="Park Hawkins Capital"
            width={120}
            height={94}
            priority
            className="mx-auto mb-4"
          />
          <p className="text-[13px] uppercase tracking-[0.12em] font-medium">
            Park Hawkins Capital
          </p>
          <h1 className="text-2xl font-bold mt-4">
            {mode === "login" ? "Sign in to continue" : mode === "forgot" ? "Reset your password" : "Check your email"}
          </h1>
          <p className="text-(--color-text-secondary) text-sm mt-1">
            {mode === "login"
              ? "Pipeline and property tools"
              : mode === "forgot"
              ? "We'll send you a reset link"
              : "A reset link is on its way"}
          </p>
        </div>

        {/* ── Login form ── */}
        {mode === "login" && (
          <form action={loginAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="bg-(--color-elevated) border border-(--color-border-default) rounded-[var(--radius-md)] px-4 py-3 text-sm text-(--color-text-primary) placeholder-(--color-text-tertiary) focus:outline-none focus:border-(--color-accent) transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={switchToForgot}
                  className="text-xs text-(--color-text-secondary) hover:text-(--color-accent) transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-(--color-elevated) border border-(--color-border-default) rounded-[var(--radius-md)] px-4 py-3 pr-11 text-sm text-(--color-text-primary) placeholder-(--color-text-tertiary) focus:outline-none focus:border-(--color-accent) transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {loginError && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loginPending}
              className="mt-2 h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loginPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {/* ── Forgot password form ── */}
        {mode === "forgot" && (
          <form action={forgotAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="reset-email"
                className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase"
              >
                Email
              </label>
              <input
                id="reset-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                autoFocus
                className="bg-(--color-elevated) border border-(--color-border-default) rounded-[var(--radius-md)] px-4 py-3 text-sm text-(--color-text-primary) placeholder-(--color-text-tertiary) focus:outline-none focus:border-(--color-accent) transition-colors"
              />
            </div>

            {forgotState?.error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {forgotState.error}
              </p>
            )}

            <button
              type="submit"
              disabled={forgotPending}
              className="mt-2 h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {forgotPending ? "Sending…" : "Send reset link"}
            </button>

            <button
              type="button"
              onClick={switchToLogin}
              className="text-center text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
            >
              ← Back to sign in
            </button>
          </form>
        )}

        {/* ── Sent confirmation ── */}
        {mode === "sent" && (
          <div className="flex flex-col gap-4 text-center">
            {/* Success reads in the brand accent rather than a second green. */}
            <div className="bg-(--color-accent-glow) border border-(--color-border-default) rounded-[var(--radius-lg)] px-6 py-5">
              <p className="text-(--color-accent) font-medium text-sm">Reset link sent</p>
              <p className="text-(--color-text-secondary) text-sm mt-1">
                Check your inbox and click the link to set a new password. You can close this tab.
              </p>
            </div>
            <button
              type="button"
              onClick={switchToLogin}
              className="text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
            >
              ← Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
