/* eslint-disable @next/next/no-img-element */
"use client";

import { type ReactNode } from "react";
import { getAvatarColors } from "@/lib/avatar";
import { type ShellUserProfile } from "./types";

interface Props {
  /** App name shown top-left, e.g. "Park Properties". */
  appName: string;
  /** Optional pill under the app name — the active team, when one is selected. */
  badge?: string | null;
  /** Feature-specific actions rendered left of the avatar, e.g. the refresh button. */
  actions?: ReactNode;
  userProfile: ShellUserProfile | null;
  onProfileClick: () => void;
}

export function MobileTopBar({ appName, badge, actions, userProfile, onProfileClick }: Props) {
  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-(--color-base) border-b border-(--color-border-subtle) flex items-center justify-between px-4 shrink-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-[0.12em] text-(--color-text-disabled) font-medium">
          {appName}
        </span>
        {badge && (
          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-(--color-accent)/15 text-(--color-accent) border border-(--color-accent)/30 self-start">
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {userProfile && (() => {
          const c = getAvatarColors(userProfile.avatarColor);
          const initials = userProfile.name ? userProfile.name.slice(0, 2).toUpperCase() : "··";
          return (
            <button
              onClick={onProfileClick}
              aria-label="Open profile"
              className="flex items-center"
            >
              <div className={`w-8 h-8 rounded-full shrink-0 border overflow-hidden flex items-center justify-center ${c.bg} ${c.border}`}>
                {userProfile.avatarUrl
                  ? <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <span className={`${c.text} font-(--font-mono) font-bold text-[10px]`}>{initials}</span>
                }
              </div>
            </button>
          );
        })()}
      </div>
    </div>
  );
}
