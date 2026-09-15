"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type cytoscape from "cytoscape";
import type { ElementDefinition } from "cytoscape";
import { nodeColor } from "@/lib/domain/types";
import type { EdgeStatus, GraphEdge, GraphNode, GraphSnapshot } from "@/lib/domain/types";
import type { Selection } from "@/components/workspace/WorkspaceProvider";

// Initial load spreads nodes from scratch (randomize). Filter toggles re-use
// the existing positions via a non-randomized pass so visible nodes keep their
// relative arrangement while relaxing into the freed space.
function layoutOptions(randomize: boolean): cytoscape.LayoutOptions {
  return {
    name: "cose",
    animate: true,
    animationDuration: 350,
    padding: 60,
    idealEdgeLength: () => 200,
    edgeElasticity: () => 180,
    nodeOverlap: 40,
    gravity: 0.5,
    numIter: 1500,
    randomize,
  };
}

const INITIAL_LAYOUT = layoutOptions(true);
const INCREMENTAL_LAYOUT = layoutOptions(false);

// cytoscape ships its own types: StylesheetJson = StylesheetJsonBlock[].
const STYLE: cytoscape.StylesheetJson = [
  {
    selector: "node",
    style: {
      "background-color": "data(color)",
      label: "data(label)",
      color: "#ffffff",
      "font-size": 10,
      shape: "ellipse",
      "text-valign": "center",
      "text-halign": "center",
      "text-max-width": "60px",
      "text-wrap": "wrap",
      width: 75,
      height: 65,
      "border-width": 1.5,
      "border-color": "#94a3b8",
      "overlay-padding": 4,
    },
  },
  {
    selector: "edge",
    style: {
      width: 2.5,
      "curve-style": "bezier",
      "line-color": "#94a3b8",
      "target-arrow-color": "#94a3b8",
      "target-arrow-shape": "triangle",
      label: "data(label)",
      "font-size": 9,
      color: "#64748b",
      "text-rotation": "autorotate",
      "text-margin-y": -8,
      "overlay-padding": 3,
    },
  },
  {
    selector: "edge.approved",
    style: { opacity: 1 },
  },
  {
    // Pending proposals: dashed + dimmed per the product contract.
    selector: "edge.pending",
    style: {
      "line-style": "dashed",
      "line-color": "#8b5cf6",
      "target-arrow-color": "#8b5cf6",
      opacity: 0.6,
    },
  },
  {
    selector: "edge.rejected",
    style: {
      "line-style": "dashed",
      "line-color": "#f43f5e",
      "target-arrow-color": "#f43f5e",
      opacity: 0.25,
    },
  },
  {
    // Retired (soft-deleted) edges linger faintly for lineage; restorable from their panel.
    selector: "edge.retired",
    style: {
      "line-style": "dotted",
      "line-color": "#cbd5e1",
      "target-arrow-color": "#cbd5e1",
      opacity: 0.15,
    },
  },
  {
    selector: "node:selected",
    style: { "border-width": 3, "border-color": "#0284c7" },
  },
  {
    selector: "edge:selected",
    style: { width: 4, opacity: 1 },
  },
];

function nodeDefinition(node: GraphNode): ElementDefinition {
  return {
    data: { id: node.id, label: node.label, color: nodeColor(node.type) },
  };
}

function edgeDefinition(edge: GraphEdge): ElementDefinition {
  return {
    data: { id: edge.id, label: edge.type, source: edge.sourceId, target: edge.targetId },
    classes: edge.status,
  };
}

/** Human-readable label for a node type; falls back to a graceful unknown name. */
function typeLabel(type: string): string {
  return type.trim() === "" ? "unknown" : type;
}

interface TypeCount {
  type: string;
  count: number;
}

