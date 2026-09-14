"use client";

import { useRouter, usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { type ShellNavItem } from "./types";
import { useShellNavigate, isNavItemActive } from "./navigation";

interface Props {
  /** The current section's destinations. Four at most — the fifth slot is More. */
  navItems: ShellNavItem[];
  /** Currently active nav id, or null when the active view isn't a top-level item. */
  activeNavId: string | null;
  onNavigate: (id: string) => void;
  /** Hidden when there's nowhere else to go. */
  showHub?: boolean;
}

/**
 * Mobile bottom tab bar — lg+ uses the sidebar instead.
 *
 * Five slots is the ceiling at 375px, so the bar holds the module you're in and
 * the fifth slot goes home to the hub. No section switcher and no More drawer:
 * with peer modules you don't need somewhere to put leftovers, you need a way
 * back to the place you chose from.
 */
export function BottomTabBar({ navItems, activeNavId, onNavigate, showHub = true }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const navigate = useShellNavigate(onNavigate);

  const primary = showHub ? navItems.slice(0, 4) : navItems.slice(0, 5);
  const hubActive = pathname === "/app";

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

        {showHub && (
          <button
            data-testid="nav-hub"
            onClick={() => router.push("/app")}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              hubActive ? "text-(--color-accent)" : "text-(--color-text-tertiary)"
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${hubActive ? "bg-(--color-accent)/10" : ""}`}>
              <LayoutGrid size={16} />
            </div>
            <span className="text-[9px] uppercase tracking-wide font-medium">Home</span>
          </button>
        )}
      </div>
    </nav>
  );
}
