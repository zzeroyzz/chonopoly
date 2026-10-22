"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  CalendarDays,
  Check,
  ExternalLink,
  Home,
  Pencil,
  Ruler,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import {
  VerdictTag,
  AFFORDABILITY_STYLE,
  DEAL_STYLE,
  UNJUDGED_STYLE,
} from "@/components/mortgage/VerdictTag";
import { type ScenarioSummary } from "@/lib/mortgage/scenarioService";
import { dollars } from "@/components/mortgage/format";
import { type ScreenRow } from "@/lib/screen/screenRow";
import {
  AFFORDABILITY_LABEL,
  DEAL_LABEL,
  NO_RESALE_PRICE_LABEL,
} from "@/lib/mortgage/verdicts";
import { STAGE_LABEL, daysInStage } from "@/lib/crm/stages";
import { cadenceDueDate } from "@/lib/crm/cadence";
import { type ActivityType, type PropertyDetail, type Stage } from "@/lib/crm/types";
import { StageMenu } from "./StageMenu";
import { ContactCard } from "./ContactCard";
import { CompsPanel } from "./CompsPanel";
import { NumbersModal } from "@/components/mortgage/NumbersModal";
import { ScenarioRows } from "./ScenarioRows";
import { RehabPanel } from "./RehabPanel";
import { OfferPanel } from "./OfferPanel";
import { resolveRehab } from "@/lib/rehab/resolveRehab";
import { Star } from "lucide-react";
import { type BuyerProfile } from "@/lib/profile/types";
import { DealPanel } from "./DealPanel";
import { EditHouseForm, type EditableHouse } from "./EditHouseForm";
import { searchUrls } from "./CompLinks";
import { propertyTypeLabel } from "@/lib/property/types";
import { useCrmContext, useShellProfile } from "./useCrmContext";

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  call: "Call",
  text: "Text",
  email: "Email",
  note: "Note",
  door_knock: "Door knock",
  mail: "Mail",
  web_form: "Web form",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * One property, everything on it.
 *
 * Stacked on mobile in the order the work happens: what it is, who to call,
 * what's due, what's been done. Desktop widens the same stack rather than
 * rearranging it — two layouts for one screen is a cost this phase declined to
 * pay on the pipeline, and the same reasoning holds here.
 */
/**
 * The five tabs, in the order you work them.
 *
 * Overview answers "what is this"; Numbers answers "does it work"; Comps and
 * Rehab are filled by later phases; Activity is the CRM record that already
 * exists. Comps and Rehab are present and empty rather than hidden, so the
 * shape of the page does not change under you when they arrive.
 */
/**
 * The tabs are the flow, in order: what the house is, what it is worth, what
 * the loan looks like, what the deal makes. Rehab and Activity come after
 * because they refine a deal rather than decide one.
 */
const TABS = ["Details", "ARV", "Numbers", "Deal", "Rehab", "Activity"] as const;

/** The four steps of the flow, each pointing at the tab that does it. */
const STEPS = [
  { id: "details", label: "Details", tab: "Details" },
  { id: "arv", label: "ARV", tab: "ARV" },
  { id: "numbers", label: "Run the numbers", tab: "Numbers" },
  { id: "deal", label: "Deal", tab: "Deal" },
] as const satisfies readonly { id: string; label: string; tab: (typeof TABS)[number] }[];
type Tab = (typeof TABS)[number];

