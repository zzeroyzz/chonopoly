"use client";

import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Plus } from "lucide-react";

export function PlaidConnectButton({ onSuccess, variant = 'default' }: { onSuccess: () => void; variant?: 'default' | 'ghost' }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plaid/create-link-token", { method: "POST" })
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.link_token ? setLinkToken(d.link_token) : null)
      .catch(() => null);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (publicToken, metadata) => {
      await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: publicToken, institution_name: metadata.institution?.name ?? null }),
      });
      onSuccess();
    },
  });

  if (variant === 'ghost') {
    return (
      <button
        onClick={() => open()}
        disabled={!ready || !linkToken}
        className="text-[13px] text-(--color-text-tertiary) hover:text-(--color-text-primary) disabled:opacity-40 transition-colors"
      >
        Replace account →
      </button>
    );
  }

  return (
    <button
      onClick={() => open()}
      disabled={!ready || !linkToken}
      className="flex items-center gap-1.5 text-[11px] text-(--color-accent) hover:opacity-80 disabled:opacity-40 transition-opacity font-medium"
    >
      <Plus size={11} />
      Connect
    </button>
  );
}
