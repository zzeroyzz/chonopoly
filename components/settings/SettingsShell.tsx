"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { type ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";

const SETTINGS_TABS = [
  { href: "/settings/profile", label: "Income & debts" },
  { href: "/settings/defaults", label: "Defaults" },
  { href: "/settings/account", label: "Account" },
] as const;

/**
 * The frame every settings screen sits in.
 *
 * These pages were standalone, which was survivable while Settings was reached
 * from a dropdown. It is a nav destination now, and a destination you can enter
 * but not leave is a trap — so they get the shell like everything else.
 *
 * Team and integrations are deliberately absent: neither has a screen, and a
 * tab pointing at nothing is worse than a missing one.
 */
export function SettingsShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={null}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings/account")}
    >
      <div className="overflow-y-auto flex-1 w-full px-5 py-6 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold mb-1 text-(--color-text-primary)">{title}</h1>
        <p className="text-[12px] text-(--color-text-secondary) mb-4 leading-relaxed">
          {description}
        </p>

        <div className="flex gap-1 border-b border-(--color-border-default) mb-5 overflow-x-auto">
          {SETTINGS_TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                data-testid={`settings-tab-${t.href.split("/").pop()}`}
                className={`px-3 py-2 text-[13px] border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active
                    ? "text-(--color-accent) border-(--color-accent) font-medium"
                    : "text-(--color-text-secondary) border-transparent hover:text-(--color-text-primary)"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </AppShell>
  );
}
