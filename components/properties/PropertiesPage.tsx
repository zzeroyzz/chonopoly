"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home, AlertTriangle, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
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

const CHECKLIST_STEPS = ["Numbers", "Comps", "Estimate", "Visit"] as const;

export function PropertiesPage() {
  const router = useRouter();
  const { ctxParams } = useCrmContext();
  const [rows, setRows] = useState<ScreenRow[]>([]);
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

        {loading && <p className="text-[13px] text-(--color-text-secondary)">Loading…</p>}

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

        {rows.length > 0 && (
          <ul data-testid="screen-table" className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <ScreenCard key={row.propertyId} row={row} />
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
function ScreenCard({ row }: { row: ScreenRow }) {
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
          <Link
            href={href}
            data-testid={`screen-open-${row.propertyId}`}
            className="text-[13px] font-medium leading-snug wrap-break-word text-(--color-text-primary) after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {row.address}
          </Link>
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

      {row.needsAddressReview && (
        <p
          data-testid={`screen-review-${row.propertyId}`}
          className="flex gap-1 text-[10px] text-amber-400 mt-1"
        >
          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
          <span>Address needs a check</span>
        </p>
      )}

      {/* The two verdicts, first, because they are the reason to look. */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span
          data-testid={`verdict-afford-${row.propertyId}`}
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
            AFFORDABILITY_STYLE[row.affordability.verdict]
          }`}
        >
          {row.affordability.needsProfile
            ? "Set your income"
            : AFFORDABILITY_LABEL[row.affordability.verdict]}
        </span>

        <span
          data-testid={`verdict-deal-${row.propertyId}`}
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
            DEAL_STYLE[row.deal.verdict]
          }`}
        >
          {row.deal.hasArv ? DEAL_LABEL[row.deal.verdict] : "No ARV"}
        </span>

        {row.provisionalArv && (
          <span
            data-testid={`verdict-provisional-${row.propertyId}`}
            title="Built on every comp RentCast returned — review them on the Comps tab"
            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-(--color-base) text-(--color-text-tertiary)"
          >
            Unreviewed
          </span>
        )}
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

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 mt-2.5 text-[11px]">
        <Figure label="Price" value={dollars(row.price)} />
        <Figure label="PITI" value={`${dollars(row.piti)}/mo`} />
        <Figure
          label="Back DTI"
          value={row.backDti === null ? "n/a" : `${row.backDti.toFixed(0)}%`}
        />
        <Figure label="Cash to close" value={dollars(row.cashToClose)} />
        <Figure label="ARV" value={row.arv === null ? "—" : dollars(row.arv)} />
        <Figure label="Max offer" value={row.arv === null ? "—" : dollars(row.maxOffer)} />
      </dl>

      {/* Progress: Numbers · Comps · Estimate · Visit, all derived. */}
      <div
        data-testid={`checklist-${row.propertyId}`}
        className="flex items-center gap-1.5 mt-2.5 flex-wrap"
      >
        {CHECKLIST_STEPS.map((step) => {
          const key = step.toLowerCase() as "numbers" | "comps" | "estimate" | "visit";
          const done = row.checklist[key];
          return (
            <span
              key={step}
              data-testid={`checklist-${key}-${row.propertyId}`}
              data-done={done ? "yes" : "no"}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                done
                  ? "border-(--color-accent) text-(--color-accent)"
                  : "border-(--color-border-default) text-(--color-text-tertiary)"
              }`}
            >
              {step}
            </span>
          );
        })}
        <span className="text-[10px] text-(--color-text-tertiary)">
          {row.checklist.done}/4
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
