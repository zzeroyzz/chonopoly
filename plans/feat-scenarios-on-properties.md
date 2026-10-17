# Saved scenarios belong to properties, and properties belong to the CRM

**Status: Draft** — not approved. No code written, no migration run.

---

## Goal

A saved scenario is not a named blob. It is **an analysis of a house**, and that
house is a potential investment the CRM should know about. Right now the two
have nothing to do with each other: scenarios carry a free-text label, the CRM
carries properties, and neither can see the other.

Make the property the spine, give scenarios a real view, and let a house you
modelled become a lead without retyping its address.

## Stack

TypeScript and Tailwind. One SQL migration. No new dependencies.

---

## What I got wrong, and what the codebase already expected

`lib/property/propertyService.ts` says this at the top of `upsertProperty`:

> *"Every write path goes through here — **the Cash Flow analysis save**, the CRM
> manual create, the PropStream import, and the public seller form — so the
> dedupe rule exists in exactly one place."*

And both enums already carry the value:

```ts
export type PropertyOrigin = "manual" | "analysis" | "import" | "inbound_web" | "crm";
export type LeadSource     = "manual" | "import" | "inbound_web" | "analysis";
```

**Nothing writes `"analysis"`.** The path was designed and left unbuilt, and when
I built saved scenarios I stored an arbitrary `label` string instead of taking
it. That is the actual defect here — not a missing screen.

The consequence today: model a house, save it, then go to the CRM and type its
address again to make it a lead. Two records of the same house that cannot find
each other.

## The model

```
properties  ←────────────┬──────────── pipeline_entries   (is it a lead?)
  the house              │
  deduped by parcel,     └──────────── mortgage_scenarios (what do the numbers say?)
  then by address             many per property
```

One property, many scenarios — *"at asking"*, *"at $240k with 10% down"*,
*"203(k) with $60k of work"*. That is the comparison the owner actually wants,
and it only works if scenarios hang off a shared property rather than off
unrelated name strings.

### Migration

```sql
ALTER TABLE mortgage_scenarios
  ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX mortgage_scenarios_property_idx
  ON mortgage_scenarios (property_id) WHERE deleted_at IS NULL;
```

`SET NULL`, not `CASCADE`: deleting a property should not silently destroy the
analysis work done on it.

**`label` stays and stays required**, but changes meaning — it names the
*scenario*, not the house. The address identifies the house. Existing saved rows
keep working with a null `property_id`; they are scenarios without a house
attached, which is exactly what they are today.

The unique index moves from `(owner, label)` to `(owner, property_id, label)`,
so *"at asking"* can exist once per house rather than once per account.

---

## The UX

### 1. Saving asks for the house

Today: one text box, "Name this scenario".

```
┌─ SAVE THIS SCENARIO ─────────────────┐
│ Address                              │
│ [ 128 Maple St                     ] │
│ [ Duluth        ] [ GA ] [ 30096   ] │
│                                      │
│ Scenario name                        │
│ [ at asking                        ] │
│                                      │
│          [ Save scenario ]           │
└──────────────────────────────────────┘
```

The address runs through `upsertProperty` with `origin: "analysis"`, so a house
already in the CRM is **matched, not duplicated** — by parcel first, normalized
address second, exactly as every other write path does.

When the address matches an existing property, say so before saving: *"Matches
128 Maple St, already in your pipeline at Contacted."* The CRM form already
surfaces that message; this reuses it rather than inventing a second wording.

### 2. Seeing them: grouped by house, not a flat list

The current flat list is the thing that does not scale — ten scenarios across
three houses read as ten unrelated rows.

```
┌─ SAVED ──────────────────────────────┐
│ ▾ 128 Maple St, Duluth        ● Lead │
│     at asking      $250k   $2,221/mo │
│     at $240k       $240k   $2,140/mo │
│     203(k) reno    $329k   $2,655/mo │
│                                      │
│ ▾ 44 Oak Ave, Decatur                │
│     as listed      $412k   $3,480/mo │
│                        [+ Add to CRM]│
└──────────────────────────────────────┘
```

Grouped by property, each row a scenario. The badge says whether the house is
already a lead and at what stage. A house that is not yet a lead offers one
action to make it one.

### 3. A real place to manage them

