/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";

import { getAvatarColors } from "@/lib/avatar";
import { type ShellUserProfile } from "./types";

interface Props {
  /** App name shown top-left, e.g. "Park Hawkins Capital". */
  appName: string;
  /** Optional pill under the app name — the active team, when one is selected. */

  userProfile: ShellUserProfile | null;
}

export function MobileTopBar({ appName, userProfile }: Props) {
  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-(--color-base) border-b border-(--color-border-subtle) flex items-center justify-between px-4 shrink-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-[0.12em] text-(--color-text-disabled) font-medium">
          {appName}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {userProfile && (() => {
          const c = getAvatarColors(userProfile.avatarColor);
          const initials = userProfile.name ? userProfile.name.slice(0, 2).toUpperCase() : "··";
          return (
            <Link href="/settings" aria-label="You" className="flex items-center">
              <div className={`w-8 h-8 rounded-full shrink-0 border overflow-hidden flex items-center justify-center ${c.bg} ${c.border}`}>
                {userProfile.avatarUrl
                  ? <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <span className={`${c.text} font-(--font-mono) font-bold text-[10px]`}>{initials}</span>
                }
              </div>
            </Link>
          );
        })()}
      </div>
    </div>
  );
}
