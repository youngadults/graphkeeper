"use client";

import { useEffect, useRef } from "react";
import type cytoscape from "cytoscape";
import type { ElementDefinition } from "cytoscape";
import { nodeColor } from "@/lib/domain/types";
import type { GraphEdge, GraphNode, GraphSnapshot } from "@/lib/domain/types";
import type { Selection } from "@/components/workspace/WorkspaceProvider";

const LAYOUT_OPTIONS: cytoscape.LayoutOptions = {
  name: "cose",
  animate: true,
  animationDuration: 350,
  padding: 40,
  idealEdgeLength: () => 110,
  nodeOverlap: 24,
  randomize: true,
};

// cytoscape ships its own types: StylesheetJson = StylesheetJsonBlock[].
const STYLE: cytoscape.StylesheetJson = [
  {
    selector: "node",
    style: {
      "background-color": "data(color)",
      label: "data(label)",
      color: "#334155",
      "font-size": 11,
      "text-valign": "bottom",
      "text-margin-y": 6,
      width: 26,
      height: 26,
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

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

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
      if (graphRef.current) {
        syncElements(cy, graphRef.current);
        cy.layout(LAYOUT_OPTIONS).run();
        cy.fit(undefined, 40);
        didInitialLayout.current = true;
      }
    })();
    return () => {
      disposed = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  // Sync data on refreshes; re-run the force layout only when nodes changed.
  useEffect(() => {
    const cy = instanceRef.current;
    if (!cy || !graph) return;
    const structural = syncElements(cy, graph);
    if (structural) {
      cy.layout(LAYOUT_OPTIONS).run();
      cy.fit(undefined, 40);
    }
  }, [graph]);

  // Keep canvas selection in sync with the side panel.
  useEffect(() => {
    const cy = instanceRef.current;
    if (!cy) return;
    cy.$(":selected").unselect();
    if (selectedId) {
      const element = cy.getElementById(selectedId);
      if (element.nonempty()) element.select();
    }
  }, [selectedId, graph]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => instanceRef.current?.resize());
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
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-[11px] text-slate-600 shadow-sm">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> person</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> project</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" /> system</span>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <span className="flex items-center gap-1"><span className="h-0.5 w-5 bg-slate-400" /> approved</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-5 border-t-2 border-dashed border-violet-500" /> pending</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-5 border-t-2 border-dashed border-rose-400" /> rejected</span>
      </div>
    </div>
  );
}