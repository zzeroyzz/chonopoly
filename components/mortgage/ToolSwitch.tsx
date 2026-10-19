"use client";

import Link from "next/link";

/**
 * Which calculator you are in.
 *
 * `/tools/flip` existed and nothing linked to it, so the only way there was to
 * type the URL. The nav has one Tools entry and always will — five bottom-nav
 * items is the budget — so the switch between tools belongs inside the tools.
 */
export function ToolSwitch({ active }: { active: "mortgage" | "flip" }) {
  const items = [
    { id: "mortgage", label: "Mortgage", href: "/tools/mortgage" },
    { id: "flip", label: "Flip profit", href: "/tools/flip" },
  ] as const;

  return (
    <div className="flex gap-1.5 mb-4" data-testid="tool-switch">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          data-testid={`tool-${item.id}`}
          aria-current={active === item.id ? "page" : undefined}
          className={`h-8 px-3 inline-flex items-center rounded-[var(--radius-pill)] text-[12px] transition-colors ${
            active === item.id
              ? "bg-(--color-accent) text-(--color-base) font-semibold"
              : "border border-(--color-border-default) text-(--color-text-secondary)"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
