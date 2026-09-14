"use client";

import { useCallback, useEffect, useState } from "react";
import type { GraphReport } from "@/lib/domain/report";
import { api } from "@/lib/client/api";
import { timeAgo } from "@/lib/client/format";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

const STATUS_META: Array<{ key: keyof GraphReport["countsByStatus"]; label: string; tone: string }> = [
  { key: "approved", label: "Approved", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "pending", label: "Pending", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "rejected", label: "Rejected", tone: "bg-rose-50 text-rose-700 border-rose-200" },
  { key: "retired", label: "Retired", tone: "bg-slate-100 text-slate-600 border-slate-200" },
];

/** Graph health panel — glanceable compliance/audit snapshot from the export report. */
export default function HealthPanel() {
  const { refreshCount } = useWorkspace();
  const [report, setReport] = useState<GraphReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReport(await api.report());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load health report.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshCount]);

  if (error) {
    return (
      <div className="px-4 py-6 text-center text-sm text-rose-700">
        <p>Couldn’t load the health report.</p>
        <p className="mt-1 text-xs text-slate-500">{error}</p>
      </div>
    );
  }
  if (!report) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500">Loading health report…</div>;
  }

  const { countsByStatus: counts, provenance, pendingBacklog: backlog } = report;
  const totalProvenance = provenance.simAi + provenance.human;
  const aiPct = totalProvenance === 0 ? 0 : Math.round((provenance.simAi / totalProvenance) * 100);
  // Final 7 timeline points (most recent first on screen).
  const recent = report.timeline.slice(-7).reverse();

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <div className="flex items-baseline justify-between border-b border-slate-100 pb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Graph health</p>
        {report.generatedAt && (
          <p className="text-[11px] text-slate-400" title={report.generatedAt}>
            updated {timeAgo(report.generatedAt)}
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500">Scale</p>
        <div className="mt-1 flex gap-2">
          <Stat value={report.nodeCount} label="nodes" />
          <Stat value={report.edgeCount} label="edges" />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500">Relationships by status</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {STATUS_META.map((meta) => (
            <div key={meta.key} className={`rounded-lg border px-3 py-2 ${meta.tone}`}>
              <p className="text-lg font-semibold leading-none">{counts[meta.key]}</p>
              <p className="mt-0.5 text-[11px] font-medium">{meta.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500">Who proposed the edges</p>
        <div className="mt-1.5 rounded-lg border border-slate-200 p-3">
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-violet-500" style={{ width: `${aiPct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-slate-600">
            <span>🤖 Sim AI · {provenance.simAi}</span>
            <span>Human · {provenance.human}</span>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500">Pending backlog</p>
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-lg font-semibold leading-none text-amber-800">{backlog.count}</p>
            <p className="text-[11px] text-amber-700">
              oldest {backlog.oldestPendingAgeDays}d{backlog.oldestPendingAt ? ` · ${timeAgo(backlog.oldestPendingAt)}` : ""}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-amber-700">
            {backlog.count === 0 ? "Queue clear." : "Relationships waiting for review."}
          </p>
        </div>
      </div>

      {recent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500">Review activity · last 7 days</p>
          <ul className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {recent.map((point) => (
              <li key={point.date} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                <span className="text-slate-600">{point.date}</span>
                <span className="flex items-center gap-2">
                  <span className="text-emerald-700">
                    <span className="font-semibold">{point.approvals}</span> ✓
                  </span>
                  <span className="text-rose-700">
                    <span className="font-semibold">{point.rejections}</span> ✗
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-lg font-semibold leading-none text-slate-800">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}