export function PropertyDetailPage({ entryId }: { entryId: string }) {
  const [tab, setTab] = useState<Tab>("Details");
  const [analyses, setAnalyses] = useState<ScenarioSummary[]>([]);
  // The scenario rows cost every scenario themselves, so they need the same
  // profile and ARV the Profit card uses.
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile | null>(null);
  const [arv, setArv] = useState<number | null>(null);
  /** This house's screen row — the same figures the Properties card shows. */
  const [row, setRow] = useState<ScreenRow | null>(null);
  /**
   * Whether the two follow-up reads have settled.
   *
   * Needed because every value the step bar tests is null both before it
   * loads and when the house genuinely has no answer, and these reads cannot
   * even start until the detail fetch hands over a property id. Without this
   * the bar read "nothing is done" on every load and offered "Next: ARV" for
   * a moment on houses that were already past it.
   */
  const [screenLoaded, setScreenLoaded] = useState(false);
  /** Bumped to remount the Profit card when the primary moves. */
  const [dealKey, setDealKey] = useState(0);
  /** Carried into Run the numbers when re-running at the estimate. */
  const [rerunBudget, setRerunBudget] = useState<number | null>(null);

  // Mirrors the property's flag. Held locally so the star responds at once
  // rather than after a full detail reload.
  const [isFinalist, setIsFinalist] = useState(false);
  const [finalistBusy, setFinalistBusy] = useState(false);
  const router = useRouter();
  const profile = useShellProfile();
  const { ctx, ctxParams } = useCrmContext();

  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editingHouse, setEditingHouse] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState<ActivityType>("call");

  const load = useCallback(async () => {
    if (!ctxParams) return;
    try {
      // Resolves a property id first and an entry id second, so the Properties
      // list and old /crm/<entryId> links both land here.
      const res = await fetch(`/api/properties/${entryId}?${ctxParams}&detail=1`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      const data = await res.json();
      setError(null);
      setDetail(data.detail as PropertyDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the property");
    } finally {
      setLoading(false);
    }
  }, [ctxParams, entryId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function post(url: string, payload: Record<string, unknown>) {
    if (!ctx) return false;
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, context_type: ctx.type, context_id: ctx.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const property = detail?.property;

  // This house's financing analyses. Fetched once the property is known, since
  // the Numbers tab is scoped to it. A useCallback rather than a bare effect so
  // saving from the modal can re-run exactly this read.
  const propertyId = property?.id ?? null;

  // The reno budget the loan was sized on — what the estimate is checked
  // against, and what the loan can actually cover.
  // The primary's own inputs, for the offer panel's what-if.
  const primaryInputsForOffer =
    analyses.find((a) => a.isPrimary)?.inputs ?? analyses[0]?.inputs ?? null;

  const primaryBudget =
    analyses.find((a) => a.isPrimary)?.inputs.renovationBudget ??
    analyses[0]?.inputs.renovationBudget ??
    0;

  const loadAnalyses = useCallback(async () => {
    if (!propertyId || !ctxParams) return;
    try {
      const res = await fetch(`/api/mortgage/scenarios?${ctxParams}&property_id=${propertyId}`);
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as { scenarios: ScenarioSummary[] };
      setAnalyses(body.scenarios);
    } catch {
      // An empty Numbers tab is a worse answer than the rest of the page not
      // rendering, so this fails quietly.
      setAnalyses([]);
    } finally {
      // Settled either way. The step bar needs to know the difference between
      // "no analyses" and "not asked yet".
    }
  }, [propertyId, ctxParams]);

  useEffect(() => {
    (async () => {
      await loadAnalyses();
    })();
  }, [loadAnalyses]);

  useEffect(() => {
    if (!propertyId || !ctxParams) return;
    let cancelled = false;
    (async () => {
      const [profileRes, compsRes, screenRes] = await Promise.all([
        fetch("/api/profile/buyer").catch(() => null),
        fetch(`/api/properties/${propertyId}/comps?${ctxParams}`).catch(() => null),
        // The same row the Properties card is drawn from, so the header and
        // the card cannot disagree about what this house makes.
        fetch(`/api/properties/screen?${ctxParams}`).catch(() => null),
      ]);
      if (cancelled) return;
      if (profileRes?.ok) {
        const body = (await profileRes.json()) as { profile: BuyerProfile | null };
        setBuyerProfile(body.profile);
      }
      if (compsRes?.ok) {
        const body = (await compsRes.json()) as { arv?: { value: number | null } | null };
        setArv(body.arv?.value ?? null);
      }
      if (screenRes?.ok) {
        const body = (await screenRes.json()) as { rows: ScreenRow[] };
        setRow(body.rows.find((r) => r.propertyId === propertyId) ?? null);
      }
      setScreenLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId, ctxParams]);

  // ── Which analysis the modal has open, mirrored in the URL ────────────────
  //
  // `?numbers=new` or `?numbers=<analysisId>`, so a reload comes back to the
  // same house with the same analysis open. History is written directly rather
  // than through the router: this is modal state on a page that is already
  // mounted, and a router.push would re-run the server component underneath it.
  const [numbersTarget, setNumbersTarget] = useState<string | null>(null);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // ?tab= is what the cards link to now, one per tab. ?step= stays
    // understood so older links and + Add keep landing where they meant to.
    const wanted = params.get("tab");
    const direct = TABS.find((t) => t.toLowerCase() === wanted?.toLowerCase());
    const step = params.get("step");
    const match = STEPS.find((s2) => s2.id === step);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (direct) setTab(direct);
    else if (match) setTab(match.tab);

    const read = () => setNumbersTarget(new URLSearchParams(window.location.search).get("numbers"));
    read();
    // Back should close the modal, not leave the page.
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  function openNumbers(target: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("numbers", target);
    window.history.pushState({}, "", url);
    setNumbersTarget(target);
  }

  function closeNumbers() {
    const url = new URL(window.location.href);
    url.searchParams.delete("numbers");
    window.history.pushState({}, "", url);
    setNumbersTarget(null);
  }

  // The column may not exist yet, in which case it reads false.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFinalist(Boolean((property as { is_finalist?: boolean } | undefined)?.is_finalist));
  }, [property]);

  async function toggleFinalist() {
    if (!propertyId || finalistBusy) return;
    setFinalistBusy(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}?${ctxParams}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_finalist: !isFinalist, context_type: "personal" }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Could not change that");
      }
      setIsFinalist((v) => !v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change that");
    } finally {
      setFinalistBusy(false);
    }
  }

  // Each step maps to the tab that does it, so the bar and the tabs can never
  // drift apart.

  // Only once both follow-up reads are in. Before that every test above is
  // false for want of data, not because the work is undone.

  const headline = row
    ? {
        price: row.price,
        walkAway: row.walkAwayCash,
        trueProfit: row.trueProfit,
        affordability: row.affordability.needsProfile
          ? "Set your income"
          : AFFORDABILITY_LABEL[row.affordability.verdict],
        // Was "No ARV": banned jargon, and a verdict that says neither why
        // nor what to do about it.
        deal: row.deal.hasArv ? DEAL_LABEL[row.deal.verdict] : NO_RESALE_PRICE_LABEL,
      }
    : null;

  const openTasks = (detail?.tasks ?? []).filter((t) => t.status === "open");

  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={profile}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings/account")}
    >
      <div className="overflow-y-auto flex-1 w-full px-4 py-4 pb-24 lg:px-8 lg:pb-8 max-w-3xl">
        {/* Back to wherever you came from. Always sending people to the
            pipeline was wrong the moment Properties became home. */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) router.back();
            else router.push("/properties");
          }}
          data-testid="back"
          className="inline-flex items-center gap-1.5 text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors mb-3"
        >
          <ArrowLeft size={13} /> Back
        </button>

        {error && (
          <div className="mb-3 text-[12px] text-(--color-danger) border border-(--color-danger) rounded-[var(--radius-md)] px-3 py-2">
            {error}
          </div>
        )}

        {loading && (
          <SkeletonRegion label="Loading this house" testId="detail-loading">
            {/* Photo and address, then the headline numbers, then the steps —
                the same three bands the loaded page opens with, so nothing
                jumps when it arrives. */}
            <div className="flex gap-3">
              <Skeleton className="w-16 h-16 rounded-lg shrink-0" />
              <div className="min-w-0 flex-1 grid gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <Skeleton className="h-14 rounded-[var(--radius-lg)]" />
              <Skeleton className="h-14 rounded-[var(--radius-lg)]" />
            </div>

            <div className="flex gap-1.5 mt-4 overflow-hidden">
              <Skeleton className="h-7 w-16 rounded-[var(--radius-pill)] shrink-0" />
              <Skeleton className="h-7 w-16 rounded-[var(--radius-pill)] shrink-0" />
              <Skeleton className="h-7 w-16 rounded-[var(--radius-pill)] shrink-0" />
              <Skeleton className="h-7 w-16 rounded-[var(--radius-pill)] shrink-0" />
            </div>

            <Skeleton className="h-40 w-full rounded-[var(--radius-lg)] mt-4" />
          </SkeletonRegion>
        )}

        {detail && (
          <>
            {/* The house, as one card: what it is, what we think, and the
                controls that belong to it.

                It grew to eight bands separated by four rules, so nothing
                grouped and the three uppercase questions shouted over the
                answers they labelled. Three sections now, two rules. */}
            <div className="rounded-(--radius-xl) border border-(--color-border-default) bg-(--color-elevated) overflow-hidden">
              {/* The two things you do to a house sit on its corners, the way
                  the save and share buttons do on a listing card. Both carry
                  their own dark ground so they stay legible over a bright
                  photo as well as over the empty band. */}
              <div className="relative">
                {property?.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={property.photo_url}
                    alt=""
                    data-testid="property-photo"
                    className="w-full h-44 sm:h-56 object-cover"
                  />
                ) : (
                  /* No photo is a fact about the house, not a hole in the page. */
                  <div className="h-16 bg-(--color-surface) border-b border-(--color-border-subtle) flex items-center px-4">
                    <span className="text-[11px] text-(--color-text-secondary)">
                      No photo yet — add one when you edit the house.
                    </span>
                  </div>
                )}

                {property && (
                  <button
                    type="button"
                    onClick={() => void toggleFinalist()}
                    disabled={finalistBusy}
                    data-testid="finalist-toggle"
                    aria-pressed={isFinalist}
                    aria-label={isFinalist ? "Remove from finalists" : "Mark as a finalist"}
                    className={`absolute left-3 top-3 flex items-center gap-1.5 h-9 px-3
                      rounded-(--radius-pill) border backdrop-blur text-[12px] font-medium
                      disabled:opacity-40 transition-colors ${
                        isFinalist
                          ? "bg-(--color-accent) border-transparent text-(--color-base)"
                          : "bg-black/60 border-white/25 text-white"
                      }`}
                  >
                    <Star size={13} fill={isFinalist ? "currentColor" : "none"} />
                    Finalist
                  </button>
                )}

                {property && (
                  <button
                    type="button"
                    onClick={() => setEditingHouse((v) => !v)}
                    data-testid="edit-house-toggle"
                    aria-label={editingHouse ? "Close the house form" : "Edit this house"}
                    className="absolute right-3 top-3 flex items-center gap-1.5 h-9 px-3
                      rounded-(--radius-pill) bg-black/60 border border-white/25 backdrop-blur
                      text-[12px] font-medium text-white transition-colors"
                  >
                    <Pencil size={13} />
                    {editingHouse ? "Close" : "Edit"}
                  </button>
                )}
              </div>

              <div className="p-4 flex flex-col gap-4">
                {/* 1. What it is. */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[26px] font-bold leading-none tracking-tight">
                        {headline ? dollars(headline.price, 0) : "—"}
                      </span>
                      <span className="text-[11px] text-(--color-text-secondary)">asking</span>
                    </div>
                    {property?.address_line1 && (
                      <a
                        href={
                          searchUrls(
                            [property.address_line1, property.city, property.state, property.zip]
                              .filter(Boolean)
                              .join(", ")
                          ).zillow
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="property-zillow"
                        className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-(--radius-pill)
                          border border-(--color-border-strong) text-[12px] font-medium
                          text-(--color-text-primary)"
                      >
                        Zillow
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>

                  <h1 className="text-[19px] font-semibold text-(--color-text-primary) wrap-break-word leading-snug">
                    {property?.address_line1 ?? "Address unknown"}
                  </h1>
                  <p className="text-[12px] text-(--color-text-secondary)">
                    {[property?.city, property?.state, property?.zip].filter(Boolean).join(", ") || "—"}
                  </p>

                  {/* An icon per fact, read left to right. The icons are what
                      makes this scannable at a glance rather than a sentence
                      to be read, which is why they came back. */}
                  {property && (
                    <div className="flex flex-wrap items-center gap-y-2 mt-1 text-[12px] text-(--color-text-primary)">
                      {[
                        [<BedDouble key="b" size={14} />, property.beds === null ? null : `${property.beds} bed`],
                        [<Bath key="t" size={14} />, property.baths === null ? null : `${property.baths} bath`],
                        [<Ruler key="r" size={14} />, property.sqft === null ? null : `${property.sqft.toLocaleString()} sq ft`],
                        [<CalendarDays key="c" size={14} />, property.year_built === null ? null : `${property.year_built}`],
                        [<Home key="h" size={14} />, propertyTypeLabel(property.property_type)],
                      ]
                        .filter(([, label]) => Boolean(label))
                        .map(([icon, label], index) => (
                          <span key={String(label)} className="inline-flex items-center gap-1.5">
                            {index > 0 && (
                              <span
                                className="w-px h-4 bg-(--color-border-default) mx-3"
                                aria-hidden="true"
                              />
                            )}
                            <span className="text-(--color-text-secondary)">{icon}</span>
                            {label}
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                {!screenLoaded && <Skeleton className="h-4 w-40" />}

                {/* 2. What we think.

                    Side by side, each answer under its own question. They were
                    full-width rows with the chip pushed to the far edge, so
                    the eye crossed the card to join a question to its answer
                    and no two chips lined up. */}
                {headline && row && (
                  <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-(--color-border-subtle) pt-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className="text-[12px] text-(--color-text-secondary)">
                        Can we afford it?
                      </span>
                      <VerdictTag
                        label={headline.affordability}
                        size="answer"
                        toneClassName={
                          row.affordability.needsProfile
                            ? UNJUDGED_STYLE
                            : AFFORDABILITY_STYLE[row.affordability.verdict]
                        }
                        explanation={row.explanations.afford}
                        breakdownHref=""
                        action={{ label: "See full breakdown →", onClick: () => setTab("Deal") }}
                        testId="header-verdict-afford"
                      />
                    </div>

                    <div className="flex flex-col items-start gap-1.5">
                      <span className="text-[12px] text-(--color-text-secondary)">
                        Does the deal work?
                      </span>
                      <VerdictTag
                        label={headline.deal}
                        size="answer"
                        toneClassName={
                          row.deal.hasArv ? DEAL_STYLE[row.deal.verdict] : UNJUDGED_STYLE
                        }
                        explanation={row.explanations.deal}
                        breakdownHref=""
                        action={{
                          label: row.deal.hasArv ? "See full breakdown →" : "Check houses nearby →",
                          onClick: () => setTab(row.deal.hasArv ? "Deal" : "ARV"),
                        }}
                        testId="header-verdict-deal"
                      />
                    </div>

                    {/* Only once there is a figure. With none, this said
                        "Check houses nearby" beside "No resale price yet" —
                        the same sentence twice, both linking to the same tab. */}
                    {row.arv !== null && (
                      <div className="flex flex-col items-start gap-1.5">
                        <span className="text-[12px] text-(--color-text-secondary)">
                          Worth fixed up?
                        </span>
                        <VerdictTag
                          label={`${dollars(row.arv)} · from ${row.approvedComps} ${row.approvedComps === 1 ? "house" : "houses"}`}
                          size="answer"
                          toneClassName="bg-(--color-accent-glow) text-(--color-accent)"
                          explanation={{
                            whatsWrong: `Built from ${row.approvedComps} house${row.approvedComps === 1 ? "" : "s"} you approved.`,
                            target:
                              row.compsToReview > 0
                                ? `${row.compsToReview} house${row.compsToReview === 1 ? "" : "s"} still to check.`
                                : "Every house has been checked.",
                          }}
                          breakdownHref=""
                          action={{ label: "Check houses nearby →", onClick: () => setTab("ARV") }}
                          testId="header-verdict-arv"
                        />
                      </div>
                    )}

                    {(headline.walkAway !== null || headline.trueProfit !== null) && (
                      <div className="w-full flex flex-wrap gap-x-6 gap-y-1">
                        {headline.walkAway !== null && (
                          <span className="text-[12px] text-(--color-text-secondary)">
                            Cheque you leave with{" "}
                            <span className="font-semibold text-(--color-accent)">
                              {dollars(headline.walkAway, 0)}
                            </span>
                          </span>
                        )}
                        {headline.trueProfit !== null && (
                          <span className="text-[12px] text-(--color-text-secondary)">
                            What you actually made{" "}
                            <span
                              className={`font-semibold ${
                                headline.trueProfit < 0
                                  ? "text-(--color-danger)"
                                  : "text-(--color-text-primary)"
                              }`}
                            >
                              {dollars(headline.trueProfit, 0)}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Where it is in the pipeline, and the number you need
                    exactly once. Finalist and Edit moved onto the photo's
                    corners, where the things you do to a house belong. */}
                <div className="flex flex-col gap-2 border-t border-(--color-border-subtle) pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {detail.entry ? (
                      <>
                        <div className="relative">
                          <button
                            type="button"
                            data-testid="detail-stage-badge"
                            disabled={busy}
                            onClick={() => setMenuOpen((v) => !v)}
                            className="text-[12px] px-2.5 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong) transition-colors disabled:opacity-50"
                          >
                            {STAGE_LABEL[detail.entry.stage]}
                          </button>
                          {menuOpen && detail.entry && (
                            <StageMenu
                              current={detail.entry.stage}
                              onPick={(s: Stage) =>
                                void post("/api/crm/stage", {
                                  entry_id: detail.entry?.id,
                                  to_stage: s,
                                })
                              }
                              onClose={() => setMenuOpen(false)}
                            />
                          )}
                        </div>
                        {/* Was "3d", which says nothing on its own. */}
                        <span className="text-[11px] text-(--color-text-secondary)">
                          {daysInStage(detail.entry.stage_since)} days in this stage
                        </span>
                      </>
                    ) : (
                      <span
                        data-testid="not-on-pipeline"
                        className="text-[11px] text-(--color-text-tertiary)"
                      >
                        Not on the pipeline — screening only.
                      </span>
                    )}
                  </div>

                  {/* On screen, not behind a disclosure. A parcel number is
                      the one thing here you cannot guess or look up quickly,
                      and it was costing a tap to see. */}
                  {property && (property.parcel_number || property.county) && (
                    <p className="text-[11px] text-(--color-text-secondary)">
                      {[
                        property.parcel_number ? `Parcel ${property.parcel_number}` : null,
                        property.county ? `${property.county} County` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {property && editingHouse && (
              <EditHouseForm
                house={property as unknown as EditableHouse}
                ctx={ctx}
                onSaved={async () => {
                  setEditingHouse(false);
                  await load();
                }}
                onCancel={() => setEditingHouse(false)}
              />
            )}

            {/* The flow, as four steps with a single next action. The tabs
                below can be used in any order; this says which one matters. */}
            {/* The step bar that used to sit here is gone. Two rows of the
                same four destinations, one above the other, is one row too
                many — the tabs below do the job and have two more. */}

            {/* No sideways scroll at any width. At 390px the six labels
                overflowed by 37px and "Activity" was cut to "Act"; tighter
                padding and a smaller label fit them with room to spare, so
                every tab keeps its full name. */}
            <div className="flex border-b border-(--color-border-default) mt-4 mb-4">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  data-testid={`tab-${t.toLowerCase()}`}
                  aria-current={tab === t ? "page" : undefined}
                  className={`flex-1 min-w-0 px-1.5 py-2 text-[12px] sm:text-[13px] sm:px-3 border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    tab === t
                      ? "text-(--color-accent) border-(--color-accent) font-medium"
                      : "text-(--color-text-secondary) border-transparent hover:text-(--color-text-primary)"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "Numbers" && (
              <div data-testid="panel-numbers">
                {/* Everything here opens the modal over this page, bound to
                    this page's property_id. The old copy told the user to
                    "save with this address" — retyping an address already on
                    file, which hashed differently on the second attempt and
                    created a second property row for one house. */}
                {analyses.length === 0 ? (
                  <div>
                    <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">
                      No analyses on this house yet. The save lands on this house.
                    </p>
                    {/* Its own line rather than inline in the sentence: a
                        button is inline-block, so its label cannot break
                        across lines and pushed the paragraph past 390px. */}
                    <button
                      type="button"
                      onClick={() => openNumbers("new")}
                      data-testid="run-numbers"
                      className="inline-flex items-center gap-1 mt-2 text-[12px] text-(--color-accent) font-medium"
                    >
                      <Plus size={12} />
                      Run the numbers
                    </button>
                  </div>
                ) : (
                  <ScenarioRows
                    scenarios={analyses}
                    profile={buyerProfile}
                    arv={arv}
                    state={property?.state ?? null}
                    ctxParams={ctxParams ?? ""}
                    onOpen={openNumbers}
                    onChanged={async () => {
                      await loadAnalyses();
                      setDealKey((k) => k + 1);
                    }}
                  />
                )}

                {/* Reachable with analyses already present too — adding a
                    second scenario should not require leaving the house. */}
                {analyses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openNumbers("new")}
                    data-testid="run-numbers"
                    className="inline-flex items-center gap-1 mt-3 text-[12px] text-(--color-accent) font-medium"
                  >
                    <Plus size={12} />
                    Another scenario for this house
                  </button>
                )}

              </div>
            )}

            {/* The deal is its own step: what the scenarios above actually
                make, and what to offer. The profit card leads, because the
                offer is argued from it. */}
            {tab === "Deal" && property && (
              <div data-testid="panel-deal">
                <DealPanel
                  key={dealKey}
                  propertyId={property.id}
                  ctxParams={ctxParams ?? ""}
                  state={property.state}
                  onPrimaryChanged={() => void loadAnalyses()}
                  onRerunAtEstimate={(rehabBudget) => {
                    setRerunBudget(rehabBudget);
                    openNumbers("new");
                    setTab("Numbers");
                  }}
                  onOpenArv={() => setTab("ARV")}
                />

                {primaryInputsForOffer && (
                  <div className="mt-4">
                    <OfferPanel
                      propertyId={property.id}
                      ctxParams={ctxParams ?? ""}
                      askingPrice={primaryInputsForOffer.homeValue}
                      primaryInputs={primaryInputsForOffer}
                      profile={buyerProfile}
                      arv={arv}
                      rehab={resolveRehab(null, primaryBudget)}
                      state={property.state}
                    />
                  </div>
                )}
              </div>
            )}

            {tab === "ARV" && property && (
              <CompsPanel
                propertyId={property.id}
                ctx={ctx}
                ctxParams={ctxParams}
                // The facts form lives above the tabs, so opening it is
                // enough — there is no tab to switch to.
                onEditFacts={() => setEditingHouse(true)}
              />
            )}

            {tab === "Rehab" && property && (
              <RehabPanel
                propertyId={property.id}
                ctxParams={ctxParams ?? ""}
                listingUrl={property.listing_url ?? null}
                renovationBudget={primaryBudget}
                profile={buyerProfile}
                visitCompletedAt={property.visit_completed_at ?? null}
                entryId={detail.entry?.id ?? null}
                onRerun={(rehabBudget) => {
                  // Opens Run the numbers prefilled, so the loan can be sized
                  // on the figure the estimate actually produced.
                  setRerunBudget(rehabBudget);
                  openNumbers("new");
                  setTab("Numbers");
                }}
                onSaved={async () => {
                  await loadAnalyses();
                  setDealKey((k) => k + 1);
                }}
              />
            )}

            {tab === "Details" && (
              <div data-testid="panel-overview">
            {/* Contacts */}
            <h2 className="text-[13px] font-semibold text-(--color-text-primary) mt-6 mb-2">Contacts</h2>
            {detail.contacts.length === 0 ? (
              <p className="text-[12px] text-(--color-text-secondary)">No contacts on this property yet.</p>
            ) : (
              <div className="grid gap-2">
                {detail.contacts.map((c) => (
                  <ContactCard key={c.id} contact={c} />
                ))}
              </div>
            )}

              </div>
            )}

            {/* A house added from Properties is not on the pipeline until it
                is put there, and tasks and activities hang off a pipeline
                entry. Saying so beats a form that posts and fails. */}
            {tab === "Activity" && !detail.entry && (
              <div data-testid="panel-activity-no-entry" className="mt-4">
                <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">
                  This house isn&rsquo;t on the pipeline yet. Add it to log calls,
                  notes and follow-ups against it.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  data-testid="add-to-pipeline"
                  onClick={() =>
                    void post("/api/crm/pipeline", { property_id: property?.id })
                  }
                  className="mt-3 h-9 px-3 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[12px] font-semibold disabled:opacity-40"
                >
                  Add to pipeline
                </button>
              </div>
            )}

            {tab === "Activity" && detail.entry && (
              <div data-testid="panel-activity">
            {/* Tasks */}
            <div className="flex items-center justify-between mt-6 mb-2">
              <h2 className="text-[13px] font-semibold text-(--color-text-primary)">Tasks</h2>
              <button
                type="button"
                data-testid="add-task"
                disabled={busy}
                onClick={() =>
                  void post("/api/crm/tasks", {
                    // The real entry, not the route param — arriving from
                    // Properties that param is a property id, and every note
                    // and task silently failed.
                    pipeline_entry_id: detail.entry?.id,
                    title: "Follow up",
                    due_date: cadenceDueDate(7),
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors disabled:opacity-50"
              >
                <Plus size={12} /> Follow up in 7 days
              </button>
            </div>
            {openTasks.length === 0 ? (
              <p className="text-[12px] text-(--color-warning)">
                No open follow-up. Nothing will remind anyone about this lead.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {openTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-md)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] text-(--color-text-primary) truncate">{t.title}</p>
                      <p className="text-[11px] text-(--color-text-tertiary)">
                        Due {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {t.cadence_step ? ` · day ${t.cadence_step}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void post("/api/crm/tasks/complete", { task_id: t.id })}
                      className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong) transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Check size={11} /> Done
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Activity */}
            <h2 className="text-[13px] font-semibold text-(--color-text-primary) mt-6 mb-2">Activity</h2>
            <div className="flex gap-2 mb-3">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as ActivityType)}
                className="text-[12px] bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-md)] px-2 py-2 text-(--color-text-primary) shrink-0"
              >
                {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((t) => (
                  <option key={t} value={t}>
                    {ACTIVITY_LABEL[t]}
                  </option>
                ))}
              </select>
              <input
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="What happened?"
                className="flex-1 min-w-0 text-[13px] bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-md)] px-3 py-2 text-(--color-text-primary) placeholder:text-(--color-text-disabled)"
              />
              <button
                type="button"
                data-testid="log-activity"
                disabled={busy || noteBody.trim() === ""}
                onClick={async () => {
                  const ok = await post("/api/crm/activities", {
                    pipeline_entry_id: detail.entry?.id,
                    type: noteType,
                    body: noteBody.trim(),
                  });
                  if (ok) setNoteBody("");
                }}
                className="text-[12px] px-3 py-2 rounded-[var(--radius-md)] border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong) transition-colors disabled:opacity-40 shrink-0"
              >
                Log
              </button>
            </div>

            {detail.activities.length === 0 ? (
              <p className="text-[12px] text-(--color-text-secondary)">Nothing logged yet.</p>
            ) : (
              <ul className="grid gap-2">
                {detail.activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-(--color-border-default) pl-3">
                    <p className="text-[11px] text-(--color-text-tertiary)">
                      {ACTIVITY_LABEL[a.type]} · {when(a.occurred_at)}
                    </p>
                    {a.body && (
                      <p className="text-[13px] text-(--color-text-primary) leading-relaxed">{a.body}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Over the house, bound to the house. Mounted outside the scroll
          container so the modal's own sticky footer is measured against the
          viewport rather than the page. */}
      {numbersTarget && property && (
        <NumbersModal
          propertyId={property.id}
          heading={[property.address_line1, property.city, property.state]
            .filter(Boolean)
            .join(", ")}
          target={numbersTarget}
          rehabBudget={rerunBudget}
          initialLabel={
            numbersTarget === "new"
              ? ""
              : (analyses.find((a) => a.id === numbersTarget)?.label ?? "")
          }
          onClose={() => {
            setRerunBudget(null);
            closeNumbers();
          }}
          onSaved={async () => {
            setRerunBudget(null);
            closeNumbers();
            // The Numbers tab and the header both read from these.
            await Promise.all([loadAnalyses(), load()]);
            setTab("Numbers");
          }}
        />
      )}
    </AppShell>
  );
}
