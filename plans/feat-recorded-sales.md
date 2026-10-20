# Plan: comps are recorded sales

Status: **Draft** — rewritten 2026-10-20 to match the owner's decision that
comps come only from real recorded sales. Waiting for approval. No code
written. Branch `feat/recorded-sales`, off main at `39953ac`.

Cost once built: **1 RentCast request per house, ~45 houses a month.**
Cost while building: **0** — everything is tested against the `/properties`
response already stored for 1653 Sylvan Rd SW.

## The decision

**`/avm/value` is no longer called for new lookups.** Comps come from
`GET /properties`, which returns closed sale prices from public records.

The evidence is one owner-authorised live call on 2026-10-20 (1653 Sylvan Rd
SW, radius 1, `saleDateRange=180`, Single Family, limit 500):

- **10 records.** `lastSalePrice` and `lastSaleDate` on all 10.
- **5 survived `compEligibility`.** ARV **$274,140**, `soldOnly: true`,
  moderate confidence — against **$290,560** from the 15 stored listings.
- **Zero address overlap** with those 15, though 5 of the 10 sit on the same
  streets at different house numbers.

A listing tells you what somebody hoped for. A deed tells you what somebody
paid. The ARV should rest on the second.

## Stack

TypeScript (strict) and Tailwind. SQL for the migration. No new packages.

## Scope — files that change

| File | Change |
|---|---|
| `supabase/migrations/<ts>_public_record_comps.sql` | **new.** Source value, CHECK, columns. Written, NOT run. |
| `lib/rentcast/types.ts` | wire types for `GET /properties` |
| `lib/rentcast/client.ts` | `fetchPropertyRecords()` beside `fetchValueEstimate()` |
| `lib/comps/fromPropertyRecords.ts` | **new.** Mapper, mirroring `fromRentCast.ts`. |
| `lib/comps/compService.ts` | `savePublicRecordComps()`; protect the new columns |
| `lib/comps/arv.ts` | the fixer-upper flag reaches the screen |
| `app/api/properties/[id]/comps/refresh/route.ts` | call `/properties`; block a lookup with no facts |
| `components/crm/CompsPanel.tsx` | the "county record" marker and the flag |
| `scripts/diagnose-comps.ts` | replay a stored `/properties` body |
| `tests/unit/fromPropertyRecords.test.ts` | **new.** Mapper. |
| `tests/unit/arv.test.ts` | the flag, cross-source dedupe |
| `tests/27-recorded-sales.spec.ts` | **new.** Playwright at 390px. |

`fromRentCast.ts` is the `/avm/value` boundary and stays exactly as it is —
old comps still need to map on read. A second endpoint gets a second file.

## The request

One call per house:

```
GET /properties
  address        = the house's full address
  radius         = 1
  saleDateRange  = 365
  propertyType   = Single Family
  limit          = 500
```

### Correction, and what it buys us

An earlier note in this plan said `/properties` cannot filter on size or
beds. **That was wrong.** It accepts `bedrooms`, `bathrooms`,
`squareFootage`, `lotSize` and `yearBuilt`, each as a numeric range
(`bedrooms=2:3`).

That matters, because it means the Phase 1 principle — *search the area the
ARV is willing to count* — applies here too. We can ask RentCast for only the
houses that would survive `compEligibility` instead of filtering them out
after they arrive.

**Recommendation: send the eligibility envelope as ranges**, derived from
`COMP_ELIGIBILITY` so the two cannot drift:

| Sent | Derived from |
|---|---|
| `squareFootage` ±20% of subject | `sqftTolerancePct` |
| `bedrooms` ±1 | `bedsTolerance` |
| `bathrooms` ±1 | `bathsTolerance` |
| `yearBuilt` ±20 | `yearBuiltTolerance` |

**The risk is real and should be weighed:** unfiltered at 180 days we got 10
records and kept 5. Filtered, we would get roughly those 5 and nothing to
spare, so one bad record is the difference between a usable ARV and none. The
365-day window is what pays for that — see below.

