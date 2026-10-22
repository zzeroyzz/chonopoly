"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copy a value you are going to paste somewhere else.
 *
 * A parcel number is fourteen digits with no rhythm to them and it gets typed
 * into a county site over and over; an address gets pasted into a search.
 * Both are things the owner reads off this screen and types into another one,
 * which is the whole case for this button existing.
 *
 * Icon only: beside a parcel number the word "Copy" was wider than some of
 * the values it sat next to. The tick and the accent colour carry the
 * confirmation, and `aria-label` carries the words for anyone who needs them.
 */
export function CopyButton({
  value,
  label,
  testId,
}: {
  value: string;
  /** What is being copied, for the screen reader and the confirmation. */
  label: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access is refused on an insecure origin and in some
      // browsers without a user gesture. Saying nothing would look like the
      // copy worked, which is worse than saying it did not.
      setCopied(false);
      window.prompt(`Copy the ${label.toLowerCase()}:`, value);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      data-testid={testId}
      aria-label={copied ? `${label} copied` : `Copy the ${label.toLowerCase()}`}
      title={copied ? `${label} copied` : `Copy the ${label.toLowerCase()}`}
      className={`inline-flex items-center justify-center w-7 h-7 shrink-0
        rounded-(--radius-pill) border transition-colors ${
          copied
            ? "border-(--color-accent) text-(--color-accent)"
            : "border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong) hover:text-(--color-text-primary)"
        }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
