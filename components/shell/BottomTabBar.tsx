"use client";

import Link from "next/link";
import { type NavDestination } from "./sections";

interface Props {
  destinations: NavDestination[];
  /** Null on routes outside the shell. */
  activeDestinationId: string | null;
}

/**
 * Mobile bottom tab bar — lg+ uses the sidebar instead.
 *
 * Five slots is the ceiling at 375px, and the app now has exactly five
 * destinations, so the bar holds all of them. No section switcher and no More
 * drawer: those existed to fit three products into five slots, and there is one
 * product now.
 *
 * Plain links rather than router pushes — a nav item should be openable in a
 * new tab, and middle-click should work.
 */
export function BottomTabBar({ destinations, activeDestinationId }: Props) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-(--color-base) border-t border-(--color-border-subtle)"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Main"
    >
      <div className="h-14 flex items-stretch">
        {destinations.map((d) => {
          const active = d.id === activeDestinationId;
          return (
            <Link
              key={d.id}
              href={d.href}
              aria-current={active ? "page" : undefined}
              data-testid={`nav-${d.id}`}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{
                color: active ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              {/* The add action reads as an action, not a place. */}
              <span
                className={
                  d.isAction
                    ? "flex items-center justify-center w-7 h-7 rounded-full bg-(--color-accent) text-(--color-base)"
                    : ""
                }
              >
                {d.icon}
              </span>
              <span className="text-[10px] leading-none">{d.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
