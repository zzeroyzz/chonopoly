"use client";

import { type ShellNavItem } from "./types";

interface Props {
  navItems: ShellNavItem[];
  /** Currently active nav id, or null when the active view isn't a top-level item. */
  activeNavId: string | null;
  onNavigate: (id: string) => void;
}

/** Mobile bottom tab bar — lg+ uses the sidebar instead. */
export function BottomTabBar({ navItems, activeNavId, onNavigate }: Props) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-(--color-base) border-t border-(--color-border-subtle)"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="h-14 flex items-stretch">
        {navItems.map(({ id, icon, label }) => {
          const active = activeNavId === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
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
      </div>
    </nav>
  );
}
