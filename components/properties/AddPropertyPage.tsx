"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { useCrmContext } from "@/components/crm/useCrmContext";

/**
 * Add houses by pasting a list.
 *
 * One box, one address per line. The realistic input is a paste from an email
 * or a text message, so the same box handles one house and twenty — a separate
 * "bulk mode" would be two forms for one job.
 *
 * Nothing is validated away silently. Every line comes back with what happened
 * to it, keyed to the line number the user can see, because a paste of twenty
 * that reports "18 added" without saying which two failed is not a result
 * anyone can act on.
 */

interface BatchResultRow {
  lineNumber: number;
  raw: string;
  status: "created" | "matched" | "failed";
  propertyId: string | null;
  needsAddressReview: boolean;
  message: string | null;
}

interface BatchResponse {
  results: BatchResultRow[];
  created: number;
  matched: number;
  failed: number;
}

const PLACEHOLDER = `128 Maple St, Duluth GA 30096, 250000, https://…
44 Oak Ave, Duluth GA 30096, 265k
1653 Sylvan Rd SW, Atlanta GA 30310`;

export function AddPropertyPage() {
  const router = useRouter();
  const { ctx } = useCrmContext();

  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResponse | null>(null);

  const lineCount = text.split("\n").filter((l) => l.trim()).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx || !text.trim()) return;

    setSaving(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/properties/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context_type: ctx.type, context_id: ctx.id, text }),
      });

      const body = await res.text();
      if (!res.ok) {
        let message = `Failed to add (HTTP ${res.status})`;
        try {
          const parsed = JSON.parse(body) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // Keep the status message.
        }
        throw new Error(message);
      }

      setResult(JSON.parse(body) as BatchResponse);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add the houses");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={null}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings/account")}
    >
      <div className="overflow-y-auto flex-1 w-full px-5 py-4 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold mb-1 text-(--color-text-primary)">Add houses</h1>
        <p className="text-[12px] text-(--color-text-secondary) mb-4 leading-relaxed">
          One address per line. Price and listing link are optional:
          <br />
          <span className="text-(--color-text-tertiary)">
            address, city state zip, price, link
          </span>
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={PLACEHOLDER}
            data-testid="batch-addresses"
            className="w-full bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2.5 text-[13px] leading-relaxed font-mono focus:outline-none focus:border-(--color-accent) transition-colors"
          />

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !text.trim() || !ctx}
              data-testid="batch-submit"
              className="h-10 px-4 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[13px] font-semibold disabled:opacity-50"
            >
              {saving
                ? "Adding…"
                : lineCount > 1
                  ? `Add ${lineCount} houses`
                  : "Add house"}
            </button>

            {/* Comps are not pulled here on purpose — a paste of twenty would
                spend twenty of the month's fifty requests before anyone had
                decided which houses were worth it. */}
            <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed">
              Comps are pulled per house, from its Comps tab.
            </p>
          </div>
        </form>

        {error && (
          <p
            data-testid="batch-error"
            className="mt-4 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5"
          >
            {error}
          </p>
        )}

        {result && (
          <div data-testid="batch-result" className="mt-5">
            <p className="text-[13px] font-semibold text-(--color-text-primary)">
              {result.created} added
              {result.matched > 0 ? ` · ${result.matched} already known` : ""}
              {result.failed > 0 ? ` · ${result.failed} skipped` : ""}
            </p>

            <ul className="flex flex-col gap-1.5 mt-3">
              {result.results.map((row) => (
                <li
                  key={`${row.lineNumber}-${row.raw}`}
                  data-testid={`batch-line-${row.lineNumber}`}
                  className="flex items-start gap-2 text-[12px] rounded-lg border border-(--color-border-default) px-2.5 py-2"
                >
                  {row.status === "failed" ? (
                    <AlertTriangle size={12} className="shrink-0 mt-0.5 text-red-400" />
                  ) : (
                    <Check size={12} className="shrink-0 mt-0.5 text-(--color-accent)" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="wrap-break-word text-(--color-text-primary)">
                      <span className="text-(--color-text-tertiary)">
                        Line {row.lineNumber}:{" "}
                      </span>
                      {row.raw}
                    </p>

                    {/* The reason, always — "skipped" with no cause is not a
                        result anyone can fix. */}
                    {row.message && (
                      <p
                        className={`mt-0.5 ${
                          row.status === "failed"
                            ? "text-red-400"
                            : "text-(--color-text-secondary)"
                        }`}
                      >
                        {row.message}
                      </p>
                    )}

                    {row.needsAddressReview && (
                      <p className="mt-0.5 text-amber-400">
                        Address needs a check before you rely on it
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {result.created + result.matched > 0 && (
              <Link
                href="/properties"
                data-testid="batch-to-screen"
                className="inline-flex items-center gap-1 mt-4 text-[13px] text-(--color-accent) font-medium"
              >
                <Plus size={13} />
                Screen them
              </Link>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
