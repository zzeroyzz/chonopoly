"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_META, getCategoryMeta } from "./types";

interface Props {
  category: string | undefined;
  transactionId: string;
  onChangeCategory: (transactionId: string, newCategory: string) => void;
}

export default function CategoryPill({ category, transactionId, onChangeCategory }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = getCategoryMeta(category);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Click to change category"
        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium hover:opacity-70 transition-opacity ${meta.color}`}
      >
        {meta.label}
      </button>

      {open && (
        <div className="absolute left-0 top-6 z-50 w-44 bg-[#1e1e24] border border-[#2e2e38] rounded-xl shadow-2xl overflow-y-auto max-h-64">
          {Object.entries(CATEGORY_META).map(([key, m]) => (
            <button
              key={key}
              onClick={() => {
                onChangeCategory(transactionId, key);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-[#2e2e38] transition-colors flex items-center gap-2 ${key === category ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
            >
              <span className={`px-1.5 py-0.5 rounded-full ${m.color}`}>{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
