"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { SETTINGS_SECTIONS } from "@/components/settings/SettingsShell";
import { useShellProfile } from "@/components/crm/useCrmContext";
import { getAvatarColors } from "@/lib/avatar";
import { logout } from "@/app/login/actions";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * You, and the four things behind you.
 *
 * The bar's last slot used to be a gear that opened `/settings/profile`
 * directly — so tapping "Settings" landed you in a form about your debts, with
 * the other three areas reachable only from a tab strip you had to notice.
 *
 * This is the way in instead. Each area gets a row that says what is behind it
 * rather than a one-word label you have to have learned: "Defaults" meant
 * nothing, and "Where every screening starts" means something. The sentences
 * are not new — they are what those pages already showed at the top.
 */
export default function SettingsHubPage() {
  const router = useRouter();
  const profile = useShellProfile();
  const colors = getAvatarColors(profile?.avatarColor ?? null);
  const initials = (profile?.name ?? "").trim().slice(0, 2).toUpperCase();

  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={profile}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings")}
    >
      <div className="overflow-y-auto flex-1 w-full px-4 pb-24 lg:px-8 lg:pb-8 max-w-3xl">
        <h1 className="text-[18px] font-semibold text-(--color-text-primary) mt-4 mb-4">You</h1>

        {/* Who you are signed in as. The one question this screen answers
            without being asked, and the reason a wrong account is obvious. */}
        <div className="flex items-center gap-3 p-4 rounded-(--radius-xl) border border-(--color-border-default) bg-(--color-elevated)">
          <span
            className={`flex items-center justify-center w-14 h-14 shrink-0 rounded-(--radius-pill)
              overflow-hidden border ${colors.border} ${colors.bg}`}
          >
            {profile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className={`text-[16px] font-semibold ${colors.text}`}>{initials || "··"}</span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            {profile === null ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-[16px] font-semibold text-(--color-text-primary) truncate">
                    {profile.name || "No name yet"}
                  </p>
                  {profile.role === "admin" && (
                    <span className="shrink-0 inline-flex items-center bg-(--color-accent-glow) text-(--color-accent) font-(--font-mono) text-[10px] tracking-widest px-2 py-0.5 rounded">
                      ADMIN
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-(--color-text-secondary) truncate">
                  {profile.email || "Signed in"}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-4">
          {SETTINGS_SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              data-testid={`hub-${section.href.split("/").pop()}`}
              className="flex items-start gap-3 p-4 rounded-(--radius-lg) border border-(--color-border-default)
                bg-(--color-surface) hover:border-(--color-border-strong) transition-colors"
            >
              <span className="shrink-0 mt-0.5 text-(--color-text-secondary)">{section.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-(--color-text-primary)">
                  {section.label}
                </span>
                {/* The row says what is behind it, so the label does not have
                    to carry the whole meaning on its own. */}
                <span className="block text-[12px] text-(--color-text-secondary) leading-relaxed mt-0.5">
                  {section.description}
                </span>
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 mt-0.5 text-(--color-text-tertiary)"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>

        {/* Last, and apart. It is the one thing here you cannot undo with a
            second tap, so it does not sit in the list you are scrolling. */}
        <form action={logout} className="mt-6">
          <button
            type="submit"
            data-testid="hub-sign-out"
            className="w-full flex items-center justify-center gap-2 min-h-11 px-4 rounded-(--radius-lg)
              border border-(--color-border-default) text-[14px] text-(--color-text-secondary)
              hover:text-red-400 hover:border-red-400/40 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </form>
      </div>
    </AppShell>
  );
}
