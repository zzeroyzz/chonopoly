# Plan: the bar holds places, the avatar holds you

Status: **Draft** — 2026-10-22. Awaiting the owner. No code written.
Branch: `feat/nav-and-settings` — not cut. `main` is clean and both previous
branches are merged, so this starts from main.

## The problem

Three separate things, all in the bottom bar.

**1. "Pipeline" does not say what it is.** The owner's words: *"pipeline is
dumb idk what that is."* That is the interface failing its own rules, not a
matter of taste. `CLAUDE.md` §Writing says each page opens with one plain
sentence saying what it is for, and bans internal words. `/pipeline` has a
jargon heading, no sentence, and — the giveaway — its own subtitle already
calls the things on it something else:

```
components/crm/PipelinePage.tsx:164   <h1>Pipeline</h1>
components/crm/PipelinePage.tsx:169   {`${activeTotal} active leads`}
```

The page knows the word. The tab does not use it.

**2. Settings is not a place you go.** It holds four pages — account,
defaults, integrations, profile — and it occupies a fifth of the bar that the
owner reaches a handful of times a year, next to things used daily.

**3. The avatar already half-does it.** `onProfileClick` exists and every page
wires it to a route of its own choosing. `SettingsShell` sends it to
`/settings/account`; `PropertyDetailPage` sends it there too. It is a
ten-way-duplicated router push, not a menu.

**4. The menu already exists, and nothing renders it.**
`components/ProfileDropdown.tsx` is a complete avatar dropdown — avatar
button, name and email header, links, sign out — with **zero callers**. It is
dead code, and it is in poor shape:

- hardcoded hex (`#18181c`, `#2e2e38`, `#c8c5bc`) where the app has tokens
- `fixed top-4 right-4 z-200`, so it positions itself against the viewport
  rather than sitting in the bar that owns it
- a **"Finances" link pointing at `/pipeline`** — a label and a destination
  that disagree, for a section this app no longer has
- a default export, against §Code Style

This is the thing to fix, not to duplicate. Rewriting it in place is also what
`CLAUDE.md` requires: never delete a component as a way of fixing it.

## Goal

The bar holds the places you go every day. The avatar holds everything about
you and your setup.

## Stack

TypeScript strict, Tailwind utilities, tokens from `globals.css`. No new
dependency. No new component either — `ProfileDropdown` already exists and is
rewritten in place.

## Scope

| File | Change |
|---|---|
| `components/shell/sections.tsx` | Pipeline renamed; Settings removed from `NAV_DESTINATIONS` |
| `components/ProfileDropdown.tsx` | rewritten in place: tokens, no self-positioning, the real destinations |
| `components/shell/MobileTopBar.tsx` | renders the dropdown instead of calling back |
| `components/shell/ShellSidebar.tsx` | same, for the desktop sidebar |
| `components/shell/AppShell.tsx` | `onProfileClick` becomes optional; the shell owns the menu |
| `components/crm/PipelinePage.tsx` | the heading, and the missing plain sentence |
| the 9 other pages rendering `<AppShell>` | drop the duplicated `onProfileClick` |
| `tests/22-navigation.spec.ts` | the bar's destinations and the menu |

**Not touched:** the four settings pages themselves, their routes, auth, or
anything either tab points at. This moves the way in; it changes nothing about
what is behind it.

## Approach

1. **Rename the destination.** One entry in `sections.tsx`. `matches` keeps
   `/pipeline` and `/crm`, so every existing link and redirect still lights the
   right tab — the route does not move and nothing 404s.
