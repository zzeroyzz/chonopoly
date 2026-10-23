"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Home, AlertTriangle, ExternalLink, Star } from "lucide-react";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import {
  VerdictTag,
  AFFORDABILITY_STYLE,
  DEAL_STYLE,
} from "@/components/mortgage/VerdictTag";
import { useCrmContext } from "@/components/crm/useCrmContext";
import { dollars } from "@/components/mortgage/format";
import {
  AFFORDABILITY_LABEL,
  DEAL_LABEL,
  NO_RESALE_PRICE_LABEL,
} from "@/lib/mortgage/verdicts";
import { type ScreenRow } from "@/lib/screen/screenRow";
import { specLine } from "@/lib/screen/specLine";
import { mapPins } from "@/lib/screen/mapPins";
import { NO_LISTING_PRICE_LABEL } from "@/lib/property/types";

/**
 * Leaflet reads `window` as it loads, so the map is client-only and arrives
 * in its own chunk — nothing else on the app pays for it.
 */
const HouseMap = dynamic(() => import("./HouseMap").then((module) => module.HouseMap), {
  ssr: false,
  loading: () => <div className="size-full bg-(--color-surface)" />,
});

/** How long the row has to sit still before the card in the middle counts as chosen. */
const SCROLL_SETTLE_MS = 120;
/** Within this of either end, the row counts as at that end. */
const ROW_END_SLACK_PX = 4;

/**
 * Every house, with its numbers and both verdicts.
 *
 * This was a list of addresses and stages. It is the screen now: the point of
 * having fifteen houses in one place is comparing them, and a list you have to
 * open one at a time does not let you.
 *
 * Cards at 390px rather than the plan's eight-column table. That table is the
 * right shape on a desktop and unreadable on a phone — eight columns either
 * scroll sideways, which hides the verdicts, or shrink past legibility. Each
 * card leads with the two verdicts, because they are the reason to look.
 */

/**
 * The same four steps the property page shows, in the same order, so the card
 * and the page agree about where a house has got to.
 */
const FLOW_STEPS = [
  // A house exists the moment it is added, so this one is always done.
  { label: "Details", tab: "details", done: () => true },
  { label: "ARV", tab: "arv", done: (r: ScreenRow) => r.arv !== null },
  { label: "Numbers", tab: "numbers", done: (r: ScreenRow) => r.checklist.numbers },
  { label: "Deal", tab: "deal", done: (r: ScreenRow) => r.walkAwayCash !== null },
] as const;

