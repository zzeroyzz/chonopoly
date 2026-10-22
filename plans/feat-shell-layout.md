# Plan: the shell stops being rebuilt

Status: **Draft** — 2026-10-22. Awaiting the owner. No code written.
Branch: `feat/shell-layout` — not cut. Starts from main once
`feat/nav-and-settings` is merged; it touches the same files.

## The problem

Switching tabs looks like the app reloading. The owner reported it as "the app
seems to hard reload and looks very obvious and is not smooth."

**It is not a reload.** Measured in the browser: a marker set on `window`
survives the navigation and `performance.getEntriesByType('navigation')` stays
at 1. A document load would have cleared both.

What happens instead is that **every page renders its own `<AppShell>`**. All
eleven of them. So on each navigation React unmounts the entire frame — top bar,
sidebar, bottom bar, avatar — and builds a new one, then the incoming page
refetches its data behind skeletons. Structurally it *is* a rebuild of
everything except the document, which is why it reads as one.

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md:240`
states the fix plainly:

> Layouts do not re-render on navigation

And `:242` closes the obvious worry — a layout that does not re-render cannot
read `usePathname`, but the client components inside it still re-render, so
the bar's active-tab highlight keeps working. That highlight is derived from
the route in `destinationForPath`, inside client components, so it survives.

## Goal

The frame is drawn once and stays. Only the page inside it changes.

## Stack

TypeScript strict, Tailwind, no new dependency. Next 16 App Router route
groups and nested layouts, per the docs above.

## The finding that makes this small

`AppShell` takes seven per-page slots. I expected to need React portals or
context to feed them from a layout. **Six are entirely unused, and the seventh
is referenced only in a comment saying it is deliberately not passed:**

| Prop | Uses outside `components/shell/` |
|---|---|
| `mobileActions` | 0 |
| `sidebarContent` | 0 |
| `sidebarFooter` | 0 |
| `overlays` | 0 |
| `mobileBadge` | 0 |
| `sectionLabel` | 0 |
| `contextSwitcher` | 1 — a comment in `MortgageCalculator.tsx:63` saying there is nothing to scope |

And what *is* passed is the same thing every time:

```
 11  appName="Park Hawkins Capital"
 11  onboardingCompleted={null}
  9  onProfileClick={() => router.push("/settings/account")}
  2  onProfileClick={() => router.push("/settings")}
```

So the layout needs **no per-page props at all**. No portals, no context, no
slot machinery. `<AppShell>{children}</AppShell>`.

## Approach

1. **Add `app/(shell)/layout.tsx`** — a client component that calls
   `useShellProfile()` once and renders `<AppShell>{children}</AppShell>`.
2. **Move the shelled routes into the group**: `compare`, `pipeline`,
   `properties`, `settings`, `tools`. Route groups do not appear in the URL,
   so every path stays exactly as it is.
3. **Leave the rest outside it**: `login`, `invite`, `reset-password`, `setup`,
   and the seven redirect-only routes (`crm`, `mortgage`, `more`, `cash-flow`,
   `markets`, `profile`, `app`), which `redirect()` before rendering anything.
4. **Take `<AppShell>` out of the eleven render sites**, including
   `SettingsShell` and `app/settings/page.tsx`. They render their content.
5. **Delete the dead props** and `onProfileClick` with them: the avatar
   becomes a `Link` to `/settings` rather than a callback every page supplies.
6. **`appName` becomes a constant** in the shell. It has one value.

## Refactors

This removes code rather than adding it: eleven `<AppShell>` wrappers and
their prop sets, nine identical `onProfileClick` closures, and seven unused
props. The eleven sites are `app/settings/page.tsx`, `SettingsShell`,
`DashboardPage`, `MyTasksPage`, `PipelinePage`, `PropertyDetailPage`,
`FlipTool`, `MortgageCalculator`, `AddPropertyPage`, `ComparePage` and
`PropertiesPage`.

## Risks

- **Do not create a second root layout.** The same doc, `:142`: *"Navigating
  across multiple root layouts will cause a full page load."* `app/layout.tsx`
  stays the only root; `app/(shell)/layout.tsx` nests under it. Getting this
  wrong produces exactly the symptom being fixed.
- **Moving route folders** is the kind of change that looks larger in a diff
  than it is. URLs do not change, but every moved `page.tsx` is touched.
- **Deleting props is a public interface change** — Tier 2, named here.
- **Each page keeps its own `overflow-y-auto` container**, which the house
  page's sticky hero and tab bar depend on. The shell moving up must not take
  those with it.
- No migration, no database, no auth, no env, no CI, no Plaid.

## Testing

**Playwright** — one new test that asserts the thing being fixed: tag the
`<nav>` element, navigate to another tab, and assert the tag is still on it.
A rebuilt shell loses the tag; a persisted one keeps it. That is the whole
change, and nothing else proves it.

Plus the **full suite**, because this touches every page in the app.

**Jest** — `destinationForPath` is unchanged and already covered.

**Gate:** `npm run build`, `tsc --noEmit`, `npx jest`, full Playwright, and
looked at at 390px while switching tabs.

## Out of scope

- The per-page data refetch on navigation. The frame will stop rebuilding;
  each page still loads its own data, and that is a separate question about
  caching.
- The stats row and the team screen.
- `tests/23-comps.spec.ts`'s isolation defect.

## Approver

**2026-10-22 — self-review, at the owner's standing instruction.** Not the
independent review `CLAUDE.md` describes.

Verified against the code and the installed docs:

- `app/layout.tsx` is the **only** layout in the tree, so there is no existing
  nested layout to collide with and no second root to trip the full-page-load
  rule at `layout.md:142`.
- **Eleven** render sites, not ten — the draft undercounted. Listed above.
- `/` does not render the shell, so it stays outside the group. Nor do
  `login`, `invite`, `reset-password` or `setup`.
- The seven blank-looking routes are all `redirect()` calls that render
  nothing: `crm`, `mortgage`, `more`, `cash-flow`, `markets`, `profile`, `app`.
- The slot-prop count is as stated; `contextSwitcher`'s single hit is the
  comment at `MortgageCalculator.tsx:63`.

One thing this review changed: the draft said "ten page components", which
would have left `app/settings/page.tsx` rendering a second `AppShell` **inside**
the layout's one. Two nested shells is two bottom bars.

**Recommendation: proceed.** The risk is concentrated in one place — creating
a second root layout instead of a nested one — and the doc names that exact
mistake and its exact symptom, which is the symptom being fixed. Worth
re-reading `:142` while writing the file rather than after.
