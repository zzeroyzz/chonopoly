"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadProfile } from "@/lib/supabase/profile";
import { Wallet, Calculator, LineChart, Building2, TrendingUp, ChevronRight } from "lucide-react";

/**
 * The authenticated landing screen.
 *
 * Deliberately dumb: five cards and nothing else. The moment this grows counts,
 * charts or a feed it starts competing with the modules for attention, and we're
 * back to having one primary thing — which is the assumption that made the old
 * navigation wrong in the first place.
 */

interface Module {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  ready: boolean;
}

const MODULES: Module[] = [
  {
    id: "finances",
    label: "Finances",
    description: "Accounts, budgets, bills, goals and spending.",
    href: "/finances?tab=overview",
    icon: <Wallet size={20} />,
    ready: true,
  },
  {
    id: "mortgage",
    label: "Mortgage calculator",
    description: "What a loan costs, and what income it takes to carry it.",
    href: "/mortgage",
    icon: <Calculator size={20} />,
    ready: true,
  },
  {
    id: "cashflow",
    label: "Cash flow analysis",
    description: "Whether a specific house works as a rental.",
    href: "/cash-flow",
    icon: <TrendingUp size={20} />,
    ready: false,
  },
  {
    id: "markets",
    label: "Market analysis",
    description: "Which metro to shop in, and why.",
    href: "/markets",
    icon: <LineChart size={20} />,
    ready: false,
  },
  {
    id: "crm",
    label: "CRM",
    description: "Seller pipeline, contacts, follow-ups and buyers.",
    href: "/crm",
    icon: <Building2 size={20} />,
    ready: false,
  },
];

export function HubPage() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await loadProfile();
        if (!cancelled) setName(profile.username);
      } catch {
        // The hub renders fine without a name.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-(--color-base) text-(--color-text-primary)">
      <div className="px-5 lg:px-10 pt-10 pb-6">
        <p className="text-[10px] uppercase tracking-[0.12em] text-(--color-text-disabled) font-medium">
          Park Hawkins Properties
        </p>
        <h1 className="text-[26px] lg:text-[32px] font-semibold mt-2">
          {name ? `Welcome back, ${name}` : "Welcome back"}
        </h1>
        <p className="text-[13px] text-(--color-text-secondary) mt-1.5">Pick where you&apos;re working.</p>
      </div>

      <div className="px-5 lg:px-10 pb-16 grid gap-3 lg:grid-cols-2" style={{ alignContent: "start" }}>
        {MODULES.map((m) => (
          <button
            key={m.id}
            onClick={() => m.ready && router.push(m.href)}
            disabled={!m.ready}
            data-testid={`hub-${m.id}`}
            className={`text-left bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-5 shadow-[var(--shadow-sm)] transition-colors ${
              m.ready ? "hover:border-(--color-border-strong)" : "opacity-50 cursor-default"
            }`}
          >
            <div className="flex items-start gap-3.5">
              <span className={m.ready ? "text-(--color-accent)" : "text-(--color-text-tertiary)"}>
                {m.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-semibold">{m.label}</h2>
                  {!m.ready && (
                    <span className="text-[9px] uppercase tracking-widest text-(--color-text-tertiary) border border-(--color-border-default) rounded-full px-2 py-0.5">
                      Soon
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-(--color-text-secondary) mt-1 leading-relaxed">
                  {m.description}
                </p>
              </div>
              {m.ready && <ChevronRight size={16} className="text-(--color-text-tertiary) mt-1" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
