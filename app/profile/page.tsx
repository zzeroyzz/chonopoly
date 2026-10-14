"use client";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import chapters from "@/data";
import { loadAllProgress, isChapterComplete, type AllProgress } from "@/lib/supabase/progress";
import { loadProfile, updateProfile, uploadAvatar, type Profile } from "@/lib/supabase/profile";
import { logout } from "@/app/login/actions";
import AdminTab from "@/components/AdminTab";
import AvatarEditor from "@/components/AvatarEditor";
import { getAvatarColors } from "@/lib/avatar";
import { readProfileCache, writeProfileCache } from "@/lib/profile-cache";

type PageTab = "Profile" | "Courses" | "Admin";

function ProgressCircle({ pct }: { pct: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const done = pct === 100;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#2e2e38" strokeWidth="4" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={done ? "#4ade80" : "#f59e0b"}
        strokeWidth="4" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 44 44)" style={{ transition: "stroke-dashoffset 0.4s ease" }} />
      <text x="44" y="44" textAnchor="middle" dominantBaseline="middle"
        fill={done ? "#4ade80" : "white"} fontSize="14" fontWeight="bold" fontFamily="monospace">
        {pct}%
      </text>
    </svg>
  );
}

export default function ProfilePage() {
  return <Suspense><ProfileContent /></Suspense>;
}

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab: PageTab = tabParam === "Courses" || tabParam === "Admin" ? tabParam : "Profile";
  function setTab(t: PageTab) { router.replace(`/profile?tab=${t}`, { scroll: false }); }

  // All start empty — server render produces empty, no hydration mismatch
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [profile, setProfile] = useState<Profile>({ username: null, last_chapter_id: null, last_tab_slug: null, role: "user", avatar_url: null, avatar_color: "amber", onboarding_complete: false, pay_cycle_start_day: 1, weekly_report_enabled: true, health_score_last_calculated: null });
  const [progress, setProgress] = useState<AllProgress>({});
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
      loadAllProgress(),
    ]).then(([{ data: { user } }, p, progressData]) => {
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
      setProgress(progressData);
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

  const completedCount = chapters.filter((ch) => {
    const p = progress[ch.id];
    return p && isChapterComplete(p);
  }).length;
  const pct = Math.round((completedCount / chapters.length) * 100);
  const continueHref = profile.last_chapter_id
    ? `/?chapter=${profile.last_chapter_id}${profile.last_tab_slug ? `&tab=${profile.last_tab_slug}` : ""}`
    : `/?chapter=${chapters[0].id}`;

  const groups: Record<string, typeof chapters> = {};
  chapters.forEach((ch) => {
    const g = ch.chapterNumber.split(".")[0];
    if (!groups[g]) groups[g] = [];
    groups[g].push(ch);
  });

  return (
    <div className="min-h-screen bg-[#0f0f11] text-[#e8e6df]">
      <div className="bg-[#18181c] border-b border-[#2e2e38] px-6 py-4">
        <Link href="/app" className="inline-flex items-center gap-1.5 text-[#7a7870] hover:text-amber-400 text-sm transition-colors">
          <ArrowLeft size={14} />
          Back to Finances
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
              <h1 className="text-white font-serif text-xl font-bold leading-tight">
                {username ? `@${username}` : email || "Your Profile"}
              </h1>
              {isAdmin ? (
                <span className="inline-flex items-center bg-amber-400/15 text-amber-400 font-mono text-[10px] tracking-widest px-2 py-0.5 rounded">ADMIN</span>
              ) : (
                <span className="inline-flex items-center bg-[#2e2e38] text-[#7a7870] font-mono text-[10px] tracking-widest px-2 py-0.5 rounded">USER</span>
              )}
            </div>
            <p className="text-[#7a7870] text-sm">{email}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#2e2e38] mb-8">
          {(["Profile", "Courses", ...(isAdmin ? ["Admin"] : [])] as PageTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t ? "text-amber-400 border-amber-400" : "text-[#7a7870] border-transparent hover:text-[#e8e6df]"
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Profile tab */}
        {activeTab === "Profile" && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#7a7870] tracking-widest uppercase">Email</label>
              <input disabled value={email}
                className="bg-[#18181c] border border-[#2e2e38] rounded-lg px-4 py-3 text-sm text-[#7a7870] cursor-not-allowed" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#7a7870] tracking-widest uppercase">Username</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7a7870] text-sm select-none">@</span>
                <input value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="username"
                  className="w-full bg-[#18181c] border border-[#2e2e38] rounded-lg pl-8 pr-4 py-3 text-sm text-[#e8e6df] placeholder-[#4a4a55] focus:outline-none focus:border-amber-500 transition-colors" />
              </div>
            </div>

            {saveMsg && (
              <p className={`text-sm px-4 py-3 rounded-lg border ${saveMsg.error ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"}`}>
                {saveMsg.text}
              </p>
            )}

            <div className="flex items-center gap-4 mt-1">
              <button onClick={handleSave} disabled={saving}
                className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-medium text-sm rounded-lg px-5 py-2.5 transition-colors">
                {saving ? "Saving…" : "Save changes"}
              </button>
              <form action={logout}>
                <button type="submit" className="text-sm text-[#7a7870] hover:text-red-400 transition-colors">Sign out</button>
              </form>
            </div>
          </div>
        )}

        {/* Admin tab */}
        {activeTab === "Admin" && isAdmin && <AdminTab />}

        {/* Courses tab */}
        {activeTab === "Courses" && (
          <div>
            <div className="bg-[#18181c] border border-[#2e2e38] rounded-xl p-6 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6">
                <ProgressCircle pct={pct} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-amber-400 tracking-widest mb-1">ACTIVE COURSE</p>
                  <h2 className="text-white font-serif text-lg font-bold leading-tight">Georgia Real Estate Exam Prep</h2>
                  <p className="text-[#7a7870] text-sm mt-1">{completedCount} of {chapters.length} chapters complete</p>
                  <Link href={continueHref}
                    className="inline-flex items-center gap-1.5 mt-4 bg-amber-400 hover:bg-amber-300 text-black font-medium text-sm rounded-lg px-4 py-2 transition-colors">
                    Continue where you left off →
                  </Link>
                </div>
              </div>
            </div>

            <p className="text-[#7a7870] text-xs tracking-widest uppercase mb-4">Chapter Breakdown</p>
            <div className="flex flex-col gap-5">
              {Object.entries(groups).map(([group, chs]) => (
                <div key={group}>
                  <p className="text-[#7a7870] font-mono text-[10px] tracking-widest mb-2 uppercase">Chapter {group}</p>
                  <div className="flex flex-col gap-1">
                    {chs.map((ch) => {
                      const p = progress[ch.id];
                      const complete = p ? isChapterComplete(p) : false;
                      return (
                        <Link key={ch.id} href={`/?chapter=${ch.id}`}
                          className="flex items-center gap-3 bg-[#18181c] border border-[#2e2e38] hover:border-amber-500/30 rounded-lg px-4 py-3 transition-colors group">
                          <span className="font-mono text-[11px] text-[#7a7870] shrink-0">{ch.chapterNumber}</span>
                          <span className="flex-1 text-sm text-[#c8c5bc] group-hover:text-white transition-colors truncate">{ch.title}</span>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${complete ? "bg-emerald-400" : "bg-[#2e2e38]"}`} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