**Open question for the owner:** send the ranges (fewer, better-targeted
records) or send only `propertyType` and filter locally (more records, more
waste, more resilience)? I recommend the ranges, with `yearBuilt` left off
for pre-1940 houses, because that filter is the one that misfires — on
Sylvan's 1930 subject a ±20 window excludes most of the surrounding 1950s
stock.

## The sale window: 365 days

Settled at **365** by the owner. Recording the reasoning so it can be argued
with later:

At 180 days the one live call returned 10 records and 5 eligible comps.
`MIN_COMPS_FOR_GOOD` is 8 and `MIN_COMPS_FOR_MODERATE` is 5, so that set
landed exactly on the boundary of "moderate" — one record away from "low".
Doubling the window is the only lever that does not cost another request.

The cost is that **nothing in `arv.ts` adjusts for time.** An eleven-month-old
sale enters the median at face value. Mitigation is disclosure, not
arithmetic: every comp shows its sale date, and sales older than 12 months
would be flagged — except at a 365-day window nothing can be, which is worth
saying out loud. If the window ever widens past a year, the staleness rule
drafted in `plans/feat-comp-outcomes.md` is the one to bring over.

## House facts come from the owner

The owner enters sqft, beds, baths and year built when adding the house.
Those facts are what the request is built from, so:

**If sqft or beds is missing, the request is not spent.** The screen asks for
them first. This reuses the `missing_facts` gate already built in Phase 1 —
same degraded response, same confirm panel — with one change: there is no
"Look up anyway" escape, because without size and beds the ranges cannot be
built and the call would be a different, worse call. The button becomes "Add
the size first" and goes to the house form.

**Change from Phase 1, flagged:** today that gate can be overridden with
`acknowledgeMissingFacts`. Removing the override is a deliberate narrowing. If
the owner wants to keep an escape hatch, it should send no ranges at all and
say so on screen rather than silently sending a worse query.

`/avm/value` used to backfill these facts from `subjectProperty`. Nothing
does now. A house with blank facts stays blank until the owner fills it in.

## Old comps stay

Comps already stored from `/avm/value` **remain visible and are not deleted**.
They keep their Active and Removed labels and their existing behaviour.

- No migration touches them.
- `saveRentCastComps` is left in place and still maps them on read.
- New lookups never create `source = 'rentcast'` rows again.

So an old house shows its listings plus, after one refresh, its recorded
sales. A new house shows recorded sales only. Two sold comps trip
`SOLD_ONLY_THRESHOLD`, so on most old houses the listings will stop counting
toward the ARV while staying on screen with their reason — which is the
existing, tested behaviour, not new code.

## The data model

### The migration — written, NOT run

`status = 'sold'` is currently reachable only from `source = 'manual'`:

```sql
CONSTRAINT property_comps_sold_is_manual
  CHECK (status <> 'sold' OR source = 'manual')
```

A county record is proof in the way a listing is not, so it earns its own
source rather than borrowing `manual`:

```sql
-- Confirm the auto-generated name against the database first: \d property_comps
ALTER TABLE property_comps DROP CONSTRAINT property_comps_source_check;
ALTER TABLE property_comps ADD CONSTRAINT property_comps_source_check
  CHECK (source IN ('rentcast', 'manual', 'public_record'));

ALTER TABLE property_comps DROP CONSTRAINT property_comps_sold_is_manual;
ALTER TABLE property_comps ADD CONSTRAINT property_comps_sold_needs_proof
  CHECK (status <> 'sold' OR source IN ('manual', 'public_record'));
```

The rule is unchanged in substance: **`rentcast` can never assert a sale.**
Only a person or a deed can. The constraint is renamed because
`sold_is_manual` would no longer describe what it enforces.

New columns:

| Column | Type | Notes |
|---|---|---|
| `buyer_type` | `text` | `CHECK (buyer_type IS NULL OR buyer_type IN ('Individual','Organization'))` |
| `buyer_name` | `text` | `owner.names[0]`, so the flag can say who |
| `county` | `text` | which county's records this came from |

