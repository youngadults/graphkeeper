import { NODE_TYPE_COLORS } from "./types";
import type { EdgeOrigin, GraphEdge, GraphNode } from "@/lib/domain/types";
import type { ImportEdgeInput, ImportNodeInput } from "@/lib/db/store";
import type { EdgeFieldMapping, NodeFieldMapping, SourceData } from "./import-source";

/**
 * Import planning and preview: resolves edge references against the import's
 * own node set plus the live graph, filters duplicates, self-loops, and
 * dangling rows, and produces the preview summary shown in the UI.
 * Pure functions — no store or HTTP access.
 */

export interface SkippedRow {
  kind: "node" | "edge";
  index: number;
  reason: string;
}

export interface ImportPlan {
  nodes: ImportNodeInput[];
  edges: ImportEdgeInput[];
  skipped: SkippedRow[];
  warnings: string[];
}

export interface ImportPreview {
  kind: "csv" | "graph-json";
  nodes: {
    count: number;
    willCreate: number;
    headers: string[] | null;
    sample: ImportNodeInput[];
  };
  edges: {
    count: number;
    willCreate: number;
    headers: string[] | null;
    sample: ImportEdgeInput[];
  };
  mapping: { nodes: NodeFieldMapping | null; edges: EdgeFieldMapping | null };
  warnings: string[];
  skipped: SkippedRow[];
}

