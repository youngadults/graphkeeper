"use client";

import type { ActivityAction, EdgeStatus } from "@/lib/domain/types";
import type { ActorInfo } from "@/components/workspace/WorkspaceProvider";

const STATUS_STYLES: Record<EdgeStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-100 text-rose-800 border-rose-200",
  retired: "bg-slate-200 text-slate-600 border-slate-300",
};

const ACTION_STYLES: Record<ActivityAction, string> = {
  create: "bg-emerald-100 text-emerald-800",
  update: "bg-sky-100 text-sky-800",
  delete: "bg-rose-100 text-rose-800",
  approve: "bg-emerald-600 text-white",
  reject: "bg-rose-600 text-white",
  propose: "bg-violet-100 text-violet-800",
  restore: "bg-amber-100 text-amber-800",
};

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700 border-violet-200",
  analyst: "bg-sky-100 text-sky-700 border-sky-200",
  viewer: "bg-slate-100 text-slate-600 border-slate-200",
};

export function StatusBadge({ status }: { status: EdgeStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

export function ActionBadge({ action }: { action: ActivityAction }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTION_STYLES[action]}`}>
      {action}
    </span>
  );
}

export function ActorChip({ actor, size = "sm" }: { actor: ActorInfo | null; size?: "sm" | "md" }) {
  if (!actor) return <span className="text-xs text-slate-400">unknown</span>;
  const dot = size === "md" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`inline-block rounded-full ${dot}`} style={{ backgroundColor: actor.color }} />
      {actor.ai ? "🤖 " : ""}
      {actor.name}
    </span>
  );
}

export function RoleChip({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${ROLE_STYLES[role] ?? ROLE_STYLES.viewer}`}>
      {role}
    </span>
  );
}

export function ConfidencePill({ value }: { value: unknown }) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const pct = Math.round(value * 100);
  const tone = value >= 0.75 ? "bg-emerald-50 text-emerald-700" : value >= 0.55 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
      {pct}% confidence
    </span>
  );
}

export function EntityChip({ kind }: { kind: "node" | "edge" }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${kind === "node" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
      {kind}
    </span>
  );
}