**Naming trap:** the table already has `owner_type` meaning `personal | team`
— the tenancy owner. The buyer of a comp is a different thing entirely, and
reusing that name would corrupt every owner filter in `compService.ts`. It is
`buyer_type`.

`removed_date` carries the sale date, exactly as it already does for a
hand-entered sold comp. `external_id` carries RentCast's record id — the
address slug, `"952-Estes-Dr-SW,-Atlanta,-GA-30310"` — which fits the
existing `(property_id, source, external_id)` unique index.

**The migration is written and not run.** I will stop and ask when it is
needed; steps 3 onward do not typecheck until `database.types.ts` is
regenerated, which cannot happen until it has run.

## The wire format, confirmed from the stored response

Not from the docs — from the body in `rentcast_requests` now.

Per record: `id`, `formattedAddress`, `addressLine1`, `addressLine2`, `city`,
`state`, `zipCode`, `county`, `countyFips`, `stateFips`, `latitude`,
`longitude`, `propertyType`, `bedrooms`, `bathrooms`, `squareFootage`,
`lotSize`, `yearBuilt`, `assessorID`, `legalDescription`, `subdivision`,
`zoning`, `ownerOccupied`, `owner`, `features`, `taxAssessments`,
`propertyTaxes`, `lastSaleDate`, `lastSalePrice`, `history`.

Three shapes to get right before writing the mapper:

- **`history` is an object keyed by `YYYY-MM-DD`**, not an array. Values are
  `{ date, event, price }`; the only `event` seen is `"Sale"`. Iterate
  `Object.values()` — indexing `[0]` returns undefined.
- **`owner` is an object**: `{ type, names[], mailingAddress }`, `type` being
  `"Individual"` or `"Organization"`.
- **There is no listing price, status or listing date.** This endpoint knows
  about the deed, not the market.

Every result **with a sale price** becomes a comp: `status = 'sold'`,
`source = 'public_record'`, `price = lastSalePrice`,
`removed_date = lastSaleDate`. A record with no `lastSalePrice` is dropped —
it cannot move an ARV and a zero posing as a price is the worst outcome here.

## The fixer-upper flag

Flagged when **either** holds, both as named constants:

- `lastSalePrice` < $200,000, or
- `buyer_type === 'Organization'`

**Flagged, ticked, and untickable by the owner.** It stays in the ARV until
the owner says otherwise — the existing `included` checkbox is exactly the
right control and no new mechanism is needed. The flag is a note next to it,
not a filter.

On the Sylvan data this flags **4 of 10**:

| Address | Price | Why |
|---|---|---|
| 948 Byron Dr SW | $334,000 | Organization (ELMWOOD HOMES LLC) |
| 1842 Lisbon Dr SW | $145,000 | under $200,000 + Organization (GEORGIA TARGET PROPERTIES LTD) |
| 1989 Brewer Blvd SW | $159,990 | under $200,000 |
| 2070 Perkerson Rd SW | $147,000 | under $200,000 + Organization (FKH SFR PROPCO D LP) |

**One of the four is inside the ARV.** 1842 Lisbon Dr at $145,000, adjusted to
$151,080, is the bottom of the five-comp median and is actively pulling the
number down. That is precisely why it must be visible and must not be dropped
on its own: a $145,000 sale on a street fetching $274,000 is either a fixer or
the best evidence in the set, and only a person can say which.

Wording, per the writing rules: *"Bought by a company for $145,000, well under
what others nearby fetched. This may have been a fixer-upper, so it could be
below what a finished house is worth. Untick it to leave it out."*

Related and worth showing: the five eligible sales span **$138/sqft to
$376/sqft**. Not a bug in the flag — that is what the street did.

## On screen

Recorded sales appear in the existing comp list as **Sold**, with a small
"county record" marker separating them from a hand-entered sale. Active and
Removed listings on old houses are **untouched** — same labels, same place,
same behaviour.

Each recorded sale shows: address, `sold for $X`, sale date, sqft, beds,
baths, year built, distance, and the fixer note when flagged.