/** Distinct node types, with unknown types lumped under a graceful label, sorted by count desc. */
function typeCounts(nodes: GraphNode[]): TypeCount[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const label = typeLabel(node.type);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/** Dot colors for the edge-status filter pills, matching the edge styles. */
const STATUS_DOT_COLORS: Record<EdgeStatus, string> = {
  approved: "#94a3b8",
  pending: "#8b5cf6",
  rejected: "#f43f5e",
  retired: "#cbd5e1",
};

const EDGE_STATUSES: EdgeStatus[] = ["approved", "pending", "rejected", "retired"];

/**
 * Filter a snapshot to the currently visible types and edge statuses. A node is
 * visible when its type is not hidden; an edge is visible when both endpoints
 * are visible and its status is not hidden.
 */
function filteredSnapshot(graph: GraphSnapshot, hiddenTypes: Set<string>, hiddenStatuses: Set<string>): GraphSnapshot {
  const visibleNodes = graph.nodes.filter((node) => !hiddenTypes.has(typeLabel(node.type)));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) =>
      !hiddenStatuses.has(edge.status) &&
      visibleIds.has(edge.sourceId) &&
      visibleIds.has(edge.targetId),
  );
  return { nodes: visibleNodes, edges: visibleEdges };
}

/** Sync the cytoscape graph with a snapshot; returns true when nodes changed. */
function syncElements(cy: cytoscape.Core, graph: GraphSnapshot): boolean {
  let structural = false;

  const aliveNodes = new Set(graph.nodes.map((node) => node.id));
  cy.nodes().forEach((element) => {
    if (!aliveNodes.has(element.id())) {
      element.remove();
      structural = true;
    }
  });
  const presentNodes = new Set(cy.nodes().map((element) => element.id()));
  const addedNodes = graph.nodes.filter((node) => !presentNodes.has(node.id));
  if (addedNodes.length > 0) {
    cy.add(addedNodes.map(nodeDefinition));
    structural = true;
  }

  const nodeIds = new Set(cy.nodes().map((element) => element.id()));
  const aliveEdges = new Set(
    graph.edges
      .filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
      .map((edge) => edge.id),
  );
  cy.edges().forEach((element) => {
    if (!aliveEdges.has(element.id())) element.remove();
  });
  const presentEdges = new Set(cy.edges().map((element) => element.id()));
  const addedEdges = graph.edges.filter((edge) => aliveEdges.has(edge.id) && !presentEdges.has(edge.id));
  if (addedEdges.length > 0) cy.add(addedEdges.map(edgeDefinition));

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  cy.nodes().forEach((element) => {
    const node = nodeById.get(element.id());
    if (node) element.data({ label: node.label, color: nodeColor(node.type) });
  });
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  cy.edges().forEach((element) => {
    const edge = edgeById.get(element.id());
    if (edge) {
      element.data("label", edge.type);
      element.classes(edge.status);
    }
  });

  return structural;
}

interface GraphCanvasProps {
  graph: GraphSnapshot | null;
  selectedId: string | null;
  onSelect: (selection: Selection | null) => void;
}

