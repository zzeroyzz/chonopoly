# Job One — Nav Shell Extraction

Plan only. No code written. No branch created. Awaiting approval.

**Goal:** lift the navigation chrome out of `components/BudgetClient.tsx` into a shared
layout that a second route can consume, with `/finances` rendering identically afterward.

**Explicitly not in this job:** the mortgage calculator, the CRM, any new nav item, any
visual change, any new feature.

---

## 0. Two things to settle before I write code

### 0a. There are uncommitted changes on `kh/team-feature`

```
 M CLAUDE.md                          (+2 lines — rules 12 and 13)
?? plans/MORTGAGE-CALCULATOR-SPEC.md
?? plans/wholesaling-crm-spec.md
?? plans/MORTGAGE-CALCULATOR-PLAN.md
```

CLAUDE.md requires me to stop and ask rather than branch over them. **Commit them first
or discard them?** My read: the CLAUDE.md edit and the spec files look deliberate and
worth keeping, so committing them on `kh/team-feature` before branching is the sane
move — but that's your call, and I won't commit anything without you saying so.

### 0b. The regression net is down

The most recent commit is:

```
e386a56 ci: temporarily disable Playwright job while tests are being fixed
```

`.github/workflows/ci.yml` has the entire Playwright job commented out. Build and Jest
run; E2E does not.

This matters more here than for a normal feature. The whole safety argument for this
refactor is "BudgetClient renders identically afterward," and the only thing that can
actually prove that is the E2E suite. Two of the specs that exercise the shell —
`tests/16-teams.spec.ts` and `tests/12-step8.spec.ts` — are exactly the ones that assert
on the chrome I'd be moving.

Options:

**(a)** Get `16-teams` and `12-step8` passing locally first, use them as the before/after
gate, leave the rest of the suite and CI alone. Smallest scope, and it puts a real net
under the refactor. **Recommended.**
**(b)** Do the refactor with manual verification only — screenshots at 390px and desktop,
before and after. Faster, meaningfully riskier.
**(c)** Fix the whole suite and re-enable the CI job first. Correct, but that's a third
job and it blocks everything behind it.

**Needs your call.** I'd rather not start (b) by default.

---

## 1. What I found: the sidebar is not one thing

The chrome runs from `BudgetClient.tsx:2065` to the end of the file (2588). Reading it,
it splits cleanly into two categories that have to be pulled apart before anything can
be shared:

**Generic — belongs in the shell**

| Element | Lines |
|---|---|
| Root frame (`flex min-h-screen overflow-x-hidden`) | 2066 |
| Sidebar container, noise-texture background | 2068–2075 |
| Section label ("Finances") | 2077–2079 |
| User profile button + avatar + onboarding progress | 2082–2119 |
| Context switcher (personal / teams / new team / team settings) | 2122–2189 |
| Nav item list | 2192–2210 |
| Mobile top bar (identity, context badge, avatar) | 2277–2320 |
| Mobile bottom tab bar + `safe-area-inset-bottom` | 2549–2572 |

**Finances-specific — must NOT move into the shell**

| Element | Lines | Why |
|---|---|---|
| Bank account tree, per-institution expand/collapse | 2212–2250 | Plaid data |
| Total balance | 2219 | Plaid data |
| Refresh / sync button | 2253–2258 | triggers Plaid sync |
| `PlaidLinkButton` | 2260 | CLAUDE.md rule 10 — Plaid is untouchable |

So the shell can't just be "the sidebar." It has to be a frame with **slots**: the
generic chrome, plus a `sidebarContent` region and a `sidebarFooter` region that
`/finances` fills with its Plaid material and `/mortgage` leaves empty.

This is the single most important design consequence of the survey, and it's why a
straight copy-paste extraction would have dragged Plaid code into a shared layout.

## 2. The blocker for job two: context isn't shareable

`activeContext` is local component state persisted to `localStorage`:

```ts
// BudgetClient.tsx:1802
const [activeContext, setActiveContext] = useState<ActiveContext>({ type: "personal", id: userId });

// BudgetClient.tsx:1856
const switchContext = useCallback((ctx: ActiveContext) => {
  setActiveContext(ctx);
  try { localStorage.setItem("financeContext", JSON.stringify(ctx)); } catch {}
}, []);
```

`teams` is likewise fetched and held inside BudgetClient. There is no React context
provider anywhere in the app.

That means a `/mortgage` route rendering the shared shell would render a context switcher
with nothing behind it. Two ways out:

**(i) Shell takes context as props.** Every route fetches teams and owns the switcher
state itself. No behavior change to `/finances`, but it duplicates the fetch and the
localStorage handling into every future route, and the two copies will drift.

**(ii) Lift context into a provider.** `ContextProvider` mounted above the routes; the
shell and BudgetClient both consume it. One source of truth, no duplication.

