"use client";

import { User, Users, Check, Plus, RotateCcw, Settings2 } from "lucide-react";
import { type ActiveContext } from "@/lib/tenancy";

interface Props {
  userId: string;
  activeContext: ActiveContext;
  teams: { id: string; name: string }[];
  contextLabel: string;
  switchContext: (ctx: ActiveContext) => void;
  resetToPersonal: () => void;
  onNewTeam: () => void;
  onTeamSettings: () => void;
}

/**
 * Personal / team scope picker. Lives in the shell's contextSwitcher slot rather
 * than the frame itself, so routes with no scoped data can leave it out.
 */
export function ContextSwitcher({
  userId,
  activeContext,
  teams,
  contextLabel,
  switchContext,
  resetToPersonal,
  onNewTeam,
  onTeamSettings,
}: Props) {
  return (
    <div className="px-4 pt-2 pb-1">
      <p className="px-0 pt-3 pb-1.5 text-[10px] text-(--color-text-disabled) uppercase tracking-[0.1em]">Context</p>
      <button
        data-testid="context-personal"
        onClick={() => switchContext({ type: "personal", id: userId })}
        className={`w-full flex items-center justify-between h-9 transition-colors ${
          activeContext.type === "personal"
            ? "text-(--color-accent)"
            : "text-(--color-text-secondary) hover:text-(--color-text-primary)"
        }`}
      >
        <div className="flex items-center gap-[10px] text-[13px]">
          <User size={16} className="shrink-0" />
          Personal
        </div>
        {activeContext.type === "personal" && <Check size={14} className="text-(--color-accent) shrink-0" />}
      </button>
      {teams.map(team => (
        <button
          key={team.id}
          data-testid={`context-team-${team.id}`}
          onClick={() => switchContext({ type: "team", id: team.id })}
          className={`w-full flex items-center justify-between h-9 transition-colors rounded-sm pl-1 ${
            activeContext.type === "team" && activeContext.id === team.id
              ? "text-(--color-accent) bg-(--color-accent)/5 border-l-2 border-(--color-accent)"
              : "text-(--color-text-secondary) hover:text-(--color-text-primary)"
          }`}
        >
          <div className="flex items-center gap-[10px] text-[13px]">
            <Users size={16} className="shrink-0" />
            {team.name}
          </div>
          {activeContext.type === "team" && activeContext.id === team.id && (
            <Check size={14} className="text-(--color-accent) shrink-0" />
          )}
        </button>
      ))}
      <button
        onClick={onNewTeam}
        className="flex items-center gap-[10px] h-9 text-[13px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors w-full"
      >
        <Plus size={16} className="shrink-0" />
        New team
      </button>
      {activeContext.type === "team" && (
        <div data-testid="context-banner" className="flex items-center justify-between py-1 mt-0.5">
          <span className="text-[11px] text-(--color-text-secondary) truncate">{contextLabel}</span>
          <button
            data-testid="context-reset"
            onClick={resetToPersonal}
            className="text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors ml-2 shrink-0"
            title="Back to personal"
          >
            <RotateCcw size={10} />
          </button>
        </div>
      )}
      {activeContext.type === "team" && (
        <button
          onClick={onTeamSettings}
          className="flex items-center gap-[10px] h-8 text-[11px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors w-full mt-0.5"
        >
          <Settings2 size={13} className="shrink-0" />
          Team settings
        </button>
      )}
      <hr className="border-(--color-border-subtle) mt-2" />
    </div>
  );
}
