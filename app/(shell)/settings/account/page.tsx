"use client";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loadProfile, updateProfile, uploadAvatar, type Profile } from "@/lib/supabase/profile";
import { logout } from "@/app/login/actions";
import AdminTab from "@/components/AdminTab";
import AvatarEditor from "@/components/AvatarEditor";
import { getAvatarColors } from "@/lib/avatar";
import { readProfileCache, writeProfileCache } from "@/lib/profile-cache";

type PageTab = "Profile" | "Admin";

export default function ProfilePage() {
  return <Suspense><ProfileContent /></Suspense>;
}

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  // An old ?tab=Courses link falls through to Profile rather than rendering nothing.
  const activeTab: PageTab = tabParam === "Admin" ? tabParam : "Profile";
  function setTab(t: PageTab) { router.replace(`/profile?tab=${t}`, { scroll: false }); }

  // All start empty — server render produces empty, no hydration mismatch
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [profile, setProfile] = useState<Profile>({ username: null, last_chapter_id: null, last_tab_slug: null, role: "user", avatar_url: null, avatar_color: "amber", onboarding_complete: false, pay_cycle_start_day: 1, weekly_report_enabled: true, health_score_last_calculated: null });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarColor, setAvatarColor] = useState("amber");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    const cached = readProfileCache();
    if (cached) {
      setEmail(cached.email);
      setUsername(cached.username);
      setRole(cached.role);
      setAvatarUrl(cached.avatarUrl);
      setAvatarColor(cached.avatarColor);
    }

    Promise.all([
      createClient().auth.getUser(),
      loadProfile(),
    ]).then(([{ data: { user } }, p]) => {
      const userEmail = user?.email ?? "";
      const uname = p.username ?? "";
      const url = p.avatar_url ?? null;
      const color = p.avatar_color ?? "amber";
      setEmail(userEmail);
      setUsername(uname);
      setRole(p.role);
      setProfile(p);
      setAvatarUrl(url);
      setAvatarColor(color);
      writeProfileCache({
        email: userEmail,
        username: uname,
        role: p.role,
        initials: uname ? uname.slice(0, 2).toUpperCase() : userEmail.slice(0, 2).toUpperCase(),
        avatarUrl: url,
        avatarColor: color,
      });
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    const result = await updateProfile({ username: username || null });
    setSaving(false);
    if (result.error) {
      setSaveMsg({ text: result.error, error: true });
    } else {
      setSaveMsg({ text: "Changes saved.", error: false });
      writeProfileCache({
        email,
        username,
        role,
        initials: username ? username.slice(0, 2).toUpperCase() : email.slice(0, 2).toUpperCase(),
        avatarUrl,
        avatarColor,
      });
    }
    setTimeout(() => setSaveMsg(null), 3000);
  }

  async function handleAvatarUpload(file: File) {
    setAvatarUploading(true);
    const { url, error } = await uploadAvatar(file);
    if (error || !url) { setAvatarUploading(false); return; }
    await updateProfile({ avatarUrl: url });
    setAvatarUrl(url);
    setAvatarUploading(false);
    writeProfileCache({ email, username, role, initials, avatarUrl: url, avatarColor });
  }

  async function handleColorChange(color: string) {
    setAvatarColor(color);
    await updateProfile({ avatarColor: color });
    writeProfileCache({ email, username, role, initials, avatarUrl, avatarColor: color });
  }

  async function handleAvatarRemove() {
    await updateProfile({ avatarUrl: null });
    setAvatarUrl(null);
    writeProfileCache({ email, username, role, initials, avatarUrl: null, avatarColor });
  }

  const isAdmin = role === "admin";
  const initials = (username || email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-(--color-base) text-(--color-text-primary)">
      <div className="bg-(--color-elevated) border-b border-(--color-border-default) px-6 py-4">
        <Link href="/properties" className="inline-flex items-center gap-1.5 text-(--color-text-secondary) hover:text-(--color-accent) text-sm transition-colors">
          <ArrowLeft size={14} />
          Back to Home
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10">
        {/* Identity header */}
        <div className="flex items-center gap-4 mb-8">
          <AvatarEditor
            initials={initials}
            avatarUrl={avatarUrl}
            avatarColor={avatarColor}
            uploading={avatarUploading}
            size="md"
            onColorChange={handleColorChange}
            onUpload={handleAvatarUpload}
            onRemove={handleAvatarRemove}
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-white text-xl font-bold leading-tight">
                {username ? `@${username}` : email || "Your Profile"}
              </h1>
              {isAdmin ? (
                <span className="inline-flex items-center bg-(--color-accent-glow) text-(--color-accent) font-mono text-[10px] tracking-widest px-2 py-0.5 rounded">ADMIN</span>
              ) : (
                <span className="inline-flex items-center bg-(--color-border-default) text-(--color-text-secondary) font-mono text-[10px] tracking-widest px-2 py-0.5 rounded">USER</span>
              )}
            </div>
            <p className="text-(--color-text-secondary) text-sm">{email}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-(--color-border-default) mb-8">
          {(["Profile", ...(isAdmin ? ["Admin"] : [])] as PageTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t ? "text-(--color-accent) border-(--color-accent)" : "text-(--color-text-secondary) border-transparent hover:text-(--color-text-primary)"
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Profile tab */}
        {activeTab === "Profile" && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase">Email</label>
              <input disabled value={email}
                className="bg-(--color-elevated) border border-(--color-border-default) rounded-lg px-4 py-3 text-sm text-(--color-text-secondary) cursor-not-allowed" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-(--color-text-secondary) tracking-widest uppercase">Username</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-(--color-text-secondary) text-sm select-none">@</span>
                <input value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="username"
                  className="w-full bg-(--color-elevated) border border-(--color-border-default) rounded-lg pl-8 pr-4 py-3 text-sm text-(--color-text-primary) placeholder-(--color-text-tertiary) focus:outline-none focus:border-(--color-accent) transition-colors" />
              </div>
            </div>

            {saveMsg && (
              <p className={`text-sm px-4 py-3 rounded-lg border ${saveMsg.error ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"}`}>
                {saveMsg.text}
              </p>
            )}

            <div className="flex items-center gap-4 mt-1">
              <button onClick={handleSave} disabled={saving}
                className="h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold px-5 disabled:opacity-50 transition-opacity">
                {saving ? "Saving…" : "Save changes"}
              </button>
              <form action={logout}>
                <button type="submit" className="text-sm text-(--color-text-secondary) hover:text-red-400 transition-colors">Sign out</button>
              </form>
            </div>
          </div>
        )}

        {/* Admin tab */}
        {activeTab === "Admin" && isAdmin && <AdminTab />}

      </div>
    </div>
  );
}
