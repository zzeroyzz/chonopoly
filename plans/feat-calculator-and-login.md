# Rebrand the auth flow and remove the exam-prep course

**Status: User approved** — 2026-10-14. Owner approved the full plan and the
logo-above-wordmark treatment. The emerald success state moves onto
`--color-accent`, as proposed in the open question.

---

## Goal

The signed-out pages still belong to a different product. `/login` shows a
`GA EXAM PREP` badge and the tagline "Your Georgia Real Estate study guide",
in an amber palette that appears nowhere else on the site. Next to the public
home page — Park Hawkins Properties, mint accent — it reads as a different
website, which is exactly what the owner reported.

Bring the four auth-flow pages onto the brand and the design system, and remove
the exam-prep course they were advertising, which is now unreachable.

## Stack

TypeScript and Tailwind, unchanged. No new dependencies. Styling moves *onto*
the existing CSS custom properties rather than introducing anything new.

---

## What is actually wrong

Two distinct problems, and they need separating.

**1. The copy belongs to another product.**

| File | Line | Says |
|---|---|---|
| `app/login/page.tsx` | 34, 41 | `GA EXAM PREP` · "Your Georgia Real Estate study guide" |
| `app/setup/page.tsx` | 136, 164 | `GA EXAM PREP` · "Taking you to the study guide…" |
| `app/reset-password/page.tsx` | 77 | `GA EXAM PREP` |
| `app/profile/page.tsx` | 257 | "Georgia Real Estate Exam Prep" + a Courses tab |

**2. The styling bypasses the design system entirely.** `app/login/page.tsx`
contains **zero** references to the colour tokens — every value is a literal.

| Role | Auth pages use | Design system |
|---|---|---|
| Accent | `amber-400` / `amber-500` | `--color-accent` `#00D4AA` |
| Page background | `#0f0f11` | `--color-base` `#0A0A0F` |
| Field background | `#18181c` | `--color-elevated` `#1A1A24` |
| Border | `#2e2e38` | `--color-border-default` |
| Body text | `#7a7870` | `--color-text-secondary` `#8888A0` |
| Primary text | `#e8e6df` | `--color-text-primary` `#F4F4F6` |
| Radius | `rounded-lg` | `--radius-md` / `--radius-lg` |

The target treatment already exists, in `components/home/HomePage.tsx`:

```tsx
<span className="text-[13px] uppercase tracking-[0.12em] font-medium">
  Park Hawkins Properties
</span>
```

## The logo (owner decision)

`public/favicons/PH-favicon-wht-512x512.svg` — a white line-art house. Despite
the filename it is not a monogram, and that matters: the detail needs room.
Rendered at three sizes, it reads cleanly at 120px, gets busy at 48px, and is
unusable at 28px. So it is a generous centred element, not a small inline mark.

Treatment: house at **80px**, centred, with the `Park Hawkins Properties`
wordmark beneath it in the home-page uppercase style, then the mode heading.
White artwork on `--color-base` needs no recolouring.

Served from `/favicons/PH-favicon-wht-512x512.svg`, which already ships in
`public/`. Rendered with `next/image` at a fixed width, with meaningful `alt`.

Two things noted and deliberately not acted on: the SVG carries ~16KB of Inkscape
editor metadata and could be an order of magnitude smaller, and these SVGs are
not referenced anywhere today — `layout.tsx` and `manifest.json` use the `.ico`
and `.png` variants.

## Scope

### Changed

- `app/login/page.tsx` — wordmark replaces the badge and tagline; tokens replace
  every literal colour. Three modes (login, forgot, sent) all covered.
- `app/reset-password/page.tsx` — same wordmark and tokens.
- `app/setup/page.tsx` — same, plus the "study guide" redirect copy.
- `app/profile/page.tsx` — drop the "Georgia Real Estate Exam Prep" heading and
  the Courses tab, including `PageTab` and the tab-param handling.

### Deleted

- `app/course/page.tsx` (189 lines)
- `components/` — `ChapterView.tsx`, `ConceptCard.tsx`, `Flashcard.tsx`,
  `KeyTermsList.tsx`, `Quiz.tsx`, `ResourcesTab.tsx`

Verified these six are imported only by `app/course/page.tsx` and by each other,
and that **nothing links to `/course`** — it is unreachable from the running app.

### Untouched

- `app/login/actions.ts` — auth logic is not in scope. No change to
  authentication, session handling, redirects or permissions.
- The calculator. It shares this branch but is separate work; this plan does not
  cover it.

## Approach

1. Rebrand and re-theme `app/login/page.tsx` — the page the owner reported. The
   logo and wordmark replace the `GA EXAM PREP` badge and tagline, and tokens
   replace every literal colour. Verify at 390px before going further, including
   that an 80px logo plus the form still fits a 390×844 viewport without the
   submit button falling below the fold.
2. Apply the same treatment to `app/reset-password/page.tsx` and
   `app/setup/page.tsx`, so the signed-out flow is consistent end to end.
3. Remove the Courses tab and exam-prep heading from `app/profile/page.tsx`.
4. Delete `app/course/` and its six components.
5. Verify: build, typecheck, lint, unit tests, the `01-auth` Playwright spec, and
   a 390px pass over login, reset-password and profile.

## Refactors

Replacing literal colours with the tokens that already exist is the refactor.
Nothing is duplicated and no new styling layer is introduced — these pages simply
start using the system every other page uses.

## Risks

- **Deleting ~1,000 lines of course code.** It is unreachable and owner-approved,
  but it is a deletion and is called out as Tier 2. Recoverable from git history.
- **`01-auth.spec.ts` asserts against the login page.** It passed most recently
  on this base. If a selector depends on current markup the spec must be updated
  to match the new markup — not weakened, and never deleted to make it pass.
- **`app/profile/page.tsx` reads a tab query param.** Removing a `PageTab` member
  means an old `?tab=Courses` link must degrade to the Profile tab rather than
  render an empty page.
- **No auth logic is touched.** Confined to presentation and copy, so sign-in,
  reset and session behaviour are unchanged.
- `/profile` already overflows at 390px with a long email — pre-existing, logged
  in the previous plan, and **not** fixed here.

## Testing

- `npm run build` and `npx tsc --noEmit`.
- `npm run lint` — compared against the current count rather than expecting zero,
  since lint already fails on `main`.
- `npx jest` for the unit suites.
- `npx playwright test tests/01-auth.spec.ts` — must pass.
- Mobile verification at 390px on login, forgot-password, reset-password and
  profile, with screenshots, since every change here is visual.

## Out of scope

- The calculator work this branch is also named for.
- `app/login/actions.ts` and anything touching auth, sessions or permissions.
- The pre-existing `/profile` 390px overflow.
- The property-tax lookup bug, still open from an earlier session.

## Open question

The `sent` confirmation state in `app/login/page.tsx` uses emerald
(`emerald-400` / `emerald-500/10`) for success, which is close to but not the
same as `--color-accent` `#00D4AA`. I intend to move it onto the accent token so
success reads in the brand colour. Flagging rather than assuming, since it is the
one colour change that is not purely mechanical.
