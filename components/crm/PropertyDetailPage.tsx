"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, Pencil } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { type ScenarioSummary } from "@/lib/mortgage/scenarioService";
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
const TABS = ["Overview", "Numbers", "Comps", "Rehab", "Activity"] as const;
type Tab = (typeof TABS)[number];

export function PropertyDetailPage({ entryId }: { entryId: string }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [analyses, setAnalyses] = useState<ScenarioSummary[]>([]);
  // The scenario rows cost every scenario themselves, so they need the same
  // profile and ARV the Profit card uses.
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile | null>(null);
  const [arv, setArv] = useState<number | null>(null);
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
      const [profileRes, compsRes] = await Promise.all([
        fetch("/api/profile/buyer").catch(() => null),
        fetch(`/api/properties/${propertyId}/comps?${ctxParams}`).catch(() => null),
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

  const openTasks = (detail?.tasks ?? []).filter((t) => t.status === "open");

  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={profile}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings/account")}
    >
      <div className="overflow-y-auto flex-1 w-full px-4 py-4 pb-24 lg:px-8 lg:pb-8 max-w-3xl">
        <button
          type="button"
          onClick={() => router.push("/pipeline")}
          className="inline-flex items-center gap-1.5 text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors mb-3"
        >
          <ArrowLeft size={13} /> Pipeline
        </button>

        {error && (
          <div className="mb-3 text-[12px] text-(--color-danger) border border-(--color-danger) rounded-[var(--radius-md)] px-3 py-2">
            {error}
          </div>
        )}

        {loading && <p className="text-[13px] text-(--color-text-secondary)">Loading…</p>}

        {detail && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[19px] font-semibold text-(--color-text-primary) wrap-break-word">
                  {property?.address_line1 ?? "Address unknown"}
                </h1>
                <p className="text-[12px] text-(--color-text-secondary) mt-0.5">
                  {[property?.city, property?.state, property?.zip].filter(Boolean).join(", ") || "—"}
                </p>
              </div>

              {property && (
                <button
                  type="button"
                  onClick={() => void toggleFinalist()}
                  disabled={finalistBusy}
                  data-testid="finalist-toggle"
                  aria-pressed={isFinalist}
                  aria-label={isFinalist ? "Remove from finalists" : "Mark as a finalist"}
                  className={`shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-[var(--radius-pill)] border text-[12px] font-medium disabled:opacity-40 ${
                    isFinalist
                      ? "border-(--color-accent) text-(--color-accent)"
                      : "border-(--color-border-default) text-(--color-text-secondary)"
                  }`}
                >
                  <Star size={12} fill={isFinalist ? "currentColor" : "none"} />
                  {isFinalist ? "Finalist" : "Mark finalist"}
                </button>
              )}

              {property && (
                <button
                  type="button"
                  onClick={() => setEditingHouse((v) => !v)}
                  data-testid="edit-house-toggle"
                  className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-[var(--radius-pill)] border border-(--color-border-default) text-[12px] font-medium"
                >
                  <Pencil size={12} />
                  {editingHouse ? "Close" : "Edit"}
                </button>
              )}
            </div>

            {/* The pipeline badge only exists when the house is on the
                pipeline. A house added from the calculator or a batch paste
                has no entry, and it is still a house worth looking at. */}
            {detail.entry ? (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
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
                <span className="text-[11px] text-(--color-text-tertiary)">
                  {daysInStage(detail.entry.stage_since)}d in stage
                </span>
              </div>
            ) : (
              <p
                data-testid="not-on-pipeline"
                className="text-[11px] text-(--color-text-tertiary) mt-3"
              >
                Not on the pipeline — screening only.
              </p>
            )}

            {property && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-[12px]">
                {[
                  ["Parcel", property.parcel_number],
                  ["County", property.county],
                  ["Type", propertyTypeLabel(property.property_type)],
                  ["Beds / baths", property.beds || property.baths ? `${property.beds ?? "—"} / ${property.baths ?? "—"}` : null],
                  ["Sqft", property.sqft ? property.sqft.toLocaleString() : null],
                  ["Year built", property.year_built],
                ]
                  .filter(([, v]) => v !== null && v !== undefined && v !== "")
                  .map(([label, value]) => (
                    <div key={String(label)}>
                      <dt className="text-(--color-text-tertiary)">{label}</dt>
                      <dd className="text-(--color-text-primary)">{String(value)}</dd>
                    </div>
                  ))}
              </dl>
            )}

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

            {/* The five tabs. Present even when empty, so the page does not
                change shape as later phases fill them in. */}
            <div className="flex gap-1 border-b border-(--color-border-default) mt-5 mb-4 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  data-testid={`tab-${t.toLowerCase()}`}
                  aria-current={tab === t ? "page" : undefined}
                  className={`px-3 py-2 text-[13px] border-b-2 -mb-px whitespace-nowrap transition-colors ${
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

                {/* What the deal makes, worked back from the analysis above. */}
                {property && primaryInputsForOffer && (
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

                {property && (
                  <DealPanel
                    key={dealKey}
                    propertyId={property.id}
                    ctxParams={ctxParams ?? ""}
                    state={property.state}
                    onPrimaryChanged={() => void loadAnalyses()}
                    onRerunAtEstimate={(rehabBudget) => {
                      setRerunBudget(rehabBudget);
                      openNumbers("new");
                    }}
                  />
                )}
              </div>
            )}

            {tab === "Comps" && property && (
              <CompsPanel propertyId={property.id} ctx={ctx} ctxParams={ctxParams} />
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

            {tab === "Overview" && (
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

            {tab === "Activity" && (
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
                    pipeline_entry_id: entryId,
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
                    pipeline_entry_id: entryId,
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