export interface ImportCommitResult {
  importId: string;
  duplicate: boolean;
  origin: EdgeOrigin;
  filename: string | null;
  nodesCreated: number;
  edgesCreated: number;
  skipped: SkippedRow[];
  warnings: string[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function newId(): string {
  return crypto.randomUUID();
}

/** Distinct node type values that GraphKeeper has no built-in color for. */
function unknownTypeWarnings(rows: Array<{ type: string }>): string[] {
  const known = new Set(Object.keys(NODE_TYPE_COLORS));
  const unknown = [...new Set(rows.map((row) => row.type).filter((type) => !known.has(type)))];
  if (unknown.length === 0) return [];
  const listed = unknown.slice(0, 5).map((type) => `"${type}"`).join(", ");
  const extra = unknown.length > 5 ? ` (and ${unknown.length - 5} more)` : "";
  return [`Unknown node type(s): ${listed}${extra} — they will be created but render gray.`];
}

/** Reference pool for edge resolution: import ids, then labels, then live nodes. */
function buildRefIndex(
  plannedNodes: Array<{ id: string; sourceId?: string; label: string }>,
  liveNodes: GraphNode[],
): Map<string, string> {
  const byRef = new Map<string, string>();
  for (const node of plannedNodes) {
    if (node.sourceId) byRef.set(node.sourceId, node.id);
    if (!byRef.has(node.label)) byRef.set(node.label, node.id);
  }
  for (const node of liveNodes) {
    if (node.deletedAt) continue;
    if (!byRef.has(node.id)) byRef.set(node.id, node.id);
    if (!byRef.has(node.label)) byRef.set(node.label, node.id);
  }
  return byRef;
}

/**
 * Turn parsed source rows into a concrete creation plan. Rows referencing
 * nothing resolvable are skipped with a reason; duplicate ids and duplicate
 * (source, target, type) triples are skipped too.
 */
export function analyzeImport(sourceData: SourceData, liveNodes: GraphNode[], liveEdges: GraphEdge[]): ImportPlan {
  const skipped: SkippedRow[] = [];
  const warnings: string[] = [];
  const liveNodeIds = new Set(liveNodes.filter((node) => !node.deletedAt).map((node) => node.id));
  const liveEdgeKeys = new Set(liveEdges.map((edge) => `${edge.sourceId}|${edge.targetId}|${edge.type}`));

  // ---- nodes: assign ids, drop duplicate/already-existing ids -------------
  const plannedNodes: Array<{ id: string; sourceId?: string; label: string }> = [];
  const nodeInputs: ImportNodeInput[] = [];
  const plannedSourceIds = new Set<string>();
  for (const [index, row] of sourceData.nodeRows.entries()) {
    if (row.id !== undefined && !isUuid(row.id)) {
      warnings.push(`Node "${row.label}": id "${row.id}" is not a uuid — a new id will be generated.`);
    }
    const sourceId = row.id !== undefined && isUuid(row.id) ? row.id : undefined;
    if (sourceId !== undefined) {
      if (liveNodeIds.has(sourceId)) {
        skipped.push({ kind: "node", index, reason: `A node with id ${sourceId} already exists.` });
        continue;
      }
      if (plannedSourceIds.has(sourceId)) {
        skipped.push({ kind: "node", index, reason: `Duplicate node id ${sourceId} in this import.` });
        continue;
      }
      plannedSourceIds.add(sourceId);
    }
    const id = sourceId ?? newId();
    plannedNodes.push({ id, sourceId, label: row.label });
    nodeInputs.push({ id, label: row.label, type: row.type, props: row.props });
  }

  const labelCounts = new Map<string, number>();
  for (const node of plannedNodes) {
    labelCounts.set(node.label, (labelCounts.get(node.label) ?? 0) + 1);
  }
  let ambiguousReported = 0;
  for (const [label, count] of labelCounts) {
    if (count > 1 && ambiguousReported < 5) {
      warnings.push(`Multiple nodes share the label "${label}" — edge references use the first match.`);
      ambiguousReported += 1;
    }
  }

  const byRef = buildRefIndex(plannedNodes, liveNodes);

  // ---- edges: resolve refs, drop self-loops and duplicates ----------------
  const edgeInputs: ImportEdgeInput[] = [];
  const plannedEdgeKeys = new Set<string>();
  for (const [index, row] of sourceData.edgeRows.entries()) {
    const sourceId = byRef.get(row.source) ?? null;
    const targetId = byRef.get(row.target) ?? null;
    if (sourceId === null || targetId === null) {
      const missing = sourceId === null ? row.source : row.target;
      const role = sourceId === null ? "source" : "target";
      skipped.push({
        kind: "edge",
        index,
        reason: `Edge ${role} "${missing}" does not match any node id or label in this import or the graph.`,
      });
      continue;
    }
    if (sourceId === targetId) {
      skipped.push({
        kind: "edge",
        index,
        reason: `Self-loop on "${row.source}" — an edge cannot connect a node to itself.`,
      });
      continue;
    }
    const key = `${sourceId}|${targetId}|${row.type}`;
    if (plannedEdgeKeys.has(key) || liveEdgeKeys.has(key)) {
      skipped.push({
        kind: "edge",
        index,
        reason: `Edge "${row.source}" —${row.type}→ "${row.target}" already exists.`,
      });
      continue;
    }
    plannedEdgeKeys.add(key);
    edgeInputs.push({ sourceId, targetId, type: row.type, props: row.props });
  }

  skipped.push(...sourceData.rowProblems);
  warnings.push(...sourceData.mappingProblems);
  warnings.push(...unknownTypeWarnings(sourceData.nodeRows));

  return { nodes: nodeInputs, edges: edgeInputs, skipped, warnings };
}

/** Build the preview payload the UI renders before committing. */
export function buildImportPreview(
  sourceData: SourceData,
  liveNodes: GraphNode[],
  liveEdges: GraphEdge[],
): ImportPreview {
  const plan = analyzeImport(sourceData, liveNodes, liveEdges);
  return {
    kind: sourceData.kind,
    nodes: {
      count: sourceData.nodeRows.length,
      willCreate: plan.nodes.length,
      headers: sourceData.nodeHeaders,
      sample: plan.nodes.slice(0, 20),
    },
    edges: {
      count: sourceData.edgeRows.length,
      willCreate: plan.edges.length,
      headers: sourceData.edgeHeaders,
      sample: plan.edges.slice(0, 20),
    },
    mapping: { nodes: sourceData.nodeMapping, edges: sourceData.edgeMapping },
    warnings: plan.warnings,
    skipped: plan.skipped,
  };
}