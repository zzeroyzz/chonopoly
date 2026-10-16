# Saved mortgage scenarios

**Status: In progress** — approved 2026-10-16. Migration written and **applied to
production**; the service, API, UI and Playwright spec are not built yet.

---

## Goal

Run the numbers on a house, name it, come back to it. Today the calculator keeps
exactly one working state in `localStorage` — open a second house and the first
is gone. `storage.ts` has said so since it was written: *"Nothing here is saved to
the database — that's the saved-scenario feature."* This is that feature.

Saved to the database and scoped to personal or team, so they follow the owner
across devices.

## Stack

TypeScript and Tailwind. SQL for the migration, which is unavoidable. No new
dependencies.

---

## What already exists, and why it isn't reused

The database has an **`analyses` table with 40 columns** — purchase price, rehab,
ARV, loan terms, income, expenses, growth rates — from
`20260907000000_properties_and_analyses.sql`. **Nothing in the codebase
references it.** It was built for the cash-flow analysis tool that has not
shipped.

It is not the right home for this:

- Its shape is a rental analysis, not a mortgage scenario. No loan type, no
  assistance, no renovation program, no PMI handling.
- Bending it to carry both would make a table that serves neither well, and the
  cash-flow tool would then inherit mortgage columns it does not want.

Worth flagging separately: 40 unused columns is a decision someone should revisit.
Not here.

## Storage shape, and a recommendation

`MortgageInputs` has ~35 fields and **changes** — this branch alone renamed
`dpaAmount` to `dpaEnabled` and needed a migration in `storage.ts` to avoid
silently dropping saved drafts.

So: **one `jsonb inputs` column**, not 35 columns. The `analyses` table took the
column-per-field route and is the cautionary tale sitting right there — every
input change becomes a schema migration.

Alongside it, a small number of real columns the list view needs, so listing
scenarios does not mean parsing every blob:

```sql
create table mortgage_scenarios (
  id          uuid primary key default gen_random_uuid(),
  owner_type  text not null check (owner_type in ('personal','team')),
  owner_id    uuid not null,

  label       text not null,
  -- Denormalised purely so the list reads without parsing inputs.
  home_value      numeric not null,
  loan_type       text    not null,
  monthly_payment numeric not null,

  -- The full MortgageInputs. One column because the shape evolves; a schema
  -- version so a future rename can be migrated on read rather than guessed at.
  inputs          jsonb   not null,
  inputs_version  int     not null default 1,

  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

`inputs_version` exists because of what just happened with `dpaAmount`: a stored
blob outlives the type that wrote it, and reading it back needs to know which
shape it is.

### Team access

See the settled section at the bottom: team members get **full access**, which is
a deliberate divergence from the read-only convention the CRM uses.

## Scope

### New

- `supabase/migrations/<ts>_mortgage_scenarios.sql` — table, indexes, RLS.
- `lib/mortgage/scenarioService.ts` — list, save, rename, delete.
- `app/api/mortgage/scenarios/route.ts` — GET list, POST save.
- `app/api/mortgage/scenarios/[id]/route.ts` — PATCH rename, DELETE.
- `components/mortgage/ScenarioBar.tsx` — save, and the list to load from.
- `tests/20-mortgage-scenarios.spec.ts` — required before this is complete.

### Changed

- `components/mortgage/MortgageCalculator.tsx` — mount the bar, apply a loaded
  scenario to inputs.
- `lib/mortgage/storage.ts` — unchanged in behaviour. The localStorage draft stays
  as the working state; saving is the deliberate, named action on top.

### Untouched

- Every calculation. This is persistence.
- The `analyses` table.

## Approach

1. ~~Migration written and reviewed.~~ **Done — applied 2026-10-16.**
2. `scenarioService.ts` with unit tests, including reading a `version 1` blob back
   into current `MortgageInputs`.
3. API routes, following the CRM pattern exactly: auth, `resolveContext`,
   validate, 400/403/404 with named fields.
4. `ScenarioBar` — save with a name, list, load, delete.
5. Playwright spec at 390px.
6. Verify, then hand the migration over to be run.

## Risks

- ~~A migration is Tier 2 and running it is owner-only.~~ Applied 2026-10-16 on
  explicit instruction, after a dry run. Table, indexes, RLS and trigger verified.
- **Team members can overwrite each other.** The chosen policy is `FOR ALL` and
  there is no history table, so a teammate's overwrite or delete is final.
- **Stored inputs outlive the type.** `inputs_version` plus tolerant reading
  handles it; the `dpaAmount` rename on this branch is the proof it is needed.
- **Loading a scenario overwrites the working draft.** Someone mid-calculation
  loses what they were doing. Mitigation: load replaces inputs only on an explicit
  click, never automatically.
- **RLS is access-control logic** — Tier 2 in its own right, and the policies are
  copied from the CRM pattern rather than invented.

## Testing

- Unit: round-trip a scenario through save and load; a `version 1` blob missing a
  newly added field loads with the default rather than `undefined`.
- API: unauthorised is 401, wrong context is 403, missing scenario is 404.
- Playwright `20-mortgage-scenarios.spec.ts`: save a scenario, reload the page,
  load it back, confirm the inputs return. At 390px.
- `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npx jest`.

## Out of scope

- Comparing two scenarios side by side. Natural next step; not this.
- The unused `analyses` table.
- Sharing a scenario by link, or exporting it.
- The property tax lookup, verified working this session.

---

## Team access (settled by the owner)

**Team members can edit and delete shared scenarios.** Both RLS policies are
`FOR ALL`.

This diverges from every other shared table here — `pipeline_entries`, `contacts`
and `budgets` all give teams `FOR SELECT` only. It was the owner's explicit
choice, and the divergence is documented at the top of the migration so nobody
later "corrects" it back.

The consequence to live with: there is no history table, so a teammate
overwriting or deleting a shared scenario is not recoverable.
