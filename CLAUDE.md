@AGENTS.md

When fixing bugs: edit the broken logic in place. Never delete a function,
component, or file as a method of fixing a bug. Refactoring and optimization
are fine — deletion as a bugfix is not.

# Hard Rules
- When fixing a bug: edit the broken logic in place. Never delete a function,
  component, or file as a method of fixing a bug.
- Never rewrite a working function to add a new feature — insert or append
- If a fix requires structural changes, explain why before touching anything
- Never rename exports without updating all imports
- Never change function signatures without checking all call sites

# Code Style
- TypeScript strict mode always on
- No `any` types — use `unknown` and narrow
- Prefer named exports over default exports
- Error handling: always explicit, never swallow errors silently

# Workflow
- Before implementing anything with 3+ steps: write a plan, wait for approval
- Run typecheck after any series of changes
- Run only the relevant single test, not the full suite
- After a bug fix: write a one-line comment explaining what was wrong and why
- Every new major feature requires a corresponding Playwright test that must
  pass before the feature is considered complete — no exceptions

# Testing

Two layers, split by what the test needs — not by how important the code is.
"Major vs minor" is hard to judge at 2am; "does this need a browser" is not.

## Playwright — journeys, not cases
- A feature gets **one** test that it works end to end, plus its 390px layout
  check. One wiring test per feature, not one per case.
- Use it only for what a browser alone can prove: a journey, a click producing
  the right request, routing, and layout at phone width.
- A major feature is not done until its Playwright journey test passes. Do not
  mark a feature complete, or suggest committing, while it is failing or
  missing.
- Run the relevant spec after implementing a major feature:
  `npx playwright test <test-file>`
- Specs live in /tests — do not scatter them.

## Jest — every case
- Calculations, verdicts, label and copy mapping, parsing, error-message
  selection: all of it is a unit test against the function, not the screen.
- Edge cases and regressions belong here. "Does X show the right value for
  inputs A/B/C" is a Jest test; "does the value reach the screen at all" is
  the Playwright one.

## Before adding a Playwright test
Ask whether a Jest test would prove the same thing. If it would, write that
instead. A browser test that asserts a string a pure function returns costs
~4 seconds and breaks on every rename; the unit test costs ~2ms and does not.

# Writing (all user-facing text)

Write for a first-time investor, not a developer. These apply to every label,
button, verdict, warning, error, empty state and tooltip.

- **Every number says what it is, whether it is good or bad, and why it
  matters.** Not "$1,915 cash left". Instead: "$1,915 left after closing.
  That's less than 3 months of payments, so one surprise could stall the flip."
- **Every verdict or warning says why, and what to do about it.** A verdict
  with no reason is a verdict nobody can act on.
- **Every empty screen says what goes there and how to fill it**, with a button
  that does it.
- **Every error says what happened and what to do next.** No status codes, no
  internal terms.
- **Each page opens with one plain sentence saying what it is for.**
- **Jargon gets a tap-to-explain (ⓘ)** with a one-sentence plain definition:
  ARV, PITI, DTI, DPA, 203(k), cap, comps, margin, walk-away cash, true profit,
  holding costs, points, reserves.
- **Spell out what a percentage is a percentage of**, every time. "Margin" alone
  means nothing; "profit as a % of the resale price" does.
- **Short sentences.**
- **Never use internal words in the UI**: analysis, scenario, primary, carry,
  fixture, resolver, deployment, migration, endpoint, payload.
- **Do not explain how the app calculates something** unless the user taps for
  details. They want the answer, not the method.

# Scope Boundaries
- Do not modify files outside the task scope
- Do not install new packages without asking first
- Do not change .env files or config without explicit instruction

# Git & PR Workflow

## Stop At The Commit (overrides everything below)
- Work on a new branch. Commit locally and stop. Do NOT push, do NOT open a
  PR, do NOT merge.
- Push and open a PR ONLY when the owner's current message says "push".
  Merge ONLY when it says "merge".
- Migrations stay written but NOT run until the owner says "run the migration".
- No tests. Run `npm run build` and `tsc` before stopping.

