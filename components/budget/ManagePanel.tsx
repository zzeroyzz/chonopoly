"use client";

import { useRef, useState } from "react";
import { ChevronLeft, Plus, Wallet, CalendarClock, Target, CreditCard, Building2, LayoutGrid, LayoutList } from "lucide-react";
import { ActiveContext } from "@/lib/goals/types";
import { ViewState } from "./types";
import GoalsPanel, { type GoalsPanelHandle } from "@/components/GoalsPanel";
import BillsPanel, { type BillsPanelHandle } from "@/components/bills/BillsPanel";
import { Account } from "@/components/budget/types";
import DebtPanel, { type DebtPanelHandle } from "@/components/debts/DebtPanel";
import AssetsSection, { type AssetsSectionHandle } from "@/components/assets/AssetsSection";
import BudgetTableView from "./BudgetTableView";
import BillTableView from "@/components/bills/BillTableView";
import GoalTableView from "@/components/goals/GoalTableView";
import DebtTableView from "@/components/debts/DebtTableView";
import AssetTableView from "@/components/assets/AssetTableView";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "budgets" | "bills" | "goals" | "debts" | "assets";
type ViewMode = "card" | "table";

function getSavedView(section: string): ViewMode {
  if (typeof window === "undefined") return "card";
  return (localStorage.getItem(`manage_view_${section}`) as ViewMode) ?? "card";
}

function setViewPref(section: string, mode: ViewMode) {
  localStorage.setItem(`manage_view_${section}`, mode);
}

interface ManagePanelProps {
  activeContext: ActiveContext;
  onNavigate: (view: ViewState) => void;
  contextLabel: string;
  onReset?: () => void;
  pendingDebtLink: string | null;
  setPendingDebtLink: (id: string | null) => void;
  /** Pre-rendered BudgetsPanel from BudgetClient (avoids extracting its local types) */
  budgetsPanelSlot: React.ReactNode;
  /** Ref populated by BudgetsPanel so ManagePanel can trigger its create form */
  budgetCreateRef: React.MutableRefObject<(() => void) | null>;
  /** Threaded from BudgetClient for BillsPanel cash-projection chart seed */
  accounts?: Account[];
  /** Threaded from BudgetClient top-level goals fetch; passed to BudgetTableView */
  goals: { id: string; name: string; icon: string }[];
  /** When provided, renders a back affordance above the panel (Status → Manage all path). */
  onBack?: () => void;
}

// ─── Section metadata ─────────────────────────────────────────────────────────

const SECTION_TITLES: Record<Section, string> = {
  budgets: "Budgets",
  bills:   "Bills",
  goals:   "Goals",
  debts:   "Debts",
  assets:  "Assets",
};

const CREATE_LABELS: Record<Section, string> = {
  budgets: "Add budget",
  bills:   "Add bill",
  goals:   "Add goal",
  debts:   "Add debt",
  assets:  "Add asset",
};

const NAV_GROUPS = [
  {
    label: "Spending",
    items: [
      { id: "budgets" as Section, icon: Wallet,        label: "Budgets" },
      { id: "bills"   as Section, icon: CalendarClock, label: "Bills" },
    ],
  },
  {
    label: "Saving",
    items: [
      { id: "goals" as Section, icon: Target, label: "Goals" },
    ],
  },
  {
    label: "Net Worth",
    items: [
      { id: "debts"  as Section, icon: CreditCard, label: "Debts" },
      { id: "assets" as Section, icon: Building2,  label: "Assets" },
    ],
  },
];

// ─── ManagePanel ──────────────────────────────────────────────────────────────

