"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphEdge } from "@/lib/domain/types";
import { timeAgo } from "@/lib/client/format";
import { ActorChip, ConfidencePill, StatusBadge } from "@/components/ui/badges";
import { PropsField, parsePropsText, serializeProps } from "@/components/panel/PropsField";
import { ActivityList, useActivityFeed } from "@/components/panel/ActivityFeed";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

export default function EdgeDetails({ edge }: { edge: GraphEdge }) {
  const {
    graph,
    canWrite,
    updateEdge,
    deleteEdge,
    reviewEdge,
    restoreEdge,
    actorInfo,
    refreshCount,
    select,
    notify,
  } = useWorkspace();
  const [type, setType] = useState(edge.type);
  const [sourceId, setSourceId] = useState(edge.sourceId);
  const [targetId, setTargetId] = useState(edge.targetId);
  const [propsText, setPropsText] = useState(serializeProps(edge.props));
  const [propsError, setPropsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { entries, loading } = useActivityFeed({ entityType: "edge", entityId: edge.id }, refreshCount);

  // Reset the form only when a different edge is opened — not on background refreshes.
  const lastEdgeId = useRef(edge.id);
  useEffect(() => {
    if (lastEdgeId.current === edge.id) return;
    lastEdgeId.current = edge.id;
    setType(edge.type);
    setSourceId(edge.sourceId);
    setTargetId(edge.targetId);
    setPropsText(serializeProps(edge.props));
    setPropsError(null);
  }, [edge]);

  const source = graph?.nodes.find((node) => node.id === edge.sourceId);
  const target = graph?.nodes.find((node) => node.id === edge.targetId);
  const proposer = actorInfo(edge.proposedBy);
  const decider = actorInfo(edge.decidedBy);

  const handleSave = async () => {
    const props = parsePropsText(propsText);
    if (!props.ok) {
      setPropsError(props.error ?? "Invalid props");
      return;
    }
    setPropsError(null);
    setBusy(true);
    try {
      await updateEdge(edge.id, {
        type: type.trim(),
        ...(edge.status === "pending" ? { sourceId, targetId } : {}),
        ...(props.value !== undefined ? { props: props.value } : {}),
      });
    } catch {
      // error toast already shown by the provider
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      notify(message);
    } catch {
      // error toast already shown by the provider
    } finally {
      setBusy(false);
    }
  };

  const handleRetire = async () => {
    if (!window.confirm("Retire this relationship? It stays in history and can be restored.")) return;
    await act(() => deleteEdge(edge.id), "Relationship retired.");
    select(null);
  };

  const aliveNodes = graph?.nodes ?? [];

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{source?.label ?? "?"}</span>
          <span className="text-xs text-slate-400">—{edge.type}→</span>
          <span className="text-base font-semibold">{target?.label ?? "?"}</span>
          <StatusBadge status={edge.status} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span>proposed by <ActorChip actor={proposer} /></span>
          {decider && (
            <span>
              {edge.status === "rejected" ? "rejected" : "decided"} by <ActorChip actor={decider} />
              {edge.decidedAt ? ` · ${timeAgo(edge.decidedAt)}` : ""}
            </span>
          )}
          <span>updated {timeAgo(edge.updatedAt)}</span>
        </div>
        {typeof edge.props.confidence === "number" && (
          <div className="mt-2 flex items-center gap-2">
            <ConfidencePill value={edge.props.confidence} />
            {typeof edge.props.rationale === "string" && (
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500" title={edge.props.rationale}>
                {edge.props.rationale}
              </span>
            )}
          </div>
        )}
      </div>

      {edge.status === "pending" && canWrite && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => reviewEdge(edge.id, "approve"), "Approved.")}
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => reviewEdge(edge.id, "reject"), "Rejected.")}
            className="flex-1 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
      {!canWrite && edge.status === "pending" && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Viewers are read-only — switch to an analyst or admin to review.
        </p>
      )}

      {canWrite ? (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Edit</p>
          <div>
            <label htmlFor="gk-edge-type" className="mb-1 block text-xs font-medium text-slate-600">
              Relationship type
            </label>
            <input
              id="gk-edge-type"
              list="gk-edge-types"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
          {edge.status === "pending" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="gk-edge-source" className="mb-1 block text-xs font-medium text-slate-600">
                  Source
                </label>
                <select
                  id="gk-edge-source"
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  {aliveNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label} ({node.type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="gk-edge-target" className="mb-1 block text-xs font-medium text-slate-600">
                  Target
                </label>
                <select
                  id="gk-edge-target"
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  {aliveNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label} ({node.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <PropsField text={propsText} onChange={setPropsText} error={propsError} />
          <div className="flex items-center justify-between">
            {(edge.status === "pending" || edge.status === "approved") && (
              <button
                type="button"
                onClick={handleRetire}
                className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                Retire
              </button>
            )}
            {(edge.status === "rejected" || edge.status === "retired") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => restoreEdge(edge.id), "Back to pending review.")}
                className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
              >
                Restore to pending
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : edge.status === "pending" ? "Save & keep pending" : "Save changes"}
            </button>
          </div>
          {edge.status === "pending" && (
            <p className="text-[11px] text-slate-400">
              Tip: edit first, then approve — the review will carry your changes.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Viewers are read-only — switch to an analyst or admin user to edit.
        </p>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">History</p>
        {loading ? (
          <p className="px-1 py-3 text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="rounded-lg border border-slate-200">
            <ActivityList entries={entries} emptyText="No history for this relationship yet." />
          </div>
        )}
      </div>
    </div>
  );
}