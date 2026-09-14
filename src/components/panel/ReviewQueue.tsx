"use client";

import { useState } from "react";
import type { GraphEdge } from "@/lib/domain/types";
import { truncate } from "@/lib/client/format";
import { ActorChip, ConfidencePill, StatusBadge } from "@/components/ui/badges";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

/** Pending review queue — approve, reject, or open an edge to edit-then-approve. */
export default function ReviewQueue() {
  const { graph, pendingCount, reviewEdge, restoreEdge, generateProposals, select, actorInfo, canWrite } = useWorkspace();
  const [generating, setGenerating] = useState(false);

  if (!graph) return null;

  const pending = graph.edges
    .filter((edge) => edge.status === "pending")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const retired = graph.edges
    .filter((edge) => edge.status === "retired")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateProposals(5);
    } catch {
      // error toast already shown by the provider
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-3">
        <p className="text-xs text-slate-500">
          {pendingCount === 0
            ? "Nothing waiting for review."
            : `${pendingCount} relationship${pendingCount === 1 ? "" : "s"} waiting — approve, reject, or open to edit-then-approve.`}
        </p>
        {canWrite && (
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerate}
            className="ml-auto shrink-0 rounded-md border border-violet-200 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Ask the simulated AI to propose new relationships from existing nodes"
          >
            {generating ? "Generating…" : "Generate proposals"}
          </button>
        )}
      </div>
      {pending.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="text-3xl">🎉</span>
          <p className="text-sm text-slate-500">Queue clear. New proposals (human or Sim AI) will land here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 px-3 pb-4 pt-2">
          {pending.map((edge) => (
            <ReviewCard
              key={edge.id}
              edge={edge}
              sourceLabel={nodeById.get(edge.sourceId)?.label ?? "?"}
              targetLabel={nodeById.get(edge.targetId)?.label ?? "?"}
              canWrite={canWrite}
              actorInfo={actorInfo}
              onOpen={() => select({ kind: "edge", id: edge.id })}
              onReview={(action) => reviewEdge(edge.id, action)}
            />
          ))}
        </ul>
      )}
      {retired.length > 0 && (
        <div className="border-t border-slate-100 px-4 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Retired ({retired.length}) — restore to re-enter review
          </p>
          <ul className="divide-y divide-slate-100 px-0 pb-4 pt-1">
            {retired.map((edge) => (
              <RetiredCard
                key={edge.id}
                edge={edge}
                sourceLabel={nodeById.get(edge.sourceId)?.label ?? "?"}
                targetLabel={nodeById.get(edge.targetId)?.label ?? "?"}
                canWrite={canWrite}
                actorInfo={actorInfo}
                onOpen={() => select({ kind: "edge", id: edge.id })}
                onRestore={() => restoreEdge(edge.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface ReviewCardProps {
  edge: GraphEdge;
  sourceLabel: string;
  targetLabel: string;
  canWrite: boolean;
  actorInfo: ReturnType<typeof useWorkspace>["actorInfo"];
  onOpen: () => void;
  onReview: (action: "approve" | "reject") => Promise<GraphEdge>;
}

function ReviewCard({ edge, sourceLabel, targetLabel, canWrite, actorInfo, onOpen, onReview }: ReviewCardProps) {
  const [busy, setBusy] = useState(false);
  const proposer = actorInfo(edge.proposedBy);

  const decide = async (action: "approve" | "reject") => {
    setBusy(true);
    try {
      await onReview(action);
    } catch {
      // error toast already shown by the provider
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-slate-200 p-2.5 my-2">
      <div className="flex items-center gap-2">
        <ActorChip actor={proposer} />
        <span className="ml-auto">
          <StatusBadge status={edge.status} />
        </span>
      </div>
      <button type="button" onClick={onOpen} className="mt-1.5 block w-full text-left">
        <p className="text-sm font-medium text-slate-800">
          {sourceLabel} <span className="text-xs font-normal text-slate-400">—{edge.type}→</span> {targetLabel}
        </p>
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <ConfidencePill value={edge.props.confidence} />
        {typeof edge.props.rationale === "string" && (
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500" title={edge.props.rationale}>
            {truncate(edge.props.rationale, 90)}
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={!canWrite || busy}
          onClick={() => decide("approve")}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={!canWrite || busy}
          onClick={() => decide("reject")}
          className="rounded-md border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
        >
          Open
        </button>
      </div>
    </li>
  );
}

interface RetiredCardProps {
  edge: GraphEdge;
  sourceLabel: string;
  targetLabel: string;
  canWrite: boolean;
  actorInfo: ReturnType<typeof useWorkspace>["actorInfo"];
  onOpen: () => void;
  onRestore: () => Promise<GraphEdge>;
}

function RetiredCard({ edge, sourceLabel, targetLabel, canWrite, actorInfo, onOpen, onRestore }: RetiredCardProps) {
  const [busy, setBusy] = useState(false);
  const proposer = actorInfo(edge.proposedBy);

  const restore = async () => {
    setBusy(true);
    try {
      await onRestore();
    } catch {
      // error toast already shown by the provider
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-slate-200 p-2.5 my-2">
      <div className="flex items-center gap-2">
        <ActorChip actor={proposer} />
        <span className="ml-auto">
          <StatusBadge status={edge.status} />
        </span>
      </div>
      <button type="button" onClick={onOpen} className="mt-1.5 block w-full text-left">
        <p className="text-sm font-medium text-slate-800">
          {sourceLabel} <span className="text-xs font-normal text-slate-400">—{edge.type}→</span> {targetLabel}
        </p>
      </button>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={!canWrite || busy}
          onClick={restore}
          className="rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Restore to pending
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
        >
          Open
        </button>
      </div>
    </li>
  );
}