export default function ManagePanel({
  activeContext,
  contextLabel,
  onReset,
  pendingDebtLink,
  setPendingDebtLink,
  budgetsPanelSlot,
  budgetCreateRef,
  accounts,
  goals,
  onBack,
}: ManagePanelProps) {
  const [activeSection, setActiveSection] = useState<Section>("budgets");

  const [budgetsView, setBudgetsView] = useState<ViewMode>(() => getSavedView("budgets"));
  const [billsView,   setBillsView]   = useState<ViewMode>(() => getSavedView("bills"));
  const [goalsView,   setGoalsView]   = useState<ViewMode>(() => getSavedView("goals"));
  const [debtsView,   setDebtsView]   = useState<ViewMode>(() => getSavedView("debts"));
  const [assetsView,  setAssetsView]  = useState<ViewMode>(() => getSavedView("assets"));

  const VIEW_STATE: Record<Section, ViewMode> = {
    budgets: budgetsView,
    bills:   billsView,
    goals:   goalsView,
    debts:   debtsView,
    assets:  assetsView,
  };

  const VIEW_SETTERS: Record<Section, (m: ViewMode) => void> = {
    budgets: setBudgetsView,
    bills:   setBillsView,
    goals:   setGoalsView,
    debts:   setDebtsView,
    assets:  setAssetsView,
  };

  function setCurrentView(mode: ViewMode) {
    VIEW_SETTERS[activeSection](mode);
    setViewPref(activeSection, mode);
  }

  const currentView = VIEW_STATE[activeSection];

  const goalsRef  = useRef<GoalsPanelHandle>(null);
  const billsRef  = useRef<BillsPanelHandle>(null);
  const debtsRef  = useRef<DebtPanelHandle>(null);
  const assetsRef = useRef<AssetsSectionHandle>(null);

  function handleCreate() {
    // When in table view, create still works via the same refs/callbacks.
    // For goals: GoalTableView uses GoalWizard internally; card view ref also works.
    // Switching to card view first ensures the panel ref is mounted.
    if (currentView === "table") setCurrentView("card");
    // Use rAF so the card panel mounts before we call into it
    requestAnimationFrame(() => {
      switch (activeSection) {
        case "budgets": budgetCreateRef.current?.(); break;
        case "goals":   goalsRef.current?.triggerCreate(); break;
        case "bills":   billsRef.current?.triggerCreate(); break;
        case "debts":   debtsRef.current?.triggerCreate(); break;
        case "assets":  assetsRef.current?.triggerCreate(); break;
      }
    });
  }

  return (
    <>
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors px-4 py-3 border-b border-(--color-border-subtle) w-full"
        >
          <ChevronLeft size={15} />
          Back
        </button>
      )}
      <div className="flex flex-col lg:flex-row overflow-hidden lg:h-[calc(100vh-56px)]">

      {/* ── Mobile pill strip — hidden on desktop ── */}
      <nav
        className="lg:hidden flex overflow-x-auto overflow-y-hidden border-b border-(--color-border-subtle) bg-(--color-base) shrink-0 scrollbar-none"
        style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <div className="flex gap-1.5 px-4 py-2">
          {NAV_GROUPS.flatMap(g => g.items).map(({ id, icon: Icon, label }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors border ${
                  active
                    ? "bg-(--color-accent)/15 text-(--color-accent) border-(--color-accent)/30"
                    : "text-(--color-text-secondary) border-transparent hover:text-(--color-text-primary)"
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Desktop sidebar — hidden on mobile ── */}
      <div className="hidden lg:flex lg:flex-col shrink-0 w-45 border-r border-(--color-border-subtle) bg-(--color-base) overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label}>
            <p
              className="text-[9px] uppercase tracking-[0.12em] text-(--color-text-disabled) font-medium px-4 pb-1"
              style={{ paddingTop: gi === 0 ? 8 : 16 }}
            >
              {group.label}
            </p>
            {group.items.map(({ id, icon: Icon, label }) => {
              const active = activeSection === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`h-8 px-3 flex items-center gap-2 text-[13px] rounded-sm transition-colors w-[calc(100%-16px)] ml-2 ${
                    active
                      ? "text-(--color-text-primary) bg-(--color-border-default) font-medium"
                      : "text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border-subtle)"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Content area ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 pb-16 lg:pb-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-(--color-border-subtle)">
          <p className="font-(--font-display) text-[20px] font-semibold text-(--color-text-primary)">
            {SECTION_TITLES[activeSection]}
          </p>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={() => setCurrentView("card")}
                title="Card view"
                className={`rounded-sm p-1 transition-colors ${
                  currentView === "card"
                    ? "text-(--color-accent) bg-(--color-accent)/10"
                    : "text-(--color-text-tertiary) hover:text-(--color-text-primary)"
                }`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setCurrentView("table")}
                title="Table view"
                className={`rounded-sm p-1 transition-colors ${
                  currentView === "table"
                    ? "text-(--color-accent) bg-(--color-accent)/10"
                    : "text-(--color-text-tertiary) hover:text-(--color-text-primary)"
                }`}
              >
                <LayoutList size={16} />
              </button>
            </div>
            <button
              onClick={handleCreate}
              className="flex items-center gap-1.5 bg-(--color-accent) text-black rounded-md px-4 h-9 text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={13} />
              {CREATE_LABELS[activeSection]}
            </button>
          </div>
        </div>

        {/* Panels */}
        {activeSection === "budgets" && (
          budgetsView === "card" ? budgetsPanelSlot : <BudgetTableView onEdit={() => setCurrentView("card")} goals={goals} />
        )}

        {activeSection === "goals" && (
          goalsView === "card"
            ? <GoalsPanel ref={goalsRef} activeContext={activeContext} contextLabel={contextLabel} onReset={onReset} />
            : <GoalTableView activeContext={activeContext} onEdit={() => setCurrentView("card")} />
        )}

        {activeSection === "bills" && (
          billsView === "card"
            ? <BillsPanel ref={billsRef} accounts={accounts} />
            : <BillTableView onEdit={() => setCurrentView("card")} />
        )}

        {activeSection === "debts" && (
          debtsView === "card"
            ? (
              <DebtPanel
                ref={debtsRef}
                activeContext={activeContext}
                contextLabel={contextLabel}
                onAddAssetForDebt={(id) => {
                  setPendingDebtLink(id);
                  setActiveSection("assets");
                }}
              />
            )
            : <DebtTableView activeContext={activeContext} onEdit={() => setCurrentView("card")} />
        )}

        {activeSection === "assets" && (
          assetsView === "card"
            ? (
              <AssetsSection
                ref={assetsRef}
                activeContext={activeContext}
                openWithDebtId={pendingDebtLink}
                onClearOpenWithDebt={() => setPendingDebtLink(null)}
              />
            )
            : <AssetTableView activeContext={activeContext} onEdit={() => setCurrentView("card")} />
        )}
      </div>
    </div>
    </>
  );
}
