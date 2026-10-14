"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { buildSections, visibleSections } from "./sections";
import { sectionEntryPath } from "./sectionMemory";

/**
 * The section switcher, as a page rather than an overlay.
 *
 * Mobile only. On desktop the sidebar already lists everything, so a nav page
 * on a 1440px screen would be a screen of links next to the same links — this
 * redirects there instead.
 *
 * Each section entry goes to wherever you last were inside it, not its front
 * door, so leaving a section and coming back doesn't cost you your place.
 */
export function MorePage() {
  const router = useRouter();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const bounce = () => {
      if (mq.matches) router.replace("/app");
    };
    bounce();
    mq.addEventListener("change", bounce);
    return () => mq.removeEventListener("change", bounce);
  }, [router]);

  const sections = visibleSections(buildSections());

  return (
    <div className="lg:hidden min-h-screen bg-(--color-base) text-(--color-text-primary)">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-[22px] font-semibold">More</h1>
        <p className="text-[12px] text-(--color-text-secondary) mt-1">
          Everything in the app, grouped by area.
        </p>
      </div>

      <div className="px-5 pb-28 grid gap-6" style={{ alignContent: "start" }}>
        {sections.map((section) => (
          <div key={section.id}>
            <button
              onClick={() => router.push(sectionEntryPath(section.id, section.defaultHref))}
              className="w-full flex items-center gap-2.5 mb-2 text-left"
            >
              <span className="text-(--color-accent)">{section.icon}</span>
              <span className="text-[10px] uppercase tracking-[0.1em] text-(--color-text-tertiary) font-medium">
                {section.label}
              </span>
            </button>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] overflow-hidden">
              {section.items.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => item.href && router.push(item.href)}
                  className={`w-full flex items-center gap-3 h-14 px-4 text-left text-[14px] text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors ${
                    i > 0 ? "border-t border-(--color-border-subtle)" : ""
                  }`}
                >
                  <span className="text-(--color-text-tertiary)">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight size={14} className="text-(--color-text-tertiary)" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
