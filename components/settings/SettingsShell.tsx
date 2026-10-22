"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { type ReactNode } from "react";
import { Wallet, SlidersHorizontal, Plug, CircleUser } from "lucide-react";

export interface SettingsSection {
  href: string;
  /** What it is called, everywhere it is called anything. */
  label: string;
  /** One line saying what is behind it, in the owner's words. */
  description: string;
  icon: ReactNode;
}

/**
 * The four areas, defined once.
 *
 * This list used to be labels only, and each page passed its own title and
 * description to this shell. So the tab read "Defaults" while the page it
 * opened was titled "Loan & cost defaults" — two names for one thing, in two
 * files, already drifted. The pages now take both from here.
 *
 * The descriptions are not new copy. Three of them are the sentences those
 * pages were already showing; only Account's is written here, because that
 * page never used this shell and so never had one.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    href: "/settings/profile",
    label: "Income & debts",
    description:
      "Entered once and used for every house you screen. Nothing re-runs on its own — saved analyses tell you when these numbers have moved.",
    icon: <Wallet size={16} />,
  },
  {
    href: "/settings/defaults",
    label: "Loan & cost defaults",
    description:
      "Where every screening starts. A scenario can still override any of these — this is what saves you retyping the same rate for every house.",
    icon: <SlidersHorizontal size={16} />,
  },
  {
    href: "/settings/integrations",
    label: "Integrations",
    description:
      "Outside data the app pulls in, and what's left of this month's allowance. Screening one property spends one RentCast request.",
    icon: <Plug size={16} />,
  },
  {
    href: "/settings/account",
    label: "Account",
    description: "Your name, your photo, and the way you sign in.",
    icon: <CircleUser size={16} />,
  },
];

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
  /** Both default to the section this route belongs to, which is the point of the list. */
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const section = SETTINGS_SECTIONS.find((s) => s.href === pathname);

  return (
    <>
      <div className="overflow-y-auto flex-1 w-full px-5 py-6 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold mb-1 text-(--color-text-primary)">
          {title ?? section?.label ?? "Settings"}
        </h1>
        <p className="text-[12px] text-(--color-text-secondary) mb-4 leading-relaxed">
          {description ?? section?.description}
        </p>

        <div className="flex gap-1 border-b border-(--color-border-default) mb-5 overflow-x-auto">
          {SETTINGS_SECTIONS.map((t) => {
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
    </>
  );
}
