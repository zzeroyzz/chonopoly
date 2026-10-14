# Extract the financial module into a standalone project

**Status: User approved** — 2026-10-14. Owner approved the full plan (Phases 1–5)
and named the destination `/Users/katohernandez/Projects/finance-app`. The cron
unregister migration is written but **not executed**, per the plan.

---

## Goal

Remove the personal-finance product from chonopoly entirely and stand it up as a
separate project at `/Users/katohernandez/Projects/`, with its git history intact.
chonopoly keeps the real-estate direction — hub, CRM, mortgage tools, auth. The
finance side is gutted from this repo, not archived inside it.

## Owner decisions driving this revision

1. **Destination** — a folder in `/Users/katohernandez/Projects/`, outside this repo.
2. **Scope** — onboarding is gutted along with the finance product.
3. **Crons** — gutted. Interpreted as: *write* the unregister migration, do **not**
   execute it. See Risks.

## Stack

TypeScript and Tailwind, unchanged. No new dependencies. SQL only for the cron
unregister migration, which is SQL by necessity.

---

## What is actually entangled

Every import crossing the boundary, checked directly. There are three, and two are
the same symbol:

| Keep side | Imports | From |
|---|---|---|
| `components/crm/useCrmContext.ts` | `ActiveContext` | `lib/goals/types` |
| `components/crm/AddLeadForm.tsx` | `ActiveContext` | `lib/goals/types` |
| `components/mortgage/ResultsPanel.tsx` | `StatCard` | `components/budget/StatCard` |

Plus `components/shell` and `components/hub`, which also read `ActiveContext`.

Neither symbol is financial:

- **`ActiveContext`** — `{ type: "personal" | "team"; id: string }`. A generic
  tenancy primitive living in `lib/goals/types.ts` by accident. The CRM and the nav
  both depend on it.
- **`StatCard`** — a presentational card (label, value, subtext, variant). No
  financial logic. In `components/budget/` by accident.

Relocate those two and the finance side detaches cleanly.

**Volume:** ~20,000 LOC leaving, ~6,400 staying.

---

## Scope

### Leaves chonopoly entirely

- `app/finances/`
- `app/api/` — `budget`, `bills`, `debts`, `goals`, `assets`, `transactions`,
  `plaid`, `net-worth`, `dreams`, `milestones`, `onboarding`
- `components/` — `budget/`, `bills/`, `debts/`, `goals/`, `assets/`
- `components/` root — `BudgetClient.tsx`, `GoalsPanel.tsx`,
  `OnboardingChecklist.tsx`, `OnboardingModal.tsx`
- Teams' Plaid account-sharing (owner decision, 2026-10-14):
  `app/api/teams/[id]/accounts/` (both routes) and `lib/supabase/plaid.ts`.
  `components/teams/TeamSettingsPanel.tsx` and `TeamSetupWizard.tsx` are edited in
  place to drop their share-picker sections — teams itself stays.
- `lib/` — `budget/`, `bills/`, `debts/`, `goals/`, `assets/`, `plaid.ts`,
  `plaid-sync.ts`, `plaidRefreshBalances.ts`
- `supabase/functions/` — `nightly-budget-reset`, `nightly-snapshot`,
  `sync-goal-balances`, `weekly-report`
- `tests/` — `08-budget`, `09-budget-cron`, `11-goals-accounts`, `12-step8`,
  `14-debts`, `15-bills`, `17-status-page`, `18-category-override`

### Promoted to shared ground before anything moves

- `ActiveContext` → `lib/context.ts` (already exists; natural home)
- `StatCard` → `components/ui/StatCard.tsx`

### Stays in chonopoly

- `app/crm`, `app/mortgage`, `components/crm`, `components/mortgage`, `lib/crm`,
  `lib/mortgage`, `lib/property`, `lib/census`
- `components/shell`, `components/hub`, `components/home`, `app/layout.tsx`
- `lib/supabase`, `lib/teams`, auth, profile, `app/login`, `app/profile`
- `app/course`, `app/app` — not classified, left alone pending a later call
- **`components/AdminTab.tsx` — correction.** The draft listed this as financial.
  It is not: it is user administration (roles, invites, deletions) importing from
  `app/profile/admin-actions`, and `app/profile/page.tsx` renders it. It stays.

**`teams` stays.** The CRM uses personal/team scoping; moving it breaks the CRM.

---

## Approach

Each step leaves the repo building. Nothing is deleted until the extraction is
verified complete.

**Phase 1 — decouple (in chonopoly)**
1. Promote `ActiveContext` into `lib/context.ts`; update CRM, shell and hub imports.
2. Promote `StatCard` into `components/ui/StatCard.tsx`; update all callers.
3. Gate: re-run the cross-import check and confirm zero keep-side imports reach the
   finance side. If anything remains, stop and reassess rather than force the move.
   Build + typecheck after each.

