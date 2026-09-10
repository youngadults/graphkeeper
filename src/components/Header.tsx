"use client";

import UserPicker from "@/components/UserPicker";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

export default function Header() {
  const { graph, pendingCount, me, canWrite, openCreate } = useWorkspace();

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
          ◈
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">GraphKeeper</p>
          <p className="text-[11px] text-slate-500">governed knowledge graphs</p>
        </div>
      </div>

      <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{nodeCount} nodes</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{edgeCount} edges</span>
        <span
          className={`rounded-full px-2.5 py-1 ${pendingCount > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100"}`}
        >
          {pendingCount} pending
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={!canWrite}
          title={canWrite ? "Create a node" : "Viewers are read-only"}
          onClick={() => openCreate("node")}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Node
        </button>
        <button
          type="button"
          disabled={!canWrite}
          title={canWrite ? "Propose a relationship" : "Viewers are read-only"}
          onClick={() => openCreate("edge")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Edge
        </button>
        <UserPicker />
        {me === null && (
          <span className="hidden text-xs text-slate-400 lg:inline">pick a user to make changes</span>
        )}
      </div>
    </header>
  );
}