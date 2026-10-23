# Plan: the comp review sheet works on a phone

Status: **User approved** on 2026-10-23. The owner chose the branch with
*"Keep the fix in fix/paste-address"* (option B), which is read as approving
this plan. Self-reviewed first (see the end).
Branch: `fix/paste-address`, as its own commit.

## The problem

The owner, with a phone screenshot: *"This status pop up doesn't work and is
out of view and I can['t] scroll on it or interact with it when I do the
background scrolls."*

The sheet is "Was it fixed up like yours will be?" (`ReviewSheet` in
`components/crm/CompReviewCard.tsx`). Three causes, read from the code:

1. **It renders inside the house page's sheet**, which is `relative z-10` and
   so a stacking context. Its `fixed inset-0 z-50` is scoped inside that
   context, and the bottom bar (`BottomTabBar`, `fixed z-40`) paints over it.
   The last options sit under the bar, and the backdrop leaves the bar undimmed
   (visible in the screenshot). This is the trap the handoff recorded for the
   edit modal: *"Anything else rendered inside that sheet has the same
   problem."*
2. **It locks the wrong scroller.** It sets `document.body.style.overflow =
   "hidden"`, but the app scrolls the shell's own `h-dvh` container, not the
   body. So a swipe moves the page behind the sheet.
3. **`max-h-[80vh]`.** On iOS, `vh` includes the browser bars, so the sheet can
   run past the visible screen.

## Fix

In `ReviewSheet`, with no other component touched:

1. **Render it through a portal to `document.body`** (`createPortal` from
   `react-dom`, already a dependency). It leaves the house sheet's stacking
   context, so `z-50` is above the bar. That is the same fix the edit form
   got, done here as a portal rather than by moving JSX, so the card keeps
   owning its own sheet.
2. **Keep scroll inside the sheet**: `overscroll-contain` on the panel, so its
   scroll doesn't chain to the page. The body lock is replaced by locking the
   element that actually scrolls: the nearest scrollable ancestor of the card,
   found once on open and restored on close.
3. **`max-h-[85dvh]`**, plus bottom padding that clears the phone's home
   indicator (`env(safe-area-inset-bottom)`), so the last option is never under
   anything.

## Scope

| File | Change |
|---|---|
| `components/crm/CompReviewCard.tsx` | `ReviewSheet`: portal, scroll lock, height and padding |
| `tests/23-comps.spec.ts` | **One** Playwright check, at 390px: open the sheet, its last option is in view and above the bottom bar (`elementFromPoint` at its centre returns the option), and choosing it closes the sheet and records the review |

A browser-only behaviour, so a Playwright check with no Jest case. The rules
ask for one per fix like this.

## Branch

`fix/paste-address` is committed but not pushed. The one-branch-at-a-time rule
means this waits for it, **OWNER DECIDES**:

| Option | Trade-off |
|---|---|
| **A, recommended:** push `fix/paste-address` now (your "push"), and cut this from `main` once it merges | Keeps the rule |
| B: add this to `fix/paste-address` as its own commit | Faster, but two unrelated fixes in one PR |

## Risks

- **Portals change where the sheet sits in the DOM.** Its focus and Escape
  handling are self-contained and don't depend on its parent, so they're
  unaffected.
- No data, no dependency, no config.

## Approver (self-review)

Written by the same Claude that will build it. **It is not independent.**

- **Bug fixed in place**: `ReviewSheet` is edited, not replaced or removed.
- **Root cause, not symptom**: the stacking context is the cause. A bigger
  z-index on the sheet would do nothing inside the trap.
- **One Playwright check**, browser-only by nature. It asserts what is actually
  tappable, not only what is visible: that is the check that caught the edit
  form's untappable Save.

**Recommendation:** approve, with branch option A.