export default function GraphCanvas({ graph, selectedId, onSelect }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<cytoscape.Core | null>(null);
  const graphRef = useRef<GraphSnapshot | null>(graph);
  const selectRef = useRef(onSelect);
  const didInitialLayout = useRef(false);
  const hiddenTypesRef = useRef<Set<string>>(new Set());
  const hiddenStatusesRef = useRef<Set<string>>(new Set());
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set());

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  // Keep a ref in sync so the single-shot mount effect can read the current
  // filters without being re-created (it intentionally runs once).
  useEffect(() => {
    hiddenTypesRef.current = hiddenTypes;
  }, [hiddenTypes]);

  useEffect(() => {
    hiddenStatusesRef.current = hiddenStatuses;
  }, [hiddenStatuses]);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  const types = useMemo(() => (graph ? typeCounts(graph.nodes) : []), [graph]);
  const filtered = useMemo(() => {
    if (!graph) return null;
    return filteredSnapshot(graph, hiddenTypes, hiddenStatuses);
  }, [graph, hiddenTypes, hiddenStatuses]);
  const allHidden = graph !== null && graph.nodes.length > 0 && filtered !== null && filtered.nodes.length === 0;

  function toggleType(type: string): void {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleStatus(status: EdgeStatus): void {
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  // Create the instance once (cytoscape is loaded dynamically to keep SSR clean).
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const lib = await import("cytoscape");
      if (disposed || !containerRef.current) return;
      const cy = lib.default({
        container: containerRef.current,
        elements: [],
        style: STYLE,
        layout: { name: "preset" },
        wheelSensitivity: 0.2,
      });
      cy.on("tap", "node", (event) => {
        const node = event.target as cytoscape.NodeSingular;
        selectRef.current({ kind: "node", id: node.id() });
      });
      cy.on("tap", "edge", (event) => {
        const edge = event.target as cytoscape.EdgeSingular;
        selectRef.current({ kind: "edge", id: edge.id() });
      });
      cy.on("tap", (event) => {
        if (event.target === cy) selectRef.current(null);
      });
      instanceRef.current = cy;
      const initial = graphRef.current;
      if (initial) {
        // Filters can only be hidden via the sync effect below (which runs after
        // mount), so reading the ref here is always the current, visible-agnostic
        // state. This effect intentionally runs once.
        syncElements(cy, filteredSnapshot(initial, hiddenTypesRef.current, hiddenStatusesRef.current));
        cy.layout(INITIAL_LAYOUT).run();
        cy.fit(undefined, 60);
        didInitialLayout.current = true;
      }
    })();
    return () => {
      disposed = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  // Sync data on refreshes or filter changes; re-run the layout only when nodes changed.
  useEffect(() => {
    const cy = instanceRef.current;
    if (!cy || !filtered) return;
    const structural = syncElements(cy, filtered);
    if (structural) {
      const options = didInitialLayout.current ? INCREMENTAL_LAYOUT : INITIAL_LAYOUT;
      didInitialLayout.current = true;
      cy.layout(options).run();
      cy.fit(undefined, 60);
    }
  }, [filtered]);

  // Keep canvas selection in sync with the side panel. A selected node that is
  // currently hidden by a filter is deselected rather than re-selected from the
  // raw (unfiltered) set.
  useEffect(() => {
    const cy = instanceRef.current;
    if (!cy) return;
    cy.$(":selected").unselect();
    if (selectedId && filtered) {
      const visible = filtered.nodes.some((node) => node.id === selectedId);
      if (visible) {
        const element = cy.getElementById(selectedId);
        if (element.nonempty()) element.select();
      }
    }
  }, [selectedId, filtered]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const cy = instanceRef.current;
      if (!cy) return;
      cy.resize();
      cy.fit(undefined, 60);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const empty = graph !== null && graph.nodes.length === 0;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="gk-canvas" />
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            No nodes yet — use “+ Node” in the header to start the graph.
          </p>
        </div>
      )}
      {!empty && allHidden && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            No nodes match the current filter — click a chip to restore.
          </p>
        </div>
      )}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-[11px] text-slate-600 shadow-sm">
        {types.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
            Show
          </span>
        )}
        {types.map(({ type, count }) => {
          const hidden = hiddenTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={!hidden}
              title={`${type} (${count}) — click to ${hidden ? "show" : "hide"}`}
              onClick={() => toggleType(type)}
              className={`pointer-events-auto flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 transition-opacity ${
                hidden
                  ? "cursor-pointer opacity-40 line-through"
                  : "cursor-pointer bg-slate-100"
              }`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: nodeColor(type) }} />
              <span className="truncate">{type}</span>
              <span className="text-slate-400">{count}</span>
            </button>
          );
        })}
        {types.length > 0 && <span className="mx-1 h-4 w-px bg-slate-200" />}
        {graph !== null && graph.edges.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
            Status
          </span>
        )}
        {EDGE_STATUSES.map((status) => {
          const hidden = hiddenStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={!hidden}
              title={`${status} — click to ${hidden ? "show" : "hide"}`}
              onClick={() => toggleStatus(status)}
              className={`pointer-events-auto flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 transition-opacity ${
                hidden ? "cursor-pointer opacity-40 line-through" : "cursor-pointer bg-slate-100"
              }`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_DOT_COLORS[status] }} />
              <span className="capitalize">{status}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
