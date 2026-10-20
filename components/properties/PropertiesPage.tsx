"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home, AlertTriangle, ExternalLink, Star } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Skeleton, SkeletonList, SkeletonRegion } from "@/components/ui/Skeleton";
import { VerdictTag } from "@/components/mortgage/VerdictTag";
import { useCrmContext } from "@/components/crm/useCrmContext";
import { dollars } from "@/components/mortgage/format";
import {
  AFFORDABILITY_LABEL,
  DEAL_LABEL,
  type AffordabilityVerdict,
  type DealVerdict,
} from "@/lib/mortgage/verdicts";
import { type ScreenRow } from "@/lib/screen/screenRow";

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

const AFFORDABILITY_STYLE: Record<AffordabilityVerdict, string> = {
  qualifies: "bg-(--color-accent-glow) text-(--color-accent)",
  tight: "bg-amber-500/10 text-amber-400",
  does_not_qualify: "bg-red-500/10 text-red-400",
};

const DEAL_STYLE: Record<DealVerdict, string> = {
  works: "bg-(--color-accent-glow) text-(--color-accent)",
  thin: "bg-amber-500/10 text-amber-400",
  does_not_work: "bg-red-500/10 text-red-400",
};

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

export function PropertiesPage() {
  const router = useRouter();
  const { ctxParams } = useCrmContext();
  const [rows, setRows] = useState<ScreenRow[]>([]);
  const [filter, setFilter] = useState<"all" | "finalists">("all");
  /** Houses ticked for comparison, in the order they were picked. */
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={null}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings/account")}
    >
      <div className="overflow-y-auto flex-1 w-full px-5 py-4 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold text-(--color-text-primary)">Properties</h1>
        <p className="text-[12px] text-(--color-text-secondary) mt-1 mb-4 leading-relaxed">
          Every house you&apos;ve looked at, with the two questions that matter:
          can you afford it, and does the deal work.
        </p>

        {loading && (
          <SkeletonRegion label="Loading your houses" testId="screen-loading">
            <SkeletonList count={3} gap="gap-2">
              {() => (
                <div className="rounded-xl border border-(--color-border-default) bg-(--color-elevated) p-3">
                  {/* Address over two lines, with the compare and finalist
                      controls to its right. */}
                  {/* Bars match the line-height of the text they stand in for,
                      not its font size, or the card loads 50px taller than it
                      waited at. */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 grid gap-1.5">
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-4 w-1/3" />
                    </div>
                    <Skeleton className="h-5 w-20 shrink-0 rounded" />
                  </div>

                  {/* The verdict pills, the reason line, then the headline. */}
                  <div className="flex gap-1.5 mt-2">
                    <Skeleton className="h-5 w-20 rounded" />
                    <Skeleton className="h-5 w-16 rounded" />
                  </div>
                  <Skeleton className="h-3 w-full mt-2" />
                  <Skeleton className="h-4 w-3/4 mt-2" />

                  {/* The eight figures, three to a row. This is most of the
                      card's height — without it the list jumped when it
                      loaded, which is the thing skeletons are for. */}
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mt-2.5">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="grid gap-1">
                        <Skeleton className="h-2.5 w-3/4" />
                        <Skeleton className="h-3.5 w-full" />
                      </div>
                    ))}
                  </div>

                  {/* The four progress chips. */}
                  <div className="flex gap-1.5 mt-2.5">
                    <Skeleton className="h-5 w-14 rounded" />
                    <Skeleton className="h-5 w-11 rounded" />
                    <Skeleton className="h-5 w-16 rounded" />
                    <Skeleton className="h-5 w-11 rounded" />
                  </div>
                </div>
              )}
            </SkeletonList>
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

        {!loading && !error && rows.length === 0 && (
          <div data-testid="screen-empty" className="text-center py-12">
            <Home size={28} className="mx-auto text-(--color-text-tertiary) mb-3" />
            <p className="text-[13px] text-(--color-text-secondary)">No houses yet.</p>
            <Link
              href="/properties/new"
              className="inline-block mt-3 text-[13px] text-(--color-accent) font-medium"
            >
              Add some addresses →
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
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            {(["all", "finalists"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                data-testid={`filter-${f}`}
                aria-pressed={filter === f}
                className={`h-8 px-3 rounded-[var(--radius-pill)] text-[12px] transition-colors ${
                  filter === f
                    ? "bg-(--color-accent) text-(--color-base) font-semibold"
                    : "border border-(--color-border-default) text-(--color-text-secondary)"
                }`}
              >
                {f === "all" ? "All" : "Finalists"}
                {f === "finalists" && finalistCount > 0 ? ` (${finalistCount})` : ""}
              </button>
            ))}

            <div className="flex-1" />

            {/* Two routes to the same place: tick houses, or compare the ones
                already marked as finalists. */}
            {picked.length >= 2 ? (
              <Link
                href={`/compare?ids=${picked.slice(0, 4).join(",")}`}
                data-testid="compare-picked"
                className="h-8 px-3 inline-flex items-center rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[12px] font-semibold"
              >
                Compare {Math.min(picked.length, 4)}
              </Link>
            ) : finalistCount >= 2 ? (
              <Link
                href={`/compare?ids=${rows
                  .filter((r) => r.isFinalist)
                  .slice(0, 4)
                  .map((r) => r.propertyId)
                  .join(",")}`}
                data-testid="compare-finalists"
                className="h-8 px-3 inline-flex items-center rounded-[var(--radius-pill)] border border-(--color-accent) text-(--color-accent) text-[12px]"
              >
                Compare finalists
              </Link>
            ) : null}
          </div>
        )}

        {rows.length > 0 && (
          <ul data-testid="screen-table" className="flex flex-col gap-2.5">
            {visible.map((row) => (
              <ScreenCard
                key={row.propertyId}
                row={row}
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
      </div>
    </AppShell>
  );
}

/**
 * One house. Hoisted to module scope — a component declared during render is a
 * new type every pass and remounts the whole list.
 */
function ScreenCard({
  row,
  picked,
  onPick,
  onFinalistChanged,
  ctxParams,
}: {
  row: ScreenRow;
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

  return (
    // `relative` is what the stretched link below anchors to.
    <li
      data-testid={`screen-row-${row.propertyId}`}
      className="relative rounded-xl border border-(--color-border-default) bg-(--color-elevated) p-3 transition-colors hover:border-(--color-border-strong)"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* The whole card is still the target — at 390px a line of text is a
              thin thing to hit — but it is reached with an overlay rather than
              by wrapping the card. The listing link used to be a descendant of
              this one, which is invalid HTML and threw a hydration error. */}
          <span className="flex gap-2.5 items-start">
            {row.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.photoUrl}
                alt=""
                data-testid={`screen-photo-${row.propertyId}`}
                className="w-12 h-12 rounded-md object-cover shrink-0 border border-(--color-border-subtle)"
              />
            )}
            <Link
              href={href}
              data-testid={`screen-open-${row.propertyId}`}
              className="text-[13px] font-medium leading-snug wrap-break-word text-(--color-text-primary) after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {row.address}
            </Link>
          </span>
        </div>

        {/* Both sit above the card-wide link overlay, as siblings of it. */}
        <div className="relative z-10 flex items-center gap-2 shrink-0">
          <label
            className="flex items-center gap-1 cursor-pointer"
            title="Pick for comparison"
          >
            <input
              type="checkbox"
              checked={picked}
              onChange={(e) => onPick(e.target.checked)}
              data-testid={`compare-pick-${row.propertyId}`}
              aria-label={`Compare ${row.address}`}
              className="accent-(--color-accent)"
            />
            <span className="text-[10px] text-(--color-text-tertiary)">Compare</span>
          </label>

          <button
            type="button"
            onClick={() => void toggleFinalist()}
            disabled={busy}
            data-testid={`finalist-${row.propertyId}`}
            aria-pressed={row.isFinalist}
            aria-label={row.isFinalist ? "Remove from finalists" : "Mark as a finalist"}
            className={`p-1 transition-colors disabled:opacity-40 ${
              row.isFinalist
                ? "text-(--color-accent)"
                : "text-(--color-text-tertiary) hover:text-(--color-accent)"
            }`}
          >
            <Star size={14} fill={row.isFinalist ? "currentColor" : "none"} />
          </button>
        </div>

        {row.listingUrl && (
          <a
            href={row.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the listing"
            data-testid={`screen-listing-${row.propertyId}`}
            // A sibling of the card link now, lifted above its overlay. No
            // stopPropagation: nothing is nested, so nothing bubbles.
            className="relative z-10 shrink-0 text-(--color-text-tertiary) hover:text-(--color-accent) transition-colors"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      {flagError && (
        <p className="text-[10px] text-(--color-danger) mt-1">{flagError}</p>
      )}

      {row.needsAddressReview && (
        <p
          data-testid={`screen-review-${row.propertyId}`}
          className="flex gap-1 text-[10px] text-amber-400 mt-1"
        >
          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
          <span>Address needs a check</span>
        </p>
      )}

      {/* The two verdicts, first, because they are the reason to look. Each
          one opens what it means for this house. */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        <VerdictTag
          label={AFFORDABILITY_LABEL[row.affordability.verdict]}
          toneClassName={AFFORDABILITY_STYLE[row.affordability.verdict]}
          explanation={row.explanations.afford}
          breakdownHref={`${href}?step=deal`}
          testId={`verdict-afford-${row.propertyId}`}
        />

        <VerdictTag
          label={row.deal.hasArv ? DEAL_LABEL[row.deal.verdict] : "No ARV"}
          toneClassName={DEAL_STYLE[row.deal.verdict]}
          explanation={row.explanations.deal}
          breakdownHref={`${href}?step=deal`}
          testId={`verdict-deal-${row.propertyId}`}
        />

        {/* What the comps actually say, from the same calculation the ARV
            tab runs. This used to read "ARV not checked" on every house whose
            comps had never been hand-edited — including houses showing an ARV
            right beside it — because review state was guessed at rather than
            recorded. */}
        <VerdictTag
          label={
            row.arv === null
              ? "Review comps"
              : `ARV ${dollars(row.arv)} · ${row.approvedComps} approved`
          }
          toneClassName={
            row.arv === null
              ? "bg-(--color-base) text-(--color-text-tertiary)"
              : "bg-(--color-accent-glow) text-(--color-accent)"
          }
          explanation={{
            whatsWrong:
              row.arv === null
                ? `No comps approved yet${row.compsToReview > 0 ? `, and ${row.compsToReview} are waiting` : ""}.`
                : `Built from ${row.approvedComps} comp${row.approvedComps === 1 ? "" : "s"} you approved.`,
            target:
              row.compsToReview > 0
                ? `${row.compsToReview} comp${row.compsToReview === 1 ? "" : "s"} still to review.`
                : "Every comp has been reviewed.",
            fix:
              row.arv === null
                ? "Open the ARV tab and mark the comps you would use."
                : undefined,
          }}
          breakdownHref={`${href}?tab=arv`}
          action={{ label: "Review the comps →", href: `${href}?tab=arv` }}
          testId={`verdict-arv-${row.propertyId}`}
        />
      </div>

      {/* Why, not just what. A bare verdict on a screen of fifteen houses is
          not actionable. */}
      <p
        data-testid={`verdict-reason-${row.propertyId}`}
        className="text-[11px] text-(--color-text-secondary) mt-1.5 leading-relaxed"
      >
        {row.affordability.summary}
        {row.deal.hasArv ? ` · ${row.deal.summary}` : ""}
      </p>

      {/* Walk-away is what lands in the account; true profit is what the deal
          made. Both, because either alone misleads. */}
      <p
        data-testid={`deal-headline-${row.propertyId}`}
        className="text-[12px] mt-1.5 font-(--font-mono)"
      >
        {row.walkAwayCash === null || row.trueProfit === null ? (
          <span className="text-(--color-text-tertiary)">
            Walk-away — · True profit — <span className="font-sans">(no ARV yet)</span>
          </span>
        ) : (
          <>
            <span className="text-(--color-accent)">Walk-away {dollars(row.walkAwayCash)}</span>
            <span className="text-(--color-text-tertiary)"> · </span>
            <span
              className={
                row.trueProfit < 0 ? "text-(--color-danger)" : "text-(--color-text-primary)"
              }
            >
              True profit {dollars(row.trueProfit)}
            </span>
          </>
        )}
      </p>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 mt-2.5 text-[11px]">
        <Figure label="Price" value={dollars(row.price)} />
        <Figure label="PITI" value={`${dollars(row.piti)}/mo`} />
        <Figure
          label="Back DTI"
          value={row.backDti === null ? "—" : `${row.backDti.toFixed(0)}%`}
        />
        <Figure label="Cash to close" value={dollars(row.cashToClose)} />
        <Figure label="ARV" value={row.arv === null ? "—" : dollars(row.arv)} />
        <Figure label="Max offer" value={row.arv === null ? "—" : dollars(row.maxOffer)} />
        <Figure
          label="Walk-away"
          value={row.walkAwayCash === null ? "—" : dollars(row.walkAwayCash)}
        />
        <Figure
          label="True profit"
          value={row.trueProfit === null ? "—" : dollars(row.trueProfit)}
        />
      </dl>

      {/* Progress: Numbers · Comps · Estimate · Visit, all derived. */}
      <div
        data-testid={`checklist-${row.propertyId}`}
        className="flex items-center gap-1.5 mt-2.5 flex-wrap"
      >
        {FLOW_STEPS.map((step) => {
          const done = step.done(row);
          const label = step.label;
          return (
            // A link, not a label. These name the four things to do on a
            // house, so each one opens that house on the tab that does it.
            <Link
              key={step.label}
              href={`${href}?tab=${step.tab}`}
              data-testid={`checklist-${step.label.toLowerCase()}-${row.propertyId}`}
              data-done={done ? "yes" : "no"}
              className={`min-h-11 inline-flex items-center text-[10px] px-2 rounded border ${
                done
                  ? "border-(--color-accent) text-(--color-accent)"
                  : "border-(--color-border-default) text-(--color-text-tertiary)"
              }`}
            >
              {label}
            </Link>
          );
        })}
        <span className="text-[10px] text-(--color-text-tertiary)">
          {FLOW_STEPS.filter((s2) => s2.done(row)).length}/4
        </span>
      </div>
    </li>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-(--color-text-tertiary)">{label}</dt>
      <dd className="text-(--color-text-primary)">{value}</dd>
    </div>
  );
}
