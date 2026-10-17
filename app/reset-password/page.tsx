"use client";
import Image from "next/image";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"exchanging" | "ready" | "error" | "success">("exchanging");
  const [exchangeError, setExchangeError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setExchangeError("Invalid or expired reset link. Please request a new one.");
      setStatus("error");
      return;
    }

    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setExchangeError(error.message);
        setStatus("error");
      } else {
        setStatus("ready");
      }
    });
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setSubmitError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    setSubmitError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setSubmitError(error.message);
    } else {
      setStatus("success");
      setTimeout(() => router.replace("/pipeline"), 2000);
    }
  }

  return (
    <div className="min-h-screen bg-(--color-base) text-(--color-text-primary) flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
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
            {status === "success" ? "Password updated" : "Set a new password"}
          </h1>
        </div>

        {/* Exchanging code */}
        {status === "exchanging" && (
          <p className="text-center text-(--color-text-secondary) text-sm">Verifying your reset link…</p>
        )}

        {/* Bad link */}
        {status === "error" && (
          <div className="flex flex-col gap-4 text-center">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-6 py-5">
              <p className="text-red-400 text-sm">{exchangeError}</p>
            </div>
            <a
              href="/login"
              className="text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
            >
              ← Back to sign in
            </a>
          </div>
        )}

        {/* Success */}
        {status === "success" && (
          <div className="text-center">
            <div className="bg-(--color-accent-glow) border border-(--color-border-default) rounded-xl px-6 py-5">
              <p className="text-(--color-accent) font-medium text-sm">Password updated successfully</p>
              <p className="text-(--color-text-secondary) text-sm mt-1">Taking you to your dashboard…</p>
            </div>
          </div>
        )}

        {/* Password form */}
        {status === "ready" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase">
                New password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  placeholder="At least 8 characters"
                  className="w-full bg-(--color-elevated) border border-(--color-border-default) rounded-lg px-4 py-3 pr-11 text-sm text-(--color-text-primary) placeholder-(--color-text-tertiary) focus:outline-none focus:border-(--color-accent) transition-colors"
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase">
                Confirm password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  placeholder="Same password again"
                  className="w-full bg-(--color-elevated) border border-(--color-border-default) rounded-lg px-4 py-3 pr-11 text-sm text-(--color-text-primary) placeholder-(--color-text-tertiary) focus:outline-none focus:border-(--color-accent) transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {submitError && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-2 h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
