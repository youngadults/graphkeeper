"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphNode } from "@/lib/domain/types";
import { timeAgo } from "@/lib/client/format";
import { ActorChip } from "@/components/ui/badges";
import { PropsField, parsePropsText, serializeProps } from "@/components/panel/PropsField";
import { ActivityList, useActivityFeed } from "@/components/panel/ActivityFeed";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

export default function NodeDetails({ node }: { node: GraphNode }) {
  const { canWrite, updateNode, deleteNode, restoreNode, actorInfo, refreshCount, select, notify } = useWorkspace();
  const [label, setLabel] = useState(node.label);
  const [type, setType] = useState(node.type);
  const [propsText, setPropsText] = useState(serializeProps(node.props));
  const [propsError, setPropsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { entries, loading } = useActivityFeed({ entityType: "node", entityId: node.id }, refreshCount);

  // Reset the form only when a different node is opened — not on background refreshes.
  const lastNodeId = useRef(node.id);
  useEffect(() => {
    if (lastNodeId.current === node.id) return;
    lastNodeId.current = node.id;
    setLabel(node.label);
    setType(node.type);
    setPropsText(serializeProps(node.props));
    setPropsError(null);
  }, [node]);

  const handleSave = async () => {
    const props = parsePropsText(propsText);
    if (!props.ok) {
      setPropsError(props.error ?? "Invalid props");
      return;
    }
    setPropsError(null);
    setSaving(true);
    try {
      await updateNode(node.id, {
        label: label.trim(),
        type: type.trim(),
        ...(props.value !== undefined ? { props: props.value } : {}),
      });
    } catch {
      // error toast already shown by the provider
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete node "${node.label}"? Its edges stay in the history and it can be restored via the API.`)) {
      return;
    }
    try {
      await deleteNode(node.id);
      select(null);
      notify("Node deleted (soft).");
    } catch {
      // error toast already shown by the provider
    }
  };

  const handleRestore = async () => {
    try {
      await restoreNode(node.id);
      notify("Node restored.");
    } catch {
      // error toast already shown by the provider
    }
  };

  const creator = actorInfo(node.createdBy);

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">{node.label}</h2>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{node.type}</span>
          {node.deletedAt && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">deleted</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <ActorChip actor={creator} />
          <span>created {timeAgo(node.createdAt)}</span>
          <span>updated {timeAgo(node.updatedAt)}</span>
        </div>
      </div>

      {canWrite ? (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Edit</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="gk-node-label" className="mb-1 block text-xs font-medium text-slate-600">
                Label
              </label>
              <input
                id="gk-node-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>
            <div>
              <label htmlFor="gk-node-type" className="mb-1 block text-xs font-medium text-slate-600">
                Type
              </label>
              <input
                id="gk-node-type"
                list="gk-node-types"
                value={type}
                onChange={(event) => setType(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>
          </div>
          <PropsField text={propsText} onChange={setPropsText} error={propsError} />
          <div className="flex items-center justify-between">
            {node.deletedAt ? (
              <button
                type="button"
                onClick={handleRestore}
                className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
              >
                Restore node
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                Delete node
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
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
            <ActivityList entries={entries} emptyText="No history for this node yet." />
          </div>
        )}
      </div>
    </div>
  );
}