### What to report when stopping
Every hand-off states, in this order:
1. **What changed**, in plain language — not a list of commit subjects.
2. **The files touched.**
3. **How to try it on the owner's Mac** — the exact commands and the URL.
4. **Anything risky**: migrations written, data that would change, anything
   irreversible, and anything deliberately left undone.

## Branching Rules
- One feature branch at a time. Start the next branch from main only after the
  last one is merged. Never branch off an unmerged branch.
- Committing on a non-main branch is allowed without per-commit approval.
  NEVER commit on main. NEVER push, under any circumstances, without explicit
  user instruction in the user's current message.
- NEVER open, create, or push a PR without explicit user instruction
- If it has been 8+ hours since the last session: ask "Are we continuing on
  [current-branch] or starting a new branch?" before doing anything
- If starting a new branch: pull latest main first, then create and switch
  to the new branch
- NEVER stash changes under any circumstances
- If the user asks to create a new branch and there are uncommitted changes:
  stop, summarize what the changed files are and what the changes do,
  then ask "Do you want to commit them first or discard them?"
  Wait for explicit instruction before proceeding

## Commit Discipline
- Commit freely on a feature branch at meaningful boundaries — one commit per
  logical change, so a bad change can be identified by its commit
- Never chain commits + push + PR open in one autonomous sequence
- One PR per feature/fix — do not create multiple PRs to fix a previous PR
- Always run `npm run build` before any push — do not push if the build fails

## PR Description Format
When the user asks to open a PR, use this format:

---
## Summary
[1-2 sentence plain-English description of what this PR does and why]

## Changes
- [Bullet list of specific changes made]

## Testing
- Playwright test: [test file name and status — must be passing]
- [Any other testing done]

## Notes
[Any gotchas, follow-ups, or decisions made during implementation]


HARD RULES — NON-NEGOTIABLE

Plan first, always. No code, no file edits, no SQL, no migrations, no deploys, no cron changes, no secret changes — nothing — until the owner replies with explicit approval of the presented plan. "Approved" applies only to the items in that plan, exactly as written.
Approval is not blanket. Approval of a plan authorizes the code changes in it. It does NOT authorize: running migrations against production, deploying edge functions, setting/changing secrets, registering/unregistering cron jobs, sending emails or invoking functions that send them, or any irreversible external action. Each of those requires its own explicit line-item instruction in the owner's most recent message. When in doubt: it's not authorized.
Steps assigned to the owner are the owner's. If a plan sequences a step for the owner (e.g., "owner rotates a key"), STOP at that step and wait for confirmation it's done. Never perform it, work around it, or proceed past it.
Commit on a feature branch as work reaches a boundary — no per-commit approval needed. Never commit on main. Never push, unless the owner's current message explicitly says to push.
Read-only means read-only. An audit prompt permits zero writes of any kind — no DB writes, no file edits, no "small fixes while I'm in there."
Never echo secret values — keys, tokens, passwords, connection strings — in plans, reports, code comments, or logs. Reference by name only.
No scope creep. Do exactly what the prompt says, nothing extra. Adjacent bugs or improvements get REPORTED, not fixed, unless the prompt covers them.
Ambiguity = stop and ask. If any instruction could be read two ways, present the readings and wait. Guessing wrong on an external action is worse than asking.
Every completion report must state: what changed (files), what external actions were taken (each one traceable to an explicit instruction), what was deliberately NOT done, and npm run build status.
10. Plaid connections are untouchable. Never create, delete, re-link, rotate, or modify Plaid Items, link tokens, access tokens, or Plaid credentials. Never write to plaid_items or plaid_accounts beyond what existing, already-approved sync code does. Never call Plaid endpoints that create or remove Items. The owner has a limited number of connections; any action that could consume, invalidate, or disconnect one is owner-only, always, regardless of any other instruction.
11. Mobile-first verification. The owner uses the app on a phone. Any UI change must be verified rendered at mobile width (≤390px) before being reported complete. A feature that works only at desktop width is not complete. Completion reports must state what was visually verified at mobile width, not what the code should do.
