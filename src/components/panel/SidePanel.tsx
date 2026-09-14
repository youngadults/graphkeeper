"use client";

import DetailsPanel from "@/components/panel/DetailsPanel";
import ReviewQueue from "@/components/panel/ReviewQueue";
import HistoryPanel from "@/components/panel/HistoryPanel";
import CreatePanel from "@/components/panel/CreatePanel";
import HealthPanel from "@/components/panel/HealthPanel";
import ImportPanel from "@/components/panel/ImportPanel";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { PanelTab } from "@/components/workspace/WorkspaceProvider";

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
  { id: "import", label: "Import" },
  { id: "history", label: "History" },
  { id: "health", label: "Health" },
];

export default function SidePanel() {
  const { tab, setTab, pendingCount, createMode } = useWorkspace();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 pt-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium ${
              tab === entry.id
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {entry.label}
            {entry.id === "review" && pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
        {tab === "create" && (
          <button
            type="button"
            className="ml-auto rounded-t-lg border-b-2 border-slate-900 px-3 py-2 text-sm font-medium text-slate-900"
          >
            New {createMode}
          </button>
        )}
      </div>

      <div className="gk-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === "details" && <DetailsPanel />}
        {tab === "review" && <ReviewQueue />}
        {tab === "history" && <HistoryPanel />}
        {tab === "create" && <CreatePanel />}
        {tab === "health" && <HealthPanel />}
        {tab === "import" && <ImportPanel />}
      </div>
    </div>
  );
}