"use client";
import Image from "next/image";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, uploadAvatar } from "@/lib/supabase/profile";
import AvatarEditor from "@/components/AvatarEditor";

export default function SetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"exchanging" | "ready" | "error" | "done">("exchanging");
  const [exchangeError, setExchangeError] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [username, setUsername] = useState("");
  const [avatarColor, setAvatarColor] = useState("amber");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let resolved = false;

    const resolve = (user: { email?: string | null } | null) => {
      if (resolved) return;
      resolved = true;
      if (user) {
        setEmail(user.email ?? "");
        setStatus("ready");
      } else {
        setExchangeError("Invalid or expired invite link. Please ask an admin to send a new one.");
        setStatus("error");
      }
    };

    // Parse hash tokens manually — createBrowserClient from @supabase/ssr does
    // not auto-detect implicit flow hash fragments the way the vanilla client does.
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      // Call setSession directly so the invited user's session is always used,
      // even if the admin is logged in on the same browser.
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
          resolve(error || !data.user ? null : data.user);
        });
    } else {
      // No hash tokens — check for an existing session (PKCE via /auth/callback).
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) resolve(user);
      });
    }

    // Fallback: show error if nothing resolves within 3s.
    const timer = setTimeout(() => resolve(null), 3000);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  async function handleAvatarUpload(file: File) {
    setAvatarUploading(true);
    const { url } = await uploadAvatar(file);
    if (url) setAvatarUrl(url);
    setAvatarUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setSubmitError("Passwords don't match.");
      return;
    }

    setSaving(true);
    setSubmitError("");

    const supabase = createClient();
    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      setSubmitError(pwError.message);
      setSaving(false);
      return;
    }

    const finalUsername = username.trim() || `user_${Math.random().toString(36).slice(2, 8)}`;

    const result = await updateProfile({
      username: finalUsername,
      avatarColor,
      ...(avatarUrl ? { avatarUrl } : {}),
    });

    setSaving(false);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }

    setStatus("done");
    setTimeout(() => router.replace("/app"), 1500);
  }

  return (
    <div className="min-h-screen bg-(--color-base) text-(--color-text-primary) flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
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
            {status === "done" ? "You're all set!" : "Set up your account"}
          </h1>
          {status === "ready" && (
            <p className="text-(--color-text-secondary) text-sm mt-1">
              Choose a password and tell us a bit about yourself.
            </p>
          )}
        </div>

        {status === "exchanging" && (
          <p className="text-center text-(--color-text-secondary) text-sm">Verifying your invite link…</p>
        )}

        {status === "error" && (
          <div className="flex flex-col gap-4 text-center">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-6 py-5">
              <p className="text-red-400 text-sm">{exchangeError}</p>
            </div>
          </div>
        )}

        {status === "done" && (
          <div className="text-center">
            <div className="bg-(--color-accent-glow) border border-(--color-border-default) rounded-xl px-6 py-5">
              <p className="text-(--color-accent) font-medium text-sm">Account created successfully</p>
              <p className="text-(--color-text-secondary) text-sm mt-1">Taking you to your dashboard…</p>
            </div>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Email — prefilled and locked */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase">
                Email
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="bg-(--color-elevated) border border-(--color-border-default) rounded-lg px-4 py-3 text-sm text-(--color-text-secondary) cursor-not-allowed"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase">
                Password
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

            {/* Confirm password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase">
                Confirm Password
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

            <div className="border-t border-(--color-border-default) pt-5">
              <p className="text-xs font-mono text-(--color-accent) tracking-widest mb-4">YOUR DETAILS</p>

              {/* Avatar */}
              <div className="flex flex-col gap-1.5 mb-5">
                <label className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase">Avatar</label>
                <AvatarEditor
                  initials={(username || email || "?").slice(0, 2).toUpperCase()}
                  avatarUrl={avatarUrl}
                  avatarColor={avatarColor}
                  uploading={avatarUploading}
                  size="lg"
                  onColorChange={setAvatarColor}
                  onUpload={handleAvatarUpload}
                />
              </div>

              {/* Username */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase">
                  Username <span className="normal-case text-(--color-text-tertiary)">(optional — one will be generated if left blank)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-(--color-text-secondary) text-sm select-none">@</span>
                  <input
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                    }
                    placeholder="janesmith"
                    className="w-full bg-(--color-elevated) border border-(--color-border-default) rounded-lg pl-8 pr-4 py-3 text-sm text-(--color-text-primary) placeholder-(--color-text-tertiary) focus:outline-none focus:border-(--color-accent) transition-colors"
                  />
                </div>
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
              className="h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? "Setting up…" : "Complete setup →"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
