"use client";

import { useRouter, usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { type ShellNavItem } from "./types";
import { useShellNavigate, isNavItemActive } from "./navigation";

interface Props {
  /** The current section's destinations. Four at most — the fifth slot is More. */
  navItems: ShellNavItem[];
  /** Currently active nav id, or null when the active view isn't a top-level item. */
  activeNavId: string | null;
  onNavigate: (id: string) => void;
  /** Hidden when there's only one section to be in. */
  showMore?: boolean;
}

/**
 * Mobile bottom tab bar — lg+ uses the sidebar instead.
 *
 * Five slots is the ceiling at 375px. The bar holds the section you're in, and
 * More is a route to the section switcher rather than a modal: it's a place you
 * navigate to, with a back button, not an overlay that traps you.
 */
export function BottomTabBar({ navItems, activeNavId, onNavigate, showMore = true }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const navigate = useShellNavigate(onNavigate);

  const primary = showMore ? navItems.slice(0, 4) : navItems.slice(0, 5);
  const moreActive = pathname === "/more";

  return (
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
            onClick={() => router.push("/more")}
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
  );
}