export function PropertiesPage({ mapTilesKey }: { mapTilesKey: string | null }) {
  const { ctxParams } = useCrmContext();
  const [rows, setRows] = useState<ScreenRow[]>([]);
  const [filter, setFilter] = useState<"all" | "finalists">("all");
  /** Houses ticked for comparison, in the order they were picked. */
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The house the row and the map are both pointing at. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Set while the row is scrolling because a pin was tapped. That scroll is
   * the app's, not the owner's, so when it settles it must not re-pick a card:
   * the last card cannot reach the middle, and re-picking chose its
   * neighbour instead of the house that was tapped.
   */
  const scrollingToPin = useRef(false);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  /**
   * Re-read when the profile has changed since this list was built.
   *
   * Every verdict on this page is computed server-side from the profile, so a
   * list rendered before the income was saved keeps saying "Set your income"
   * until something forces a refetch. Settings stamps localStorage on a
   * confirmed save; coming back to this tab picks it up.
   */
  const [profileStamp, setProfileStamp] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        setProfileStamp(window.localStorage.getItem("buyerProfileUpdatedAt"));
      } catch {
        // Private mode: the focus listener below still refetches.
      }
    };
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);

  useEffect(() => {
    if (!ctxParams) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/properties/screen?${ctxParams}`);
        const text = await res.text();
        if (!res.ok) {
          let message = `Failed to load (HTTP ${res.status})`;
          try {
            const parsed = JSON.parse(text) as { error?: string };
            if (parsed.error) message = parsed.error;
          } catch {
            // Keep the status message.
          }
          throw new Error(message);
        }
        const body = JSON.parse(text) as { rows: ScreenRow[] };
        if (!cancelled) {
          setRows(body.rows);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctxParams, profileStamp]);

  const finalistCount = rows.filter((r) => r.isFinalist).length;
  const visible = filter === "finalists" ? rows.filter((r) => r.isFinalist) : rows;
  const { pins, unplaced } = useMemo(() => mapPins(visible), [visible]);
  // Until anything is chosen, the first card is: the map should point at the
  // house the row opens on.
  const selected =
    selectedId !== null && visible.some((r) => r.propertyId === selectedId)
      ? selectedId
      : (visible[0]?.propertyId ?? null);

  /** The card nearest the middle of the row, once the row stops moving. */
  function onRowScroll() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const row = rowRef.current;
      if (!row) return;
      if (scrollingToPin.current) {
        scrollingToPin.current = false;
        return;
      }
      // The ends of the row choose its ends: the first and last cards cannot
      // be scrolled to the middle, so "nearest the middle" never picks them.
      const ids = visible.map((r) => r.propertyId);
      if (row.scrollLeft <= ROW_END_SLACK_PX) {
        setSelectedId(ids[0] ?? null);
        return;
      }
      if (row.scrollLeft + row.clientWidth >= row.scrollWidth - ROW_END_SLACK_PX) {
        setSelectedId(ids[ids.length - 1] ?? null);
        return;
      }
      const box = row.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      let nearest: string | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const [id, card] of cardRefs.current) {
        const cardBox = card.getBoundingClientRect();
        const distance = Math.abs(cardBox.left + cardBox.width / 2 - middle);
        if (distance < nearestDistance) {
          nearest = id;
          nearestDistance = distance;
        }
      }
      if (nearest) setSelectedId(nearest);
    }, SCROLL_SETTLE_MS);
  }

  /**
   * A pin was tapped: choose that house and bring its card to the middle.
   *
   * The row is scrolled directly rather than with scrollIntoView, which also
   * scrolled the page up to the row — away from the map that was just tapped.
   */
  function selectFromMap(propertyId: string) {
    setSelectedId(propertyId);
    const row = rowRef.current;
    const card = cardRefs.current.get(propertyId);
    if (!row || !card) return;

    const rowBox = row.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const left = row.scrollLeft + (cardBox.left - rowBox.left) - (rowBox.width - cardBox.width) / 2;
    const reachable = Math.max(0, Math.min(left, row.scrollWidth - row.clientWidth));
    if (Math.abs(reachable - row.scrollLeft) < 1) return;

    scrollingToPin.current = true;
    row.scrollTo({ left: reachable, behavior: "smooth" });
  }

  return (
    <>
      <div className="overflow-y-auto flex-1 w-full px-4 py-4 pb-24 lg:pb-8">
        <h1 className="text-(length:--type-heading-size) leading-(--type-heading-leading) font-semibold text-(--color-text-primary)">
          Properties
        </h1>
        {/* Worded as the design system's screens.md has it. */}
        <p className="text-(length:--type-body-size) leading-(--type-body-leading) text-(--color-text-secondary) mt-1 mb-3">
          Every house you&apos;re looking at. Tap one to see whether it works.
        </p>

        {loading && (
          <SkeletonRegion label="Loading your houses" testId="screen-loading">
            {/* The row's first cards and the map, at their real sizes, so
                nothing jumps when the houses arrive. */}
            <div className="flex gap-3 overflow-hidden">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="shrink-0 w-[280px] lg:w-[340px] rounded-(--radius-lg) border border-(--color-border-default) bg-(--color-surface) overflow-hidden"
                >
                  <Skeleton className="h-[130px] lg:h-[170px] w-full rounded-none" />
                  <div className="px-4 pt-2 pb-3 grid gap-1.5">
                    <Skeleton className="h-7 w-2/5" />
                    <Skeleton className="h-5 w-4/5" />
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-9 w-full mt-1" />
                    <Skeleton className="h-9 w-3/5 mt-2 rounded-(--radius-pill)" />
                  </div>
                </div>
              ))}
            </div>
            <Skeleton className="mt-3 h-[42dvh] min-h-[280px] lg:h-[50dvh] w-full rounded-(--radius-lg)" />
          </SkeletonRegion>
        )}

        {error && (
          <p
            data-testid="screen-error"
            className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5"
          >
            {error}
          </p>
        )}

        {/* The design system's empty state: what goes here, how it gets
            filled, and a button that does it. */}
        {!loading && !error && rows.length === 0 && (
          <div data-testid="screen-empty" className="text-center py-12">
            <Home size={28} className="mx-auto text-(--color-text-tertiary) mb-3" />
            <p className="text-(length:--type-body-size) leading-(--type-body-leading) font-semibold text-(--color-text-primary)">
              No houses yet
            </p>
            <p className="text-(length:--type-body-size) leading-(--type-body-leading) text-(--color-text-secondary) mt-1 max-w-[300px] mx-auto">
              Add the first one and we&apos;ll tell you what it&apos;s worth fixed up and
              whether the numbers work.
            </p>
            <Link
              href="/properties/new"
              className="inline-flex items-center min-h-(--tap-min) mt-3 px-5 rounded-(--radius-pill) bg-(--color-accent) text-(--color-base) text-(length:--type-body-size) font-semibold"
            >
              Add a house
            </Link>
          </div>
        )}

        {/* One banner, not a chip on every card. Fifteen houses all telling
            you to set your income is fifteen copies of one problem, and it
            buries the verdicts that differ. Hard money houses do not need
            income at all, so this only appears when something actually
            depends on it. */}
        {rows.length > 0 && rows.some((r) => r.affordability.needsProfile) && (
          <Link
            href="/settings/profile"
            data-testid="needs-income-banner"
            className="flex items-start gap-2 rounded-lg border border-(--color-warning) bg-(--color-warning)/10 px-3 py-2.5 mb-2.5"
          >
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-(--color-warning)" />
            <span className="min-w-0">
              <span className="block text-[12px] text-(--color-text-primary)">
                No income on file, so the ratios cannot be judged.
              </span>
              <span className="block text-[11px] text-(--color-text-secondary)">
                Add it in Settings → Profile. Hard money houses do not need it.
              </span>
            </span>
          </Link>
        )}

        {rows.length > 0 && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {/* Each pill is 36px inside a 44px target, per the design
                system's tap sizes. */}
            {(["all", "finalists"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                data-testid={`filter-${f}`}
                aria-pressed={filter === f}
                className="min-h-(--tap-min) inline-flex items-center"
              >
                <span
                  className={`h-(--control-pill) px-4 inline-flex items-center rounded-(--radius-pill) text-(length:--type-body-sm-size) transition-colors ${
                    filter === f
                      ? "bg-(--color-accent) text-(--color-base) font-semibold"
                      : "border border-(--color-border-strong) text-(--color-text-secondary)"
                  }`}
                >
                  {f === "all" ? "All" : "Finalists"}
                  {f === "finalists" && finalistCount > 0 ? ` (${finalistCount})` : ""}
                </span>
              </button>
            ))}

            <div className="flex-1" />

            {/* Two routes to the same place: tick houses, or compare the ones
                already marked as finalists. */}
            {picked.length >= 2 ? (
              <Link
                href={`/compare?ids=${picked.slice(0, 4).join(",")}`}
                data-testid="compare-picked"
                className="min-h-(--tap-min) inline-flex items-center"
              >
                <span className="h-(--control-pill) px-4 inline-flex items-center rounded-(--radius-pill) bg-(--color-accent) text-(--color-base) text-(length:--type-body-sm-size) font-semibold">
                  Compare {Math.min(picked.length, 4)}
                </span>
              </Link>
            ) : finalistCount >= 2 ? (
              <Link
                href={`/compare?ids=${rows
                  .filter((r) => r.isFinalist)
                  .slice(0, 4)
                  .map((r) => r.propertyId)
                  .join(",")}`}
                data-testid="compare-finalists"
                className="min-h-(--tap-min) inline-flex items-center"
              >
                <span className="h-(--control-pill) px-4 inline-flex items-center rounded-(--radius-pill) border border-(--color-accent) text-(--color-accent) text-(length:--type-body-sm-size)">
                  Compare finalists
                </span>
              </Link>
            ) : null}
          </div>
        )}

        {/* A filter hiding everything is not an empty screen: the houses
            exist and the user hid them. A line and a way back, per the
            design system's EmptyState rules. */}
        {rows.length > 0 && visible.length === 0 && (
          <div data-testid="screen-filter-empty" className="py-8 text-center">
            <p className="text-(length:--type-body-size) leading-(--type-body-leading) text-(--color-text-secondary)">
              No finalists yet. Tap the star on a house to make it one.
            </p>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="min-h-(--tap-min) mt-2 px-5 rounded-(--radius-pill) border border-(--color-border-strong) text-(length:--type-body-size) text-(--color-text-primary)"
            >
              Show all
            </button>
          </div>
        )}

        {visible.length > 0 && (
          // One row, sideways. Each card snaps to the middle and the next one
          // peeks in, so the row reads as more than one house.
          <ul
            ref={rowRef}
            onScroll={onRowScroll}
            data-testid="screen-table"
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {visible.map((row) => (
              <ScreenCard
                key={row.propertyId}
                row={row}
                selected={row.propertyId === selected}
                cardRef={(card) => {
                  if (card) cardRefs.current.set(row.propertyId, card);
                  else cardRefs.current.delete(row.propertyId);
                }}
                picked={picked.includes(row.propertyId)}
                onPick={(on) =>
                  setPicked((prev) =>
                    on
                      ? prev.includes(row.propertyId)
                        ? prev
                        : [...prev, row.propertyId]
                      : prev.filter((id) => id !== row.propertyId)
                  )
                }
                onFinalistChanged={(isFinalist) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.propertyId === row.propertyId ? { ...r, isFinalist } : r
                    )
                  )
                }
                ctxParams={ctxParams ?? ""}
              />
            ))}
          </ul>
        )}

        {visible.length > 0 && (
          <section aria-label="Map of your houses" className="mt-3">
            {unplaced > 0 && pins.length > 0 && (
              <p
                data-testid="map-unplaced"
                className="text-(length:--type-body-sm-size) leading-(--type-body-sm-leading) text-(--color-text-secondary) mb-2"
              >
                {`${unplaced === 1 ? "1 house isn't" : `${unplaced} houses aren't`} on the map yet. We place a house when it's added or its address changes.`}
              </p>
            )}
            {/* `isolate` keeps Leaflet's own z-indexes (up to 1000) inside the
                map. Without it its controls paint over the bottom bar — the
                same trap as the house page's sheet. */}
            <div
              data-testid="screen-map"
              className="relative isolate h-[42dvh] min-h-[280px] lg:h-[50dvh] overflow-hidden rounded-(--radius-lg) border border-(--color-border-default)"
            >
              <HouseMap
                pins={pins}
                selectedId={selected}
                onSelect={selectFromMap}
                tilesKey={mapTilesKey}
              />
              {pins.length === 0 && (
                <p
                  data-testid="map-empty"
                  // At the bottom, clear of the zoom buttons it used to cover
                  // and above the map credit.
                  className="absolute inset-x-4 bottom-8 z-[1000] rounded-(--radius-md) bg-(--color-overlay) px-3 py-2.5 text-(length:--type-body-sm-size) leading-(--type-body-sm-leading) text-(--color-text-primary)"
                >
                  We don&apos;t know where these houses are yet. We place a house when
                  it&apos;s added or its address changes.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/**
 * One house. Hoisted to module scope — a component declared during render is a
 * new type every pass and remounts the whole list.
 *
 * The photo card from plans/properties-design-change.md: photo, both verdicts
 * on its fade, asking price, address, the spec line and the reason. The
 * eight-figure grid left the card on purpose — the figures live on the house
 * page and on Compare, where they are explained.
 */
function ScreenCard({
  row,
  selected,
  cardRef,
  picked,
  onPick,
  onFinalistChanged,
  ctxParams,
}: {
  row: ScreenRow;
  /** The house the map is pointing at. */
  selected: boolean;
  cardRef: (card: HTMLLIElement | null) => void;
  picked: boolean;
  onPick: (on: boolean) => void;
  onFinalistChanged: (isFinalist: boolean) => void;
  ctxParams: string;
}) {
  const [busy, setBusy] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);

  async function toggleFinalist() {
    if (busy) return;
    setBusy(true);
    setFlagError(null);
    try {
      const res = await fetch(`/api/properties/${row.propertyId}?${ctxParams}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_finalist: !row.isFinalist, context_type: "personal" }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Could not change that");
      }
      onFinalistChanged(!row.isFinalist);
    } catch (e) {
      setFlagError(e instanceof Error ? e.message : "Could not change that");
    } finally {
      setBusy(false);
    }
  }

  // Always the property id. It used to be the pipeline entry id, falling back
  // to "/properties" — the page you are already on — when the house had no
  // entry. Since neither the calculator save nor a batch paste creates an
  // entry, that was every house: the row looked like a link and did nothing.
  const href = `/properties/${row.propertyId}`;

  const stepsDone = FLOW_STEPS.filter((step) => step.done(row)).length;
  // The count is a way in, not just a score: it opens the first step still
  // to do, or the deal once everything is.
  const nextStep = FLOW_STEPS.find((step) => !step.done(row)) ?? FLOW_STEPS[FLOW_STEPS.length - 1];
  const specs = specLine(row);

  return (
    // `relative` is what the stretched link below anchors to. No
    // overflow-hidden here: the photo clips its own corners, so nothing on
    // the card can be cut off by the card.
    <li
      ref={cardRef}
      data-testid={`screen-row-${row.propertyId}`}
      data-selected={selected ? "yes" : "no"}
      className={`relative flex flex-col shrink-0 snap-center w-[280px] lg:w-[340px] rounded-(--radius-lg) border bg-(--color-surface) transition-colors ${
        selected
          ? "border-(--color-accent)"
          : "border-(--color-border-default) hover:border-(--color-border-strong)"
      }`}
    >
      <CardHero photoUrl={row.photoUrl} propertyId={row.propertyId}>
        {/* Both verdicts, because they disagree often enough that hiding one
            misleads. They sit on the fade, where the photo has already
            turned into card colour — a tint over a photograph cannot be
            read. Each one opens what it means for this house. */}
        <div className="absolute left-4 bottom-2 right-14 flex flex-wrap gap-1.5">
          <VerdictTag
            label={AFFORDABILITY_LABEL[row.affordability.verdict]}
            toneClassName={AFFORDABILITY_STYLE[row.affordability.verdict]}
            explanation={row.explanations.afford}
            breakdownHref={`${href}?step=deal`}
            testId={`verdict-afford-${row.propertyId}`}
          />
          <VerdictTag
            label={row.deal.hasArv ? DEAL_LABEL[row.deal.verdict] : NO_RESALE_PRICE_LABEL}
            toneClassName={DEAL_STYLE[row.deal.verdict]}
            explanation={row.explanations.deal}
            breakdownHref={`${href}?step=deal`}
            testId={`verdict-deal-${row.propertyId}`}
          />
        </div>

        {/* Above the card-wide link overlay, as a sibling of it. */}
        <button
          type="button"
          onClick={() => void toggleFinalist()}
          disabled={busy}
          data-testid={`finalist-${row.propertyId}`}
          aria-pressed={row.isFinalist}
          aria-label={row.isFinalist ? "Remove from finalists" : "Mark as a finalist"}
          className={`absolute top-1 right-1 z-10 size-(--tap-min) inline-flex items-center justify-center rounded-(--radius-pill) bg-(--color-base)/55 transition-colors disabled:opacity-40 ${
            row.isFinalist
              ? "text-(--color-accent)"
              : "text-(--color-text-primary) hover:text-(--color-accent)"
          }`}
        >
          <Star size={18} fill={row.isFinalist ? "currentColor" : "none"} />
        </button>
      </CardHero>

      <div className="px-4 pt-1.5 pb-2 flex flex-col flex-1">
        {/* The house's own asking price. Not `row.price`, which falls back to
            the calculator's $350,000 default — that default once read as a
            fact about every new house. */}
        {row.listPrice === null ? (
          <p
            data-testid={`screen-price-${row.propertyId}`}
            className="text-(length:--type-body-size) leading-(--type-figure-leading) text-(--color-text-secondary)"
          >
            {NO_LISTING_PRICE_LABEL}
          </p>
        ) : (
          <p
            data-testid={`screen-price-${row.propertyId}`}
            className="font-(--font-display) font-bold text-(length:--type-figure-size) leading-(--type-figure-leading) text-(--color-text-primary)"
          >
            {dollars(row.listPrice)}
          </p>
        )}

        {/* The whole card is still the target — at 390px a line of text is a
            thin thing to hit — but it is reached with an overlay rather than
            by wrapping the card. The listing link used to be a descendant of
            this one, which is invalid HTML and threw a hydration error. */}
        <Link
          href={href}
          data-testid={`screen-open-${row.propertyId}`}
          title={row.address}
          // One line in the row; the full address is on the house page.
          className="mt-0.5 truncate text-(length:--type-body-size) leading-(--type-body-leading) font-semibold text-(--color-text-primary) after:absolute after:inset-0 after:rounded-(--radius-lg) after:content-['']"
        >
          {row.address}
        </Link>

        {specs.length > 0 && (
          <p
            data-testid={`screen-specs-${row.propertyId}`}
            className="text-(length:--type-label-size) leading-(--type-label-leading) text-(--color-text-secondary) mt-0.5"
          >
            {specs.map((label, i) => (
              <span key={label}>
                {i > 0 && (
                  <span aria-hidden="true" className="text-(--color-text-tertiary)">
                    {" · "}
                  </span>
                )}
                {label}
              </span>
            ))}
          </p>
        )}

        {row.needsAddressReview && (
          <p
            data-testid={`screen-review-${row.propertyId}`}
            className="flex gap-1 text-(length:--type-body-sm-size) text-(--color-warning) mt-1"
          >
            <AlertTriangle size={12} className="shrink-0 mt-[3px]" />
            <span>Address needs a check</span>
          </p>
        )}

        {/* Why, not just what. A bare verdict on a screen of fifteen houses is
            not actionable. */}
        <p
          data-testid={`verdict-reason-${row.propertyId}`}
          // Two lines, so one long reason cannot push the map down.
          className="line-clamp-2 text-(length:--type-body-size) leading-(--type-body-leading) text-(--color-text-secondary) mt-2"
        >
          {row.affordability.summary}
          {row.deal.hasArv ? ` · ${row.deal.summary}` : ""}
        </p>

        {/* "Checked or not", in plain words. This was an "ARV" / "Review
            comps" tag, and the design system keeps both words out of the
            interface. A checked price says nothing here: the verdict already
            rests on it. */}
        {row.arv === null && (
          <Link
            href={`${href}?tab=arv`}
            data-testid={`resale-unchecked-${row.propertyId}`}
            className="relative z-10 self-start min-h-(--tap-min) inline-flex items-center text-(length:--type-body-sm-size) text-(--color-accent)"
          >
            Resale price not checked yet →
          </Link>
        )}

        {flagError && (
          <p className="text-(length:--type-body-sm-size) text-(--color-danger) mt-1">{flagError}</p>
        )}

        <div className="mt-auto pt-1 flex items-center gap-1 border-t border-(--color-border-default)">
          {/* A real checkbox inside the pill, so it is still a checkbox to a
              screen reader and to the tests. */}
          <label
            className="relative z-10 min-h-(--tap-min) inline-flex items-center cursor-pointer"
            title="Pick for comparison"
          >
            <span
              className={`h-(--control-pill) px-3 inline-flex items-center gap-1.5 rounded-(--radius-pill) border text-(length:--type-body-sm-size) ${
                picked
                  ? "border-(--color-accent) text-(--color-accent)"
                  : "border-(--color-border-strong) text-(--color-text-secondary)"
              }`}
            >
              <input
                type="checkbox"
                checked={picked}
                onChange={(e) => onPick(e.target.checked)}
                data-testid={`compare-pick-${row.propertyId}`}
                aria-label={`Compare ${row.address}`}
                className="accent-(--color-accent)"
              />
              Compare
            </span>
          </label>

          <Link
            href={`${href}?tab=${nextStep.tab}`}
            data-testid={`checklist-${row.propertyId}`}
            data-done={stepsDone}
            className="relative z-10 min-h-(--tap-min) inline-flex items-center px-2 text-(length:--type-body-sm-size) text-(--color-accent)"
          >
            {stepsDone} of {FLOW_STEPS.length} steps
          </Link>

          <span className="flex-1" />

          {row.listingUrl && (
            <a
              href={row.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`screen-listing-${row.propertyId}`}
              // A sibling of the card link, lifted above its overlay. No
              // stopPropagation: nothing is nested, so nothing bubbles.
              aria-label="Open the listing"
              // Icon only: a 280px card has no room for the word. The icon
              // means "leaves the app" and nothing else, per the design system.
              className="relative z-10 size-(--tap-min) inline-flex items-center justify-center text-(--color-text-secondary) hover:text-(--color-accent) transition-colors"
            >
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The top of the card: the photo, or a short band when there is none.
 *
 * The band is the common case, not a fallback — photos are pasted by hand and
 * most houses have none. A full-height grey box for each of them would make
 * the list mostly holes.
 */
function CardHero({
  photoUrl,
  propertyId,
  children,
}: {
  photoUrl: string | null;
  propertyId: string;
  children: ReactNode;
}) {
  // A pasted link points at somebody else's site and can die. A dead one shows
  // the band, not a broken-image icon.
  const [failed, setFailed] = useState(false);
  const showPhoto = photoUrl !== null && !failed;

  if (!showPhoto) {
    return (
      <div
        data-testid={`screen-nophoto-${propertyId}`}
        className="relative h-20 rounded-t-(--radius-lg) bg-(--color-elevated)"
      >
        <Home
          size={24}
          aria-hidden="true"
          className="absolute left-1/2 top-3 -translate-x-1/2 text-(--color-text-tertiary)"
        />
        {children}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="h-[130px] lg:h-[170px] overflow-hidden rounded-t-(--radius-lg)">
        {/* eslint-disable-next-line @next/next/no-img-element -- a pasted link
            to any host, which next/image would need allow-listing for */}
        <img
          src={photoUrl}
          alt=""
          data-testid={`screen-photo-${propertyId}`}
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-transparent from-45% to-(--color-surface)"
        />
      </div>
      {children}
    </div>
  );
}