## Cache and cap

**Unchanged.** The 30-day per-address cache, the 45/month cap, the in-flight
lock and the four gates in `refresh/route.ts` all stay exactly as they are.
Only the endpoint behind gate 4 changes, plus the facts check in front of it.

`getUsage` counts billable rows regardless of endpoint, so `/properties`
already counts against the cap — confirmed by the live call, which took usage
from 11 to 12.

## Cross-source dedupe

Phase 1's dedupe collapses comps by street key plus sqft. It now spans
sources, and "most recent" is no longer the right tie-break:

1. `manual` wins — a person typed it from an agent's list.
2. then `public_record` — a deed beats a listing.
3. then `rentcast`, most recent copy, as today.

Without this an old house that is both a removed listing and a recorded sale
counts twice, once at each price. On the Sylvan data this never fires — zero
overlap — so it is easy to get wrong and never notice. It gets a unit test
with a hand-built collision.

## Refactors rather than new code

- The `missing_facts` gate, the four quota gates, the cache and the lock are
  all reused, not rebuilt.
- The eligibility ranges derive from `COMP_ELIGIBILITY`, not a second copy.
- `included` is the untick control; no parallel "excluded" concept.
- `subjectOptions()` already assembles subject facts for the ARV.
- `scripts/diagnose-comps.ts` is extended to replay a `/properties` body
  rather than a second script being written beside it.

## Risks — all Tier 2

- **Migration.** Written, not run. Drops and recreates two CHECK constraints
  on a live table; the auto-generated `property_comps_source_check` name must
  be confirmed against the database, not assumed.
- **Every existing house's ARV moves** on its first recorded-sales refresh,
  because two sold comps flip it to sold-only. Intended, but it is a number
  the owner has been looking at. On Sylvan: $290,560 → $274,140.
- **Narrowing the missing-facts override** removes an escape hatch that
  exists today.
- **Server-side range filters could starve a thin market.** Mitigated by the
  365-day window; worth a real-data check before shipping.
- **New files.** One migration, one mapper, two test files.
- **`buyer_type` vs `owner_type`.** Named above because getting it wrong
  corrupts tenancy filtering.
- Not in this plan and still true: `plans/feat-comp-outcomes.md` is **on
  hold**, and its off-market ceiling warning has no equivalent here.

## Testing

**Zero new RentCast requests while building.** Everything is checked against
the `/properties` body already stored for 1653 Sylvan Rd SW.

**Unit** — mapper handles the keyed `history` object, a missing `owner`, a
null `lastSalePrice` and a `$0` transfer; the flag fires on price, on
Organization, and on both; cross-source dedupe honours manual >
public_record > rentcast; two recorded sales trip sold-only; the range
builder derives from `COMP_ELIGIBILITY` and omits a range when its fact is
missing.

**Playwright (`tests/27-recorded-sales.spec.ts`, 390px, stubbed)** — opens via
`tab-arv`, never `tab-comps`; recorded sales render as Sold with the
county-record marker; a flagged comp shows its reason and stays ticked;
unticking it moves the ARV; Active and Removed rows on an old house are
unchanged; no horizontal scroll at 390px.

**Against real data** — `scripts/diagnose-comps.ts`, extended, replays the
stored `/properties` body. **The number to reproduce is $274,140 from 5
eligible sales.**

## Out of scope

- Time adjustment for older sales.
- Per-market $/sqft instead of the flat $40.
- Filtering non-arm's-length transfers beyond the fixer flag.
- Backfilling recorded sales for houses already in the system.
- Removing `/avm/value` or its stored comps.

## Done when

A house with facts entered pulls recorded sales in one request and shows them
as Sold comps marked "county record" beside its untouched Active and Removed
listings. A house without sqft or beds is asked for them instead of spending
the request. Flagged comps show why, stay ticked, and can be unticked.
Sylvan Rd reproduces **$274,140** against today's $290,560. The migration is
written and not run. `tsc`, `npm run build`, the unit tests and the
Playwright spec all pass, and the ARV tab is checked at 390px.
