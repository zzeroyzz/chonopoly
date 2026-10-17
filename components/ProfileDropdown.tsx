"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, User, PiggyBank, Wallet } from "lucide-react";
import { logout } from "@/app/login/actions";
import { getAvatarColors } from "@/lib/avatar";

interface Props {
  initials: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
}

export default function ProfileDropdown({ initials, name, email, avatarUrl, avatarColor }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const c = getAvatarColors(avatarColor ?? null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="fixed top-4 right-4 z-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-9 h-9 rounded-full ${c.bg} border ${c.border} hover:opacity-80 flex items-center justify-center transition-opacity overflow-hidden`}
        aria-label="Profile menu"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className={`${c.text} font-mono font-bold text-xs`}>{initials || "··"}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-52 bg-[#18181c] border border-[#2e2e38] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2e2e38]">
            <div className={`w-8 h-8 rounded-full ${c.bg} border ${c.border} flex items-center justify-center shrink-0 overflow-hidden`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className={`${c.text} font-mono font-bold text-[10px]`}>{initials || "··"}</span>
              )}
            </div>
            <div className="min-w-0">
              {name && <p className="text-white text-sm font-medium truncate">{name}</p>}
              <p className="text-[#7a7870] text-xs truncate">{email}</p>
            </div>
          </div>

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-[#c8c5bc] hover:bg-[#222228] hover:text-white transition-colors"
          >
            <User size={14} />
            Profile
          </Link>

          {/* Temporary entry point. Navigation is Phase 1; without this the
              settings screen has no link and is unreachable on a phone. */}
          <Link
            href="/settings/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-[#c8c5bc] hover:bg-[#222228] hover:text-white transition-colors"
          >
            <Wallet size={14} />
            Income &amp; debts
          </Link>

          <Link
            href="/app"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-[#c8c5bc] hover:bg-[#222228] hover:text-white transition-colors"
          >
            <PiggyBank size={14} />
            Finances
          </Link>

          <div className="border-t border-[#2e2e38]">
            <form action={logout}>
              <button
                type="submit"
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-[#7a7870] hover:text-red-400 hover:bg-red-500/5 transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
