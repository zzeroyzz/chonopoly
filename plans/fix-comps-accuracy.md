# Plan: make comps and the ARV accurate

Status: proposed, waiting for owner approval. Nothing has been changed.
RentCast requests spent writing this plan: 0.

## The problem
The ARV doesn't line up with what similar houses nearby actually sold for.

## Why it happens (from reading the code)

1. **The comps are not sales. They are asking prices.**
   `GET /avm/value` returns listings. RentCast's docs describe the comp `price`
   field as "the listed price ... of the comparable property". "Inactive" only
   means the listing came off the market: it might have sold, or the seller
   might have pulled it. `arv.ts` only builds from real sales when there are
   2+ `sold` comps, and `sold` can only come from comps typed in by hand. So
   every automatic ARV is a median of asking prices, including withdrawn
   listings that were probably overpriced.

2. **The first lookup can go out without the house's specs, and then it's cached for 30 days.**
   `refresh/route.ts` sends sqft/beds/baths only when the property already
   has them. A new house usually doesn't. The facts come back in the *same*
   response, but the comps were already picked without them. The response is
   then cached by address for 30 days, so pressing Refresh after the facts
   fill in replays the same untargeted comps. Getting new ones means a
   forced, billed refresh.

3. **The search and the filter disagree, so good comps get thrown away and bad ones get in.**
   - We ask for comps within **2 mi** (`DEFAULT_MAX_RADIUS_MILES`), then
     `arv.ts` throws out anything past **1 mi**. Part of what we paid for is
     discarded every time.
   - `propertyType` is never sent, and never checked, so a townhouse or condo
     can count as a comp for a single-family house.
   - Baths, year built and lot size are never checked. A 1960s 1-bath house
     and a 2005 2.5-bath house count the same.
   - Lookback is 270 days with no adjustment for time.

4. **Size is the only thing we adjust for, at a flat $40/sqft everywhere.**
   Nothing for beds, baths, age, garage or lot.

5. **Small bug: the number changes between a refresh and a reload.**
   `applyResponse()` in `refresh/route.ts` calls `calculateArv(comps, subjectSqft)`
   without `subjectBeds`. Every other caller passes it. So right after a
   refresh the bedroom filter is skipped, and after a reload it isn't.

## The fix, in phases (cheapest first)

### Phase 0: diagnose without spending any requests
- Every RentCast response we've paid for is already stored in
  `rentcast_requests`. Write a read-only script that replays them for the
  houses you think are wrong. For each comp it prints status, price, sqft,
  beds, baths, type, distance and whether `arv.ts` used it.
- Owner supplies 2–3 benchmark houses with the real sold comps from an
  agent, Redfin or Zillow. These are the answer key every phase is checked
  against.
- Cost: 0 requests.

### Phase 1: fix the logic (code only, 0 requests)
1. Pass `subjectBeds` in `applyResponse()` (bug 5).
2. Make the search match the filter: `maxRadius` 1 mi, `daysOld` 180,
   `compCount` 25. A request costs the same whatever the comp count, so ask
   for the maximum.
3. Send `propertyType` when known. Add property type, baths (±1) and year
   built (±20 yrs) to `compEligibility()`, each with a plain reason on screen
   ("townhouse", "built 1962").
4. Don't let a lookup go out blind. On Add House, ask for sqft and beds
   first (or confirm them). If either is still missing, warn before
   spending a request. Store the specs we sent with each request, so the
   Comps tab can say "these were pulled before we knew the size".
5. Treat removed listings more cautiously than sales: rank by days on market
   and note that asking prices run above sale prices. No hidden discount.
   Just say it on screen and rely on Phase 2 for real sales.

Each of these is a separate commit, so any one can be backed out.

### Phase 2: pull real recorded sales (needs approval, spends requests)
Georgia records sale prices publicly. RentCast's `GET /properties` searches
public records by radius, with filters for `saleDateRange` (days since the
last sale), `squareFootage`, `bedrooms`, `bathrooms`, `yearBuilt` and
`propertyType`. All of those accept ranges, and one call returns up to 500
records. That gives us **actual closed sale prices**, which is what an ARV
needs.

- New mapper `fromPropertyRecords.ts` → comps with a new status, `recorded`
  ("sold, per county records"), separate from hand-entered `sold`.
- **Structural change, flagged:** the `property_comps` CHECK only allows
  sold-type comps from `source = 'manual'`. This needs a migration adding a
  `public_record` source. Written, **not run** until the owner says so.
- Filter out sales that aren't arm's-length: $0 and nominal transfers, and
  anything far below the street's range (foreclosures, family transfers).
- Recorded sales outrank listings in `arv.ts`, the same way manual sales
  already do.

**Request budget (50/month plan, cap 45):**

| Option | Requests per house | Houses per month |
|---|---|---|
| A. Call `/properties` first, and `/avm/value` only if fewer than 3 good sales come back | 1–2 | ~25–45 |
| B. Always call both | 2 | ~22 |
| C. `/properties` only | 1 | ~45 |

Recommended: **A**.

Before building Phase 2, **one** deliberate live `/properties` call on a
benchmark house, run only with owner approval, confirms the exact
sale-price field names and that Gwinnett/Fulton sales come back with
prices. Cost: 1 request.

## Not in scope (reported, not fixed)
- Per-market $/sqft rate (instead of the flat $40). Worth doing once real
  sales exist to calibrate against.
- Condition and renovation adjustments.

## Done when
For each benchmark house, the ARV lands within about 5% of the agent's
number, and every comp left out shows the reason why. `npm run build` and
`tsc` both pass. The comps screen is checked at 390px wide.