**Phase 2 — consolidate (in chonopoly)**
4. `git mv` every path in the leaving set into a single `financial/` tree. One
   commit. Git rename detection keeps the history attached, which is what makes
   the next phase possible.

**Phase 3 — extract (creates the new project)**
5. `git subtree split --prefix=financial -b financial-only` — produces a branch
   whose history is only the finance commits.
6. `git init` a new repo at `/Users/katohernandez/Projects/<name>` and pull that
   branch into it. Result: a standalone project with real history, not a flat copy.
7. Stand it up — `package.json`, `tsconfig`, Next config, Tailwind config, and the
   shared primitives it now needs its own copies of (`lib/supabase`, `lib/context`,
   `components/ui/StatCard`, auth scaffolding). This is the step most likely to
   expand once I see what the moved tree actually references.
8. Verify independently: it installs, typechecks and builds in its own directory.

**Phase 4 — gut (in chonopoly)**
9. Delete the `financial/` tree. This is the irreversible-feeling step, and it only
   happens after Phase 3 is verified green.
10. Remove the Finances section from `components/shell/sections.tsx`. Redirect
    `/finances` rather than 404.
11. Clear the fallout — dead imports, orphaned types, unused deps.
12. Write the cron unregister migration as a file. **Do not run it.**

**Phase 5 — verify chonopoly**
13. Build, typecheck, lint, `jest`, Playwright (`01-auth`, `19-crm`, mortgage),
    and a 390px pass on hub, CRM and mortgage.

---

## Refactors

Phase 1 is a genuine refactor of existing code: two symbols move to honest homes
and every call site is updated. No duplicates, no parallel types. Worth doing on
its own merits even if the extraction were abandoned.

---

## Risks

All Tier 2, stated plainly.

- **Deletion of ~20,000 LOC from this repo.** This is the point of the task, but it
  is a deletion of working code and it happens in Phase 4 only, only after the new
  project is verified building. Recoverable from git history and from the new repo.
- **Writing outside the repo directory.** Phase 3 creates files in
  `/Users/katohernandez/Projects/`. Needs explicit authorisation; I will not create
  anything there until the destination name is confirmed.
- **Cron jobs — not executed by me.** Four `pg_cron` jobs call edge functions
  (`nightly-budget-reset`, `nightly-snapshot`, `sync-goal-balances`,
  `weekly-report`). They reach the database directly and never touch the Next.js
  app, so removing the UI does **not** stop them: they keep writing to financial
  tables and **keep sending emails**. I will write the unregister migration. Running
  it against production, and undeploying the edge functions, are owner-only actions
  requiring their own instruction.
- **Plaid.** `plaid.ts`, `plaid-sync.ts` and `plaidRefreshBalances.ts` are in the
  moving set, and `sync-goal-balances` is one of the live crons. Moving source files
  touches no Item, token or connection, and this plan makes **no Plaid API call of
  any kind**. No Plaid credential moves to the new project; it will need its own.
- **The database is untouched.** `budgets`, `budget_periods`, `savings_goals`,
  `savings_goal_history`, `plaid_items` and their RLS policies all remain exactly as
  they are, serving the new project. No migration is run.
- **Secrets.** The new project needs its own env configuration. I will not copy,
  print or move any `.env` contents, keys or tokens — it ships with a
  `.env.example` naming the variables only.
- **Phase 3 step 7 is the soft spot.** Until the tree is moved I cannot see every
  shared helper it reaches for. Expect that step to grow; I will report it rather
  than silently widen scope.

## Testing

- `npm run build` and `npx tsc --noEmit` after every phase, both repos.
- `npm run lint`.
- `npx jest` for the suites that stay (mortgage, crm).
- Playwright in chonopoly: `01-auth`, `19-crm`, mortgage must pass.
- The new project: installs, typechecks, builds. Its Playwright specs travel with
  it; getting them green there is follow-up work, not part of this.
- 390px mobile pass on hub, CRM and mortgage — the nav changes.
- Financial specs stop running against chonopoly. That is intended, and I will say
  exactly which ones stopped rather than let the count quietly drop.

## Out of scope

- Running any migration, including the cron unregister. Written, not executed.
- Undeploying, editing or deleting deployed edge functions.
- Any schema, RLS or data change. No table is dropped or truncated.
- Any Plaid action.
- Copying secrets or env values into the new project.
- Getting the new project's test suite green, or deploying it anywhere.
- `app/course` and `app/app`, left for a later decision.

---

## Open question blocking Phase 3

**What should the new project directory be called?** It is created at
`/Users/katohernandez/Projects/<name>`. Nothing outside this repo is created until
that is confirmed.