(ii) is correct. But it is a *behavior-adjacent* change — it moves where state lives and
when it initializes — and you said no behavior changes riding along with the extraction.

**So: does the context provider land in job one or job two?** My recommendation is job
one, as its own reviewable commit *after* the pure move, so the diff reads as
"move JSX" then "lift state" rather than one tangled change. But I'm flagging it rather
than deciding it.

Worth noting: the mortgage calculator itself ignores context entirely — it persists
nothing. The provider is needed because the *shell* shows a context switcher, not
because the calculator wants one. If you'd rather, the shell could hide the switcher on
routes that don't use it, and (ii) could wait for the CRM, which genuinely needs it.

## 3. `navTo` is hardcoded to `/finances`

```ts
// BudgetClient.tsx:2016
function navTo(v: ViewState) {
  if (v === "manage") setManageSubView("status");
  setView(v);
  setSearch("");
  if (typeof v === "string") {
    router.replace(`/finances?tab=${v}`, { scroll: false });
  } else {
    router.replace(`/finances?tab=account&accountId=${v.accountId}`, { scroll: false });
  }
}
```

It also does two finances-specific things — resetting `manageSubView` and clearing
`search` — so it can't move wholesale. Plan: the shell owns *route-level* navigation
(which top-level destination is active), `/finances` keeps `navTo` for its internal
view switching. The shell's nav items become `{ id, href, icon, label }` and use real
navigation; BudgetClient's internal tabs stay query-param driven exactly as they are.

## 4. Proposed structure

```
components/shell/
  AppShell.tsx        frame + sidebar + mobile top bar + bottom tab bar; slots for
                      sidebarContent / sidebarFooter / children
  ShellSidebar.tsx    section label, profile button, context switcher, nav items
  MobileTopBar.tsx    identity, context badge, avatar, optional action slot
  BottomTabBar.tsx    safe-area padding, active state
  navItems.ts         single source of truth for top-level destinations

lib/shell/
  ContextProvider.tsx activeContext + teams + switchContext + resetToPersonal
                      (pending your answer to section 2)
```

`app/finances/page.tsx` is unchanged. `BudgetClient` keeps every panel, every effect, and
all of its own state — it just renders `<AppShell>` around its content and passes the
Plaid sidebar material in as a slot.

The 16 sub-components defined inside BudgetClient (`OverviewPanel`, `TransactionsPanel`,
`AnalyticsPanel`, etc., lines 55–1770) are **not touched**. The extraction is confined to
the render body, roughly lines 2065–2588.

## 5. Sequencing — one branch, three reviewable commits

Branch: `kh/nav-shell-extraction`, off latest `main`. Created only after you answer 0a.

1. **Pure move.** Chrome into `components/shell/*`, props threaded down from
   BudgetClient. No state relocated, no behavior changed. Every `data-testid` preserved
   verbatim.
2. **Context provider** (if approved for this job). Lift `activeContext`, `teams`,
   `switchContext`, `resetToPersonal`. BudgetClient consumes instead of owning.
   Same `localStorage` key, same shape, same initialization order.
3. **Route-aware nav.** `navItems` gains `href`; shell navigates by route; BudgetClient
   keeps its internal `?tab=` switching untouched.

Each commit builds and passes whatever gate you pick in 0b. If the finances view breaks,
the commit boundary says which change did it.

## 6. Test IDs that must survive verbatim

Grepped from `BudgetClient.tsx`, consumed by `tests/16-teams.spec.ts` and
`tests/12-step8.spec.ts`:

```
context-personal      context-team-{id}     context-banner
context-reset         onboarding-gate       net-worth-card
```

Renaming or restructuring around any of these breaks the two specs that are the best
evidence the refactor was clean. They stay exactly where they are.

## 7. Verification

- `npm run build` clean
- `npm run test:unit` green (Jest is live in CI and unaffected by this work)
- Whichever E2E gate you choose in 0b
- **Mobile verification at ≤390px** per CLAUDE.md rule 11: bottom tab bar, safe-area
  padding, mobile top bar, and the `pt-14 lg:pt-0` main offset, screenshotted before and
  after and compared
- Desktop at ≥1024px: sidebar width, noise texture, profile block, context switcher,
  bank tree, footer actions
- Manual pass on the onboarding gate, which returns early above the shell
  (`BudgetClient.tsx:2053`) and is easy to strand during a refactor

## 8. Deferred to job two

You asked for a proposal on what the five bottom-tab items should be once the calculator
and the CRM both exist. That's a product decision that depends on the CRM's shape, so I'm
holding it until the job two plan rather than guessing now. Flagging so it isn't lost.

---

## Summary of what I need from you

1. **Uncommitted changes on `kh/team-feature`** — commit or discard? (0a)
2. **E2E gate** — option (a), (b), or (c)? (0b)
3. **Context provider** — job one or job two? (section 2)

Stopping here for approval.
