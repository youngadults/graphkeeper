"use client";

import { useState } from "react";
import { ActivityList } from "@/components/panel/ActivityFeed";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

type FeedFilter = "all" | "node" | "edge";

const FILTERS: Array<{ id: FeedFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "node", label: "Nodes" },
  { id: "edge", label: "Edges" },
];

/** Global activity timeline with entity-type filters. */
export default function HistoryPanel() {
  const { activity } = useWorkspace();
  const [filter, setFilter] = useState<FeedFilter>("all");

  const entries =
    filter === "all" ? activity : activity.filter((entry) => entry.entityType === filter);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-4 pt-3">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              filter === entry.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {entry.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-400">latest {entries.length}</span>
      </div>
      <div className="px-3 pb-4 pt-2">
        <div className="rounded-lg border border-slate-200">
          <ActivityList entries={entries} />
        </div>
      </div>
    </div>
  );
}