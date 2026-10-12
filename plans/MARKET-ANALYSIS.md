# MARKET-ANALYSIS.md

Feature spec for the Market Analysis module in the Park Properties Finance App.
Read this alongside `CLAUDE.md`. All existing rules in `CLAUDE.md` still apply —
plan-first, no commits without instruction, no scope creep, mobile-first
verification, Plaid connections untouchable.

---

## 1. Purpose

Evaluate and compare real estate markets *before* looking at individual
properties. The module answers one question: which metro should I be shopping
in, and why.

This sits upstream of deal analysis. Market Analysis picks the city; property
analysis picks the house. Keep them separate — do not merge deal-level cash
flow math into this module.

## 2. Non-goals

Explicitly out of scope. Do not build these without a new instruction:

- Property-level or deal-level cash flow analysis (PITI, cap rate, CoCR)
- Automated MLS or listing ingestion
- Neighborhood- or ZIP-level analysis (this module is metro/county level)
- Any write path that touches Plaid data
- Sharing or exporting markets to other users

## 3. Data model

One table: `public.markets`. Migration already written —
see `20260906_create_markets.sql`. Types and field metadata in `market.ts`.

Key points:

- One row per market per user. `unique (user_id, name)`.
- `rent_to_income_ratio` and `rent_to_price_ratio` are **Postgres generated
  columns**. They are read-only from the app. Never write to them, never
  compute them client-side, never let a form bind to them.
- Every numeric field is nullable. A market with half the fields empty is a
  valid, expected state — this is a research tool, filled in over time.
- `is_local_baseline` marks the user's home market. Exactly zero or one row
  per user should have this true. It is the reference point every other market
  gets compared against.
- `data_source` and `data_pulled_at` track provenance. Always set them when
  writing field values.

## 4. Field groups

Fields are grouped for display. Groups are defined in `market.ts` as
`MARKET_FUNDAMENTALS`, `HOUSING_CONDITIONS`, and `QUALITATIVE_FIELDS`.

Render in that order. Do not invent new groups or reorder fields inside a
group without instruction — the order mirrors the research workflow.

Each field carries a `format` (`currency` / `percent` / `ratio` / `number` /
`text`) and, for scoreable metrics, a `higherIsBetter` boolean. Use
`formatField()` for all display. Never format inline.

## 5. Screens

### 5.1 Markets list

Entry point. Lists every saved market for the user.

- Card or row per market showing: name, median sale price, median rent,
  rent-to-price ratio, and completeness (how many fields are filled).
- The local baseline market is visually distinct and sorts first.
- Empty state invites the user to add their local market first.
- Primary action: add a market. Secondary: open comparison view.

### 5.2 Market detail

The worksheet itself. Full field entry for one market.

- Sections follow the field groups in §4.
- Numeric inputs, not free text, for numeric fields.
- Derived ratios display as computed values in a read-only summary block —
  never as editable inputs.
- Qualitative fields are multiline text areas.
- Autosave on blur. No explicit save button.
- Show `data_source` and `data_pulled_at` so stale data is visible.

### 5.3 Comparison view

Side-by-side table across the user's markets.

- Markets are columns, metrics are rows. Horizontal scroll on mobile.
- Cap the comparison at 5 markets. If more exist, the user selects which.
- For each scoreable row, highlight the best value using the field's
  `higherIsBetter` flag. A missing value is never "best."
- Qualitative fields are excluded from this table.

## 6. Scoring

Scoring is **phase 3**. Do not build it until phases 1 and 2 are shipped and
verified.

When built:

- Min-max normalize each scoreable metric across the markets being compared,
  producing 0–1 per metric.
- Invert the normalized value when `higherIsBetter` is false.
- Multiply by the metric's weight, sum, and divide by the sum of weights of
  metrics that actually had data. Null metrics drop out and the remaining
  weights renormalize — a market must not be penalized for a blank field.
- Fewer than two markets with data on a metric means that metric is skipped
  entirely (normalization is meaningless with one point).
- Weights are user-adjustable and persist per user, not per market.

Proposed default weights, tuned for buy-and-hold in an affordable market.
These are a starting point to be tuned, not a fixed rule:

| Metric | Weight |
|---|---|
| Rent-to-price ratio | 3 |
| Median sale price | 2 |
| Rent growth (YoY) | 2 |
| Job growth | 2 |
| Population growth | 2 |
| Unemployment rate | 2 |
| Median household income | 1 |
| Wage / income growth | 1 |
| Price growth (YoY) | 1 |
| Property tax rate | 1 |
| Crime rate | 1 |

Surface the score as a rank with the underlying numbers visible. Never show a
score without letting the user see what drove it.

## 7. Data sources

Manual entry is the baseline. Every field can always be typed in by hand.

- **BiggerPockets** — market pages supply population, median rent, median home
  price, rent-to-price, appreciation, rent growth, population growth,
  unemployment, median household income.
- **FRED** — job growth, wage/income growth, home ownership rate, median age,
  and longer price/rent series. County-level series are the right granularity
  for most metros.
- **County tax authority** — property tax rate, expressed as a percent. Note
  that many counties publish cents per $100 of assessed value; 49.9 cents
  is 0.499%. Store the percent.

FRED integration is **phase 4**. Until then, all entry is manual.

One caution for the FRED work when it happens: metro series get retired when
OMB redefines a metro area. A retired series shows a stale update timestamp and
no next release date, and will never update again. Validate that a series is
live before wiring it in, and prefer summing county series over trusting an
MSA-level series that may be frozen.

## 8. Conventions

Follow the existing app conventions in `CLAUDE.md`. Restating the ones this
module will hit:

- Centered modal overlays only.
- CSS Grid with `alignContent: start`.
- No max-width on full-page views.
- Lucide icons for system items; emoji only for user-created items.
- Mobile-first. Bottom tab navigation. Verify on mobile viewport before
  calling anything done.

## 9. Build order

Ship and verify each phase before starting the next.

1. **Schema + list + detail form.** Migration, RLS, markets list, worksheet
   entry with autosave. Manual data only.
2. **Comparison view.** Side-by-side table, best-value highlighting, 5-market
   cap.
3. **Scoring.** Normalization, weights, rank. Weight editor.
4. **FRED integration.** Series lookup and auto-fill, with provenance and a
   manual override path that always wins.

## 10. Acceptance criteria

Phase 1 is done when:

- A market can be created, edited, and deleted, and RLS blocks access to
  another user's rows.
- Ratios update automatically when rent, price, or income changes, with no
  client-side computation anywhere in the codebase.
- A market with only a name saves without error.
- The worksheet is usable on a 375px viewport with no horizontal scroll.
- Autosave does not fire on unchanged fields.