2. **Give the page its sentence.** `PipelinePage` gets the one-liner the
   writing rules require, in the voice Properties already uses ("Every house
   you've looked at, with the two questions that matter").
3. **Rewrite `ProfileDropdown`**: swap the hex for tokens, drop the `fixed`
   positioning so its parent places it, replace the "Finances → /pipeline"
   link with the real destinations (Profile, Defaults, Integrations, Account),
   keep sign out behind its divider, and make it a named export. Both
   `MobileTopBar` and `ShellSidebar` then render the one component.
4. **Delete Settings from the bar** and the nine duplicated `onProfileClick`
   handlers with it.
5. **Rebalance the bar** — see the open question.

## Refactors

`onProfileClick` is a prop threaded through `AppShell` to two children and
supplied by ten callers, all of which pass a router push to the same area.
That is the duplication this removes: the shell owns the menu, and callers
pass nothing.

## Risks

- **Four shared shell files**, which every page renders. The last shell change
  this session (`min-h-screen` → `h-dvh`) was correct and still needed the full
  Playwright suite to prove it. Same bar here.
- **Changing a prop's signature** on `AppShell` touches all ten call sites —
  Tier 2, and listed in scope above rather than discovered later.
- **Sign out in the menu** means the menu can log you out by mis-tap. It goes
  last, behind a divider.
- No migration, no database change, no auth logic, no env, no CI, no Plaid.

## Testing

**Playwright** — `tests/22-navigation.spec.ts` is the right home and already
exists: the bar shows the destinations it should and no Settings; the avatar
opens the menu and each item lands on its page; 390px. One journey, not one
per item.

**Jest** — `destinationForPath` already has the interesting logic (longest
prefix wins, so `/properties/new` is Add, not Properties). Renaming must not
change which path lights which tab, and that is a pure function, so it is a
unit test.

**Gate:** `npm run build`, `tsc --noEmit`, `npx jest`, the **full** Playwright
suite (shared shell), and looked at at 390px.

Note: `tests/23-comps.spec.ts` cannot be run on its own — it fails 13 in
isolation and passes in a full run. Do not read it as a regression.

## Decided by the owner, 2026-10-22

**The bar.** The avatar takes the freed slot: Properties · ? · Add · Tools ·
You. The menu opens from the bar, in thumb reach, rather than the top corner.
`MobileTopBar` keeps its avatar on routes that show it; the bar's is the one
that opens the menu on a phone.

**The second tab is OPEN, and bigger than a rename.** "Leads" was rejected,
correctly: every house in Properties is a lead, so the word names the rows
rather than the tab. The owner's answer is that the tab may become a CRM for
**companies** — the example is Ground Floor LLC, a hard money lender whose
inventory they went through — capturing the business and the houses it holds.

That is a different noun, which is why it earns a tab where "Pipeline" did
not: Properties is houses and whether the numbers work; Sources is who has
houses and what they have. It is also a feature, not a label:

- `contacts.company` already exists, and the migration says why: *"Entity-owned
  property is common; the LLC is the owner, not a person."* `property_contacts`
  is already many-to-many with a `relationship` enum, so one company to many
  houses is possible **today**.
- But `company` is **text, not a row**. Twenty houses sourced from one lender
  are twenty contact rows holding the same string, and there is nothing to
  open. A `companies` table plus a backfill is what buys the inventory page —
  a migration, needing its own plan and its own explicit go-ahead.
- **The stages need a home either way.** New lead → Under contract is already
  on each house, but the grouped view feeds the dashboard's "nobody is chasing
  this one" defect list. Folding it into Properties as a filter, or dropping
  it, is a decision this plan does not make.

**So this branch does the avatar and settings only.** The second tab keeps its
route, its page and — for now — its name. Renaming it to something that is
about to be replaced is churn.

## Out of scope

- The settings pages themselves.
- What `/pipeline` shows or how its stages work.
- The collapsing-hero scroll model on the house page.
- `tests/23-comps.spec.ts`'s isolation defect.

## Approver

**2026-10-22 — self-review, at the owner's standing instruction.** Not the
independent review `CLAUDE.md` describes.

Checked against the code, and it moved the plan twice:

1. **The menu was going to be built twice.** Rev 1 said to build a new one
   following `StageMenu`. `components/ProfileDropdown.tsx` already is one.
   Writing a second would have been the `utils2.ts` that §Code Cleanliness
   bans, and would have left the broken original in the tree. §Approach now
   rewrites it in place.
2. **It carries a live defect.** Its "Finances" item links to `/pipeline` —
   the very tab this plan renames. Whatever the bar ends up called, that link
   is wrong today and would have shipped wrong again.

Verified as claimed: `PipelinePage.tsx:164` is `<h1>Pipeline</h1>` and `:169`
reads "N active leads"; ten files render `<AppShell>`, all passing their own
`onProfileClick`; `tests/22-navigation.spec.ts` exists with 19 tests;
`destinationForPath` resolves by longest prefix.

**Recommendation: proceed, once the owner answers the two open questions.**
Neither is mine to decide — one is what the thing is called, the other is what
the bar looks like.
