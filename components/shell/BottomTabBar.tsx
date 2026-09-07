"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { type ShellNavItem } from "./types";
import { useShellNavigate, isNavItemActive } from "./navigation";
import { MoreMenu } from "./MoreMenu";

interface Props {
  navItems: ShellNavItem[];
  /** Secondary destinations, shown behind the More tab. */
  moreItems?: ShellNavItem[];
  /** Currently active nav id, or null when the active view isn't a top-level item. */
  activeNavId: string | null;
  onNavigate: (id: string) => void;
}

/** Mobile bottom tab bar — lg+ uses the sidebar instead. */
export function BottomTabBar({ navItems, moreItems = [], activeNavId, onNavigate }: Props) {
  const pathname = usePathname();
  const navigate = useShellNavigate(onNavigate);
  const [moreOpen, setMoreOpen] = useState(false);

  // Five slots is the ceiling at 375px, so the fifth becomes More whenever there
  // are secondary destinations to hold.
  const showMore = moreItems.length > 0;
  const primary = showMore ? navItems.slice(0, 4) : navItems.slice(0, 5);
  const moreActive = moreItems.some((item) => isNavItemActive(item, activeNavId, pathname));

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-(--color-base) border-t border-(--color-border-subtle)"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="h-14 flex items-stretch">
          {primary.map((item) => {
            const { id, icon, label } = item;
            const active = isNavItemActive(item, activeNavId, pathname);
            return (
              <button
                key={id}
                onClick={() => navigate(item)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? "text-(--color-accent)" : "text-(--color-text-tertiary)"
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-colors ${active ? "bg-(--color-accent)/10" : ""}`}>
                  {icon}
                </div>
                <span className="text-[9px] uppercase tracking-wide font-medium">{label}</span>
              </button>
            );
          })}

          {showMore && (
            <button
              data-testid="nav-more"
              onClick={() => setMoreOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                moreActive ? "text-(--color-accent)" : "text-(--color-text-tertiary)"
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-colors ${moreActive ? "bg-(--color-accent)/10" : ""}`}>
                <MoreHorizontal size={16} />
              </div>
              <span className="text-[9px] uppercase tracking-wide font-medium">More</span>
            </button>
          )}
        </div>
      </nav>

      {moreOpen && (
        <MoreMenu
          items={moreItems}
          activeNavId={activeNavId}
          pathname={pathname}
          onSelect={navigate}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </>
  );
}
