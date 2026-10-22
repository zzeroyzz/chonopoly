# Plan: who has the houses

Status: **Draft** — 2026-10-22. Awaiting the owner. No code written.
Branch: `feat/companies-crm` — not cut. Built on `feat/shell-layout` (PR #64)
at the owner's instruction, since it changes the same nav and the same shell.

## The problem

The owner's words, twice over. First: *"pipeline is dumb idk what that is."*
Then, when "Leads" was offered as the replacement: *"all of the properties in
the properties tab is leads so leads is redundant."*

Both are right, and the second is the sharper one. `/pipeline` is **the same
rows as Properties, arranged by stage**. It is not a different thing to look
at, which is why no name for it works — every honest name is either jargon
("Pipeline") or a word already true of the other tab ("Leads").

What the owner wants instead is a different noun. They found **Ground Floor
LLC**, a hard money lender, went through its inventory, and want somewhere to
put the business and the houses it holds. Properties is houses and whether the
numbers work. This is **who has houses**. That earns a tab.

## Goal

Open a company and see what they have. Add a company when you find one.

## Stack

TypeScript strict, Tailwind, tokens. SQL for the migration — a database
change, which §Tech stack names as a permitted exception. No new dependency.

## What the code already gives us, and what it does not

Three findings, all checked:

**1. The schema already knows companies exist.** `contacts.company` is a
column, and the migration says why:

> Entity-owned property is common; the LLC is the owner, not a person.

**2. One company to many houses already works.** `property_contacts` is a
many-to-many join with a `relationship` CHECK of `owner, co_owner, heir,
agent, tenant, neighbor, unknown`. A lender selling REO *is* the `owner`, so
even the enum needs nothing new on day one.

**3. But contacts are READ-ONLY.** There is exactly one query against them in
the whole app — `lib/crm/detailService.ts:160`, a `select`. No insert, no
update, no API route, no form. **There is no way to create a contact today.**

So "capture the business name" is not a small addition to an existing flow.
The flow does not exist. That is the bulk of this work, and it is worth saying
plainly before anything is built.

## The design decision

**A company is a `contact` with `kind = 'company'`, not a new table.**

| | contact with a `kind` | separate `companies` table |
|---|---|---|
| phones, emails | `contact_phones`, `contact_emails` already exist | build both again, or flatten to single fields |
| call and text log | `activities.contact_id` already points here — but see below | needs a polymorphic FK or a second log |
| chasing them | **neither** — `tasks.pipeline_entry_id` is NOT NULL, so a task belongs to a house | same problem |
| houses they hold | `property_contacts` already joins | a new join table |
| risk | a discriminator column everything must respect | four parallel structures that can drift |

§Code Cleanliness says search for existing code and extend it. Phones, emails,
notes and the house join all already attach to a contact. A `companies` table
would mean rebuilding four of them beside the originals.

The cost is honest: a `kind` column is a discriminator, and every query that
means "people" has to say so. There is one such query today.

### But the call log does not come free, and I said it did

The first draft of this table claimed activities and tasks come along with the
contact. Checked against the schema, they do not:

```sql
activities.pipeline_entry_id  uuid NOT NULL REFERENCES pipeline_entries(id)
tasks.pipeline_entry_id       uuid NOT NULL REFERENCES pipeline_entries(id)
```

A `pipeline_entry` is **one per property**. So every activity and every task
is anchored to a house, and there is no way to record "rang Ground Floor LLC
about what else they have" or "chase them on Friday" unless you pick a house
to file it under. `activities.contact_id` exists, but it is an *extra* pointer
on a row that still must name a property.

This is the real question inside the feature, and it is a third open question
below rather than something to decide while building.

## Scope

| File | Change |
|---|---|
| `supabase/migrations/<ts>_contact_kind.sql` | **new** — `contacts.kind`, backfill, `website` |
| `lib/crm/types.ts` | `ContactKind`, company shapes |
| `lib/crm/companyService.ts` | **new** — read and write companies and their houses |
| `app/api/crm/companies/route.ts` | **new** — create and list |
| `app/api/crm/companies/[id]/route.ts` | **new** — read, update, attach a house |
| `components/crm/CompaniesPage.tsx` | **new** — the list |
| `components/crm/CompanyDetailPage.tsx` | **new** — one company and its houses |
| `components/crm/AddCompanyForm.tsx` | **new** — the create flow that does not exist |
| `app/(shell)/companies/*` | **new** — the routes |
| `components/shell/sections.tsx` | the second slot becomes Companies |
| `tests/unit/companies.test.ts` | **new** — wording and derivations |
| `tests/28-companies.spec.ts` | **new** — one journey |

Seven new files. §Tier 2 says to state why no existing file fits: there is no
companies feature to extend, and the contact code that exists is a read path
in a service for the property detail screen.

## Approach

1. **The migration, written and not run.** `kind text not null default
   'person' check (kind in ('person','company'))`, plus `website text`.
   Backfill `kind = 'company'` where `first_name is null and last_name is null
   and company is not null` — the rows that are already companies in all but
   name. Verify block proves the counts before and after, like
   `20261021000000`.
2. **The service and the write path**, the part that does not exist: create a
   company, edit it, attach and detach a house via `property_contacts`.
3. **The two screens**: a list, and a company with its houses — each house a
   row that links to the house page.
4. **The tab swap** in `sections.tsx`.

## Risks

- **A migration.** Written, not run. It needs its own line-item instruction
  from the owner, per the hard rules.
- **New write paths.** Creating rows is new ground in this app's CRM. RLS and
  `owner_type` / `owner_id` must be set exactly as `contacts` already expects,
  or rows will be invisible to the owner who made them.
- **A discriminator column** is a thing every later query must respect.
- **Removing the Pipeline tab orphans three routes** — see the open question.
- No auth change, no env, no CI, no Plaid.

## Testing

**Jest** — what the screens say: a company with no houses yet, one house
versus many, a company with no phone, the wording of the empty state.
Derivations, not the screen.

**Playwright** — one journey: add a company, attach a house, see it on the
company's page. Plus the 390px check. One test, not one per field.

**Gate:** `npm run build`, `tsc --noEmit`, `npx jest`, full Playwright, and
looked at at 390px.

Note: `tests/23-comps.spec.ts` cannot be run alone — 13 failures in isolation
on clean `main`, 0 in a full run. Not a regression.

## Open questions — for the owner

**1. What happens to the stage pipeline?** Removing the tab orphans three
working screens:

- `/pipeline` — leads grouped by stage (New lead → Under contract)
- `/pipeline/dashboard` — stage counts, and the "nobody is chasing this one"
  defect list
- `/pipeline/tasks` — your open tasks across every house

The stages themselves are safe: they live on the house, on its Activity tab.
But those three screens are the only place the *cross-house* view exists, and
`SettingsShell` already states the principle — *"a destination you can enter
but not leave is a trap."* Three options: fold the stage view into Properties
as a filter; keep the screens and reach them from the Properties page; or
delete them (Tier 2, and the tasks list goes with it).

**Recommendation:** keep `/pipeline/tasks` and reach it from the hub — it is
the only place that answers "what do I owe anyone today" — and fold the stage
grouping into Properties. The dashboard's defect list goes with the grouping.

**2. Company as a contact kind, or its own table?** Recommended above, with
the trade-off stated. It is a one-way door once rows exist.

**3. Can you log a call to a company, or only to a house?** Today, only to a
house — both `activities` and `tasks` require a `pipeline_entry_id`, which is
per-property. A CRM for lenders where you cannot record a call to the lender
is half a CRM. Making that column nullable is a small migration with a wide
blast radius: every query and every screen that assumes an activity has a
house would need to cope with one that does not.

**Recommendation: leave it NOT NULL for now and ship the inventory**, which is
what the owner actually asked for — the business name and the houses it holds.
Decide the call log once there is a company page to look at.

## Out of scope

- Importing a company's inventory automatically. This captures what you type.
- Deleting the pipeline screens, until question 1 is answered.
- The stats row on the profile hub, and the team screens.

## Approver

**2026-10-22 — self-review, at the owner's standing instruction.** Not the
independent review `CLAUDE.md` describes.

Verified: `contacts` is read-only, one `select` at `detailService.ts:160` and
no write path anywhere. `property_contacts` is many-to-many with `relationship`
defaulting to `owner`. `activities.contact_id` exists and references
`contacts`. The migration comment about entity-owned property is quoted
accurately.

**What the review changed:** the comparison table claimed a contact brings its
activities and tasks with it. It does not — both tables require a
`pipeline_entry_id`, and an entry is one per property. Had that gone unchecked,
the build would have reached "log a call to Ground Floor LLC" and discovered
there is nowhere to put it, after the table shape was already decided. It is
now question 3, with a recommendation to defer rather than widen this branch.

**Recommendation: proceed once questions 1 and 3 are answered.** Question 2 is
mine to recommend and I have; the other two are the owner's, because one
decides what happens to three working screens and the other decides what this
CRM is for.