The card in the results column is fine for *reload the one I was just working
on*. It is the wrong place to manage a dozen.

**A `/mortgage/saved` route**, reachable from the calculator and from the Tools
nav, with the grouped view above plus what the card cannot do: rename, delete,
restore a version, and compare two scenarios on the same house side by side.

Comparison is the reason the grouping matters — *"at asking"* against *"at
$240k"* is two columns and a diff, and the data for it already exists in
`diffInputs`.

### 4. From a scenario to a lead, and back

- **Scenario → CRM.** "Add to pipeline" calls `createEntry` with
  `source: "analysis"` — the enum value that has been waiting for it.
- **CRM → scenario.** The property detail page gains a Numbers section listing
  that property's scenarios, each opening the calculator loaded with them. It
  sits alongside Contacts, Tasks and Activity, which is where someone asks
  "what did we think this was worth?"

---

## Scope

### Migration
- `mortgage_scenarios.property_id`, its index, and the moved unique index.

### Changed
- `lib/mortgage/scenarioService.ts` — save takes address parts, calls
  `upsertProperty`, returns the property; list groups by property.
- `lib/property/propertyService.ts` — **unchanged**. It already does this job.
- `components/mortgage/ScenarioBar.tsx` — address fields, match message,
  grouped list.
- `components/crm/PropertyDetailPage.tsx` — a Numbers section.
- `app/api/mortgage/scenarios/` — address in the save body; property in the list.

### New
- `app/mortgage/saved/page.tsx` + `components/mortgage/SavedScenarios.tsx`
- `app/api/mortgage/scenarios/[id]/pipeline/route.ts` — promote to lead
- `tests/21-scenario-properties.spec.ts`

### Untouched
- Every calculation.
- The CRM pipeline, stage and task logic.
- The `analyses` table, still unused and still not the right home for this.

## Approach

1. Migration written, reviewed, **not run** until you say.
2. Service: address → `upsertProperty` → scenario, with unit tests on the
   match-not-duplicate behaviour.
3. `ScenarioBar` takes an address; grouped list.
4. `/mortgage/saved` with rename, delete, restore, compare.
5. Promote-to-lead route and the CRM Numbers section.
6. Playwright at 390px, then verify.

## Risks

- **Existing scenarios have no property.** They must keep loading, listed under
  an "Unassigned" group with an action to attach an address. Not migrated
  silently — there is no address to infer, and inventing one would be worse.
- **`upsertProperty` flags probable address matches** with
  `needs_address_review` rather than merging confidently. That flag has to
  surface here too, or the calculator becomes a way to create unreviewed merges
  the CRM never sees.
- **Creating a property is a CRM write from the calculator.** A typo'd address
  makes a property row. Mitigated by the match message before saving, but it is
  a real new way to put junk in the pipeline.
- **The grouped view changes what "saved" means** — from a list of names to a
  list of houses. Anyone used to the current flat list will notice.
- **Scope**: this is a migration, a service rewrite, two new screens and a CRM
  change. Worth splitting if you want the address link before the full
  management screen.

## Testing

- Unit: saving twice at one address produces one property and two scenarios;
  a near-miss address matches and sets `needs_address_review`; a scenario with a
  null `property_id` still loads.
- API: 400 on a missing address line, 403 on a wrong context, 404 on a missing
  scenario.
- Playwright at 390px: save with an address, see it grouped under the house,
  save a second scenario on the same house, promote to a lead, and find it on
  the CRM pipeline.
- `npm run build`, `tsc`, `lint`, `jest`.

## Out of scope

- Comparing scenarios across *different* houses.
- Importing properties from PropStream, still unbuilt.
- The `analyses` table and the cash-flow tool it was built for.

---

## Open questions

1. **Should the calculator be able to create a property at all, or only attach
   to one that already exists?** The plan lets it create, because requiring the
   house to be in the CRM first means you cannot run numbers on something you
   just found. The cost is that a typo makes a property row.
2. **Does saving a scenario make the house a lead automatically, or is that a
   separate click?** The plan keeps it a click — running numbers on a house is
   not the same as deciding to work it, and auto-creating leads would fill the
   pipeline with things you rejected in thirty seconds.
3. **Split this?** The address link and the CRM connection are the valuable
   half. The `/mortgage/saved` management screen is the bigger half. They can
   ship separately.
