# Plan: you can see what you picked, and change it

Status: **User approved** on 2026-10-24: *"Do the review fix first, with option
A (keep the Status button and sheet). Then reason-copy, then Loan options."*
Self-reviewed first (see the end).
Branch: `fix/review-answers`, from `main` at `7c90360`.

## The problem

The owner, on his phone: *"the back still scrolls you can click something but
it never looks like it because the screen disappears when I click any option..
also the status does[n't] replace the 'status' button when click so you have
no idea which one you clicked and user should be able to reevaluate checked
ones just in case [they] made a mistake."*

Three faults, read from the code:

1. **A tap saves and jumps at once.** Picking an answer in the sheet closes it,
   saves, and swaps the card for the next house (`CompReviewCard.answer` →
   `onReview` → `CompsPanel` shows `queue[0]`). The choice is never shown. The
   button still says "Status", and the card you answered is gone. **This is
   also why the earlier report read as "can't click anything": the taps were
   landing.** #69's change for an iPhone tap bug was probably not needed. It is
   harmless, but it did not fix what the owner saw.
2. **The page behind the sheet still scrolls on iPhone.** The lock sets
   `overflow: hidden` on one scroll container. iPhone Safari passes a swipe on
   a fixed overlay to the page behind it whenever the overlay itself has
   nothing to scroll. Overflow alone cannot stop that; the swipe has to be
   refused.
3. **Re-checking is a dropdown that doesn't work on a phone.** Each row on the
   Checked tab has a status dropdown (`Dropdown`). Its menu opens inside the
   house page's sliding panel, the same trap the sheet had, so near the bottom
   of the screen it opens under the bar or off-screen. The design system also
   says this choice should never be a dropdown (`ReviewChoice` README).

## Where the answers live: option A, the owner's choice

| Option | How it works |
|---|---|
| **A, recommended: keep the Status button and the sheet** | Tapping an answer marks it in the sheet and closes it. **The button then reads your answer**, for example "● Renovated · tap to change", in its colour. Nothing is saved yet. A **Save and next** button saves and brings the next house; on the last one it reads **Save and finish**. |
| B: answers on the card, no sheet | The design system's own shape (`review-flow.md`): five rows on the card, the one you tap stays marked, and a sticky **Save and next** under the thumb. There is no overlay at all, so nothing can scroll behind one. It costs the height the sheet was brought in to save (2026-10-21, "Changes from use"). |

A follows what the owner described ("the status [should] replace the 'status'
button"). B is sturdier. Both fix all three faults.

## Fix (written for A; B differs only in step 1)

1. **Review card** (`CompReviewCard`):
   - A tap marks the answer, and the button shows it.
   - **Save and next** saves (with notes, and the sale price prompt when a
     removed listing is marked Renovated).
   - Save is disabled until an answer is picked, with the line *"Pick an
     answer to save this house and move to the next."*
   - **Later** is unchanged.
2. **The sheet stops the page behind it from moving on iPhone**:
   - While it is open, a `touchmove` listener refuses any swipe that is not
     scrolling the sheet's own content. This is the method react-remove-scroll
     uses, written here in a few lines rather than added as a dependency.
   - The lock also covers every scrolling container above the card, not only
     the nearest one, plus `touch-action: none` on the dimmed backdrop.
3. **Checked tab** (`CompsPanel` → `CompRow`):
   - Each house's dropdown becomes the same Status button and sheet,
     **showing its current answer**.
   - Picking a different one saves it, and the button shows the new answer,
     with *"Changed to Not renovated."* under it until the next change.
   - The row stays where it is.
   - The sale price prompt applies here too.

## Scope

| File | Change |
|---|---|
| `components/crm/CompReviewCard.tsx` | Picked-but-unsaved state, the button label, Save and next or finish, the scroll guard. The sheet becomes reusable by the Checked rows: it is exported, not duplicated. |
| `components/crm/CompsPanel.tsx` | `CompRow` uses the Status button and sheet instead of `Dropdown` for the review. `Dropdown` stays for sort and filter. |
| `lib/comps/reviewAnswer.ts`, **new** | Pure rules, Jest-tested: the button's label for an answer, Save and next vs finish, and the scroll guard's "can this element still scroll that way". |
| `tests/unit/reviewAnswer.test.ts`, **new** | Every case of the above |
| `tests/23-comps.spec.ts` | **One journey**, on a touch screen at 390px: pick an answer → it shows on the button → nothing moves → Save and next → the next house, with Checked up by one → on Checked, change that answer → the row shows the new one. The sheet check also asserts a swipe on the backdrop is refused (`defaultPrevented`). |

## Testing, and how it is verified on an iPhone

- Jest for every rule. One Playwright journey, with touch taps, at 390px.
- **iPhone Safari can't run here** (no Xcode, so no Simulator, and Chrome's
  touch emulation doesn't scroll the way iOS does). So:
  - The branch is pushed to get **a Vercel preview link**.
  - **The owner tries it on his phone before anything merges**: answering,
    the Status button showing the choice, nothing scrolling behind the sheet,
    and changing a checked house.
  - Merge only after he says it works.

## Risks

- **Two taps per house instead of one** (pick, then Save and next). That is the
  price of seeing your choice before it is saved, and the design system's own
  flow.
- **A `touchmove` listener on the document while the sheet is open.** It is
  removed on close, and it only refuses swipes outside the sheet's scrollable
  content.
- No data, migration, dependency or config change.

## Out of scope

- The sale price prompt's own design.
- Swipe gestures.
- Undoing a save from the review card. Re-checking on Checked covers mistakes.

## Approver (self-review)

Written by the same Claude that will build it. **It is not independent.**

- **The earlier misdiagnosis is stated plainly**, not glossed over.
- **Nothing is deleted to fix a bug**: the sheet is reused rather than
  removed, and `Dropdown` stays where it works (sort and filter). Swapping the
  review dropdown for the sheet on Checked follows the design system's rule
  that this choice is never a dropdown.
- **Testing**: Jest for rules, one Playwright journey, and real-phone
  verification before merge, because this kind of bug is one CI cannot see.
- **Changed by this review**: the first draft saved on tap and added an
  "Undo" toast. The owner asked to see the choice, not to recover from it, so
  the plan marks first and saves on a button.

**Recommendation:** approve with option A, push for a preview, and merge after
the owner checks it on his phone.

## Outcome (2026-10-24)

- **Picking an answer marks it.** The Status button then shows it in its
  colour, for example "Not renovated, tap to change". **Save and next** saves
  it (**Save and finish** on the last house). Save stays greyed until there
  is an answer, with the line "Pick an answer to save this house and move to
  the next."
- **The sheet refuses swipes it cannot use.** A `touchmove` guard refuses any
  swipe the sheet's own list cannot take, and every scrolling list above the
  card is held, not only the nearest. The dimmed backdrop is `touch-none`.
- **Checked houses use the same Status button and sheet.** A change saves at
  once and says "Changed to Not comparable." under the button. Comps review no
  longer uses a dropdown; `Dropdown` stays for sort and filter.
- **Deliberate difference:** the sheet does not offer "Needs review", so a
  checked house can't be sent back to Still to check. Picking the right answer
  covers a mistake.
- **Tests:**
  - Jest: 660 pass, 19 of them new in `reviewAnswer.test.ts`.
  - Playwright: 38 pass. The touch journey covers picking, the button showing
    the pick, nothing saved until Save and next, the next house arriving,
    Checked going up by one, and changing the answer on Checked. It also
    checks that a swipe on the backdrop is refused.
  - `tsc` and the build pass. Lint is unchanged: the one `CompsPanel` error is
    on `main` too.
- **Checked at 390px with screenshots:** nothing picked, the sheet open,
  picked, and changed on Checked.
- **Not done yet:** a real iPhone check. That needs a push for a Vercel preview.
