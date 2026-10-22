# Handoff — 2026-10-22

Where this stands, for whoever picks it up next. Written at the end of a long
session; everything here was checked against the repo rather than remembered.

## Read these first

| What | Where | Why |
|---|---|---|
| The rules | `CLAUDE.md`, `/Users/katohernandez/Projects/CLAUDE.md` | plan → approve → branch → commit → **stop**. No push without being told. |
| Next 16 | `AGENTS.md` → `node_modules/next/dist/docs/` | "This is NOT the Next.js you know." It is right; see the layout note below. |
| Each feature's reasoning | `plans/feat-*.md` | Every branch has one, with its Approver review and what the review changed. |
| What was learned the hard way | the memory files below | Traps that cost time once already. |

**The Approver is Claude itself**, at the owner's standing instruction — the
plan file gets a self-review section that says so plainly. It is not an
independent review and should never be read as one.

## Branch and PR state

**Merged to `main`:** #58–#63. The house page's sheet layout, the Details hub,
the profile hub and the avatar in the bottom bar are all live.

**Open:**

- **#64 `feat/shell-layout` → `main`** — the shell hoisted into
  `app/(shell)/layout.tsx` so it stops being rebuilt on every tab change.
  Mergeable, clean, full suite green.
- **`feat/companies-crm`** (commit `d6e64aa`, **not pushed**) — stacked on
  `feat/shell-layout`. Companies replaces Pipeline. **Its migration is already
  applied to the live database.**

Older branches (`feat/arv-review-flow`, `feat/comp-cant-tell`,
`feat/house-header`, `feat/house-sheet`, `feat/details-hub`,
`feat/nav-and-settings`, `feat/recorded-sales`) are merged and can be deleted.

## What is unfinished

- **`feat/companies-crm` is not pushed.** It carries the Companies screens, the
  Pipeline removal, and the centred-logo header.
- **The portfolio attach path is only stub-tested.** Creating a company was
  verified against the real database; attaching a house to one
  (`POST /api/crm/companies/[id]`) has not been, because that writes a property
  row and the owner's rule is no production writes without explicit OK.
- **No stats row** on the profile hub — proposed, never confirmed.
- **No team screens.** `/api/teams`, `/api/teams/mine` and the invite
  accept/decline routes all work; nothing renders them. A nav item was
  deliberately NOT added, because `sections.tsx` argues a nav item pointing at
  a 404 is worse than a missing one.
- **Stage 2 of `plans/feat-house-sheet.md`** — the map. Blocked on two
  decisions recorded there, including a `leaflet` dependency.
- **`explainDeal.ts`** has banned copy at lines 167, 168, 229, 260, including
  "tick the ones that have been renovated" for a tick that no longer exists.
- **The Playwright job is still commented out** in `.github/workflows/ci.yml`.

## Traps, each of which cost real time

**`tests/23-comps.spec.ts` cannot be run on its own.** Alone on clean `main` it
reports 13 failures; in a full run, zero. It depends on state earlier specs set
up. `CLAUDE.md` says run the single relevant test — for this one spec that
produces a wall of red that is not a regression. Run the whole suite before
believing it. Not fixed; it has no branch.

**A `relative z-10` ancestor traps a `z-50` modal.** The house page's sheet is
`relative z-10`, which creates a stacking context, so the edit modal's `z-50`
was scoped inside it and the bottom bar's `z-40` painted over it. Save was
physically untappable on a phone — `elementFromPoint` at its centre returned
the Properties nav link. Fixed by moving the modal outside the sheet. Anything
else rendered inside that sheet has the same problem.

**`position: sticky` needs a scrollport that actually scrolls.** The shell was
`min-h-screen`, so it grew with its content, the document scrolled, and every
page's own `overflow-y-auto` container never did — making every `sticky` inside
one inert. `h-dvh` fixed it. Reading the class list suggested the opposite;
only measuring `scrollHeight` vs `clientHeight` showed the truth.

**Contacts had no write path.** Before `feat/companies-crm` there was exactly
one query against `contacts` in the whole app — a `select` at
`lib/crm/detailService.ts:160`. Anything that "just adds a contact" is building
a create flow from nothing.

**Activities and tasks are anchored to a house, not a person.** Both
`activities.pipeline_entry_id` and `tasks.pipeline_entry_id` are `NOT NULL`,
and an entry is one per property. So there is **nowhere to log a call to a
company** that is not about one specific house. This matters for the CRM and is
recorded as an open question in `plans/feat-companies-crm.md`.

**The services use an untyped Supabase client.** `db()` returns a plain
`SupabaseClient`, so `lib/supabase/database.types.ts` does **not** type-check
queries. A column that does not exist will compile and fail at runtime.

## Conventions worth matching

- Every user-facing number says what it is and whether it is good or bad.
  `$0` for "nobody set a budget" was a real bug; it says "Not set yet" now.
- No jargon in the interface. "Pipeline" and "Defaults" both failed this.
- Mobile first and verified at 390px — not "should work", looked at.
- Playwright for journeys only, one per feature. Jest for every case.
- Comments say **why**, usually what went wrong before.

## Memory

Per-project, at
`~/.claude/projects/-Users-katohernandez-Projects-chonopoly/memory/`, indexed
by `MEMORY.md`. It carries the owner's standing instructions — the Approver
role, no production data writes, no deletion as a bugfix, PR descriptions
without Claude branding. A new session on this machine picks them up; a session
elsewhere does not, so point it here.
