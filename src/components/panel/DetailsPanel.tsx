"use client";

import NodeDetails from "@/components/panel/NodeDetails";
import EdgeDetails from "@/components/panel/EdgeDetails";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

export default function DetailsPanel() {
  const { selection, graph, openCreate } = useWorkspace();

  if (!selection) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-slate-500">
          Select a node or edge on the canvas to inspect it, propose changes, or review it.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openCreate("node")}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          >
            + Node
          </button>
          <button
            type="button"
            onClick={() => openCreate("edge")}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400"
          >
            + Edge
          </button>
        </div>
      </div>
    );
  }

  if (!graph) return null;

  if (selection.kind === "node") {
    const node = graph.nodes.find((candidate) => candidate.id === selection.id);
    if (!node) return <NotFound kind="node" />;
    return <NodeDetails key={node.id} node={node} />;
  }

  const edge = graph.edges.find((candidate) => candidate.id === selection.id);
  if (!edge) return <NotFound kind="edge" />;
  return <EdgeDetails key={edge.id} edge={edge} />;
}

function NotFound({ kind }: { kind: "node" | "edge" }) {
  return (
    <div className="px-6 py-10 text-center text-sm text-slate-500">
      This {kind} is no longer visible — it may have been deleted or retired.
    </div>
  );
}