import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_ROWS,
  applyNodeMapping,
  parseSourceData,
  suggestEdgeMapping,
  suggestNodeMapping,
  validateEdgeMapping,
  validateNodeMapping,
} from "@/lib/domain/import-source";
import type { SourceData } from "@/lib/domain/import-source";
import { analyzeImport, buildImportPreview } from "@/lib/domain/import-plan";
import type { GraphEdge, GraphNode } from "@/lib/domain/types";

const UUID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function liveNode(id: string, label: string, type = "person"): GraphNode {
  return {
    id,
    label,
    type,
    props: {},
    createdBy: "user",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    origin: "manual",
    originRef: null,
  };
}

function liveEdge(id: string, sourceId: string, targetId: string, type: string): GraphEdge {
  return {
    id,
    sourceId,
    targetId,
    type,
    props: {},
    status: "approved",
    proposedBy: "user",
    decidedBy: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    origin: "manual",
    originRef: null,
  };
}

const LIVE_NODES = [liveNode(UUID(1), "Ada"), liveNode(UUID(2), "Kafka", "system")];
const LIVE_EDGES = [liveEdge(UUID(9), UUID(1), UUID(2), "uses")];

function emptySource(partial: Partial<SourceData>): SourceData {
  return {
    kind: "graph-json",
    nodeRows: [],
    edgeRows: [],
    nodeHeaders: null,
    edgeHeaders: null,
    nodeMapping: null,
    edgeMapping: null,
    mappingProblems: [],
    rowProblems: [],
    neutralizedCells: 0,
    ...partial,
  };
}

describe("suggestNodeMapping / suggestEdgeMapping", () => {
  it("auto-matches label/type/id headers with synonyms", () => {
    expect(suggestNodeMapping(["employee_name", "node_type", "guid"])).toEqual({
      id: "guid",
      label: "employee_name",
      type: "node_type",
    });
  });

  it("matches source/target/type and leaves leftovers for props", () => {
    expect(suggestEdgeMapping(["from", "to", "relationship", "weight"])).toEqual({
      source: "from",
      target: "to",
      type: "relationship",
    });
  });

  it("consumes claimed headers so no column maps twice", () => {
    expect(suggestNodeMapping(["label", "name"])).toEqual({ id: undefined, label: "label", type: undefined });
  });
});

describe("validateNodeMapping / validateEdgeMapping", () => {
  it("rejects columns that are not in the headers", () => {
    const table = { headers: ["label", "type"], rows: [] };
    expect(validateNodeMapping(table, { label: "label", id: "nope" })).toEqual([
      'Column "nope" (mapped to "id") is not in the CSV headers.',
    ]);
  });

  it("requires label for nodes and source/target/type for edges", () => {
    expect(validateNodeMapping({ headers: ["a"], rows: [] }, {})).toEqual(['The "label" field is required for nodes.']);
    expect(validateEdgeMapping({ headers: ["type"], rows: [] }, { type: "type" })).toEqual([
      'The "source" field is required for edges.',
      'The "target" field is required for edges.',
    ]);
  });
});

describe("applyNodeMapping", () => {
  it("maps rows, defaults types, collects leftover columns as props, and skips label-less rows", () => {
    const table = { headers: ["label", "vendor"], rows: [["Beacon", "acme"], ["", "orph"], ["Kafka", ""]] };
    const applied = applyNodeMapping(table, { label: "label" });
    expect(applied.rows).toEqual([
      { label: "Beacon", type: "unknown", props: { vendor: "acme" } },
      { label: "Kafka", type: "unknown", props: {} },
    ]);
    expect(applied.problems).toEqual([
      { kind: "node", index: 1, reason: "Row has no label value." },
    ]);
  });
});

describe("parseSourceData", () => {
  it("parses CSV with the confirmed mapping", () => {
    const data = parseSourceData(
      "csv",
      { nodesCsv: "label,type\nAda,person" },
      undefined,
      { nodes: { label: "label", type: "type" } },
    );
    expect(data.nodeRows).toEqual([{ label: "Ada", type: "person", props: {} }]);
    expect(data.mappingProblems).toEqual([]);
    expect(data.nodeMapping).toEqual({ label: "label", type: "type" });
  });

  it("falls back to the inferred mapping for previews", () => {
    const data = parseSourceData("csv", { edgesCsv: "source,target,type\nAda,Kafka,uses" }, undefined, undefined);
    expect(data.edgeMapping).toEqual({ source: "source", target: "target", type: "type" });
    expect(data.edgeRows).toHaveLength(1);
  });

  it("reports mapping problems instead of rows for invalid confirmed mappings", () => {
    const data = parseSourceData(
      "csv",
      { nodesCsv: "label,type\nAda,person" },
      undefined,
      { nodes: { label: "name" } },
    );
    expect(data.nodeRows).toEqual([]);
    expect(data.mappingProblems).toEqual(['Column "name" (mapped to "label") is not in the CSV headers.']);
  });

  it("parses graphJson rows and defaults missing types", () => {
    const data = parseSourceData(
      "graph-json",
      {},
      { nodes: [{ label: "  Beacon  ", props: { tier: "t1" } }, { label: "  " }], edges: [] },
      undefined,
    );
    expect(data.nodeRows).toEqual([{ label: "Beacon", type: "unknown", props: { tier: "t1" } }]);
    expect(data.kind).toBe("graph-json");
    expect(MAX_IMPORT_ROWS).toBe(5000);
  });

  it("neutralizes formula cells and reports the count", () => {
    const data = parseSourceData(
      "csv",
      { nodesCsv: "label,type\n=SUM(A1),person\n+1555,person\nplain,person\n" },
      undefined,
      { nodes: { label: "label", type: "type" } },
    );
    expect(data.nodeRows[0]?.label).toBe("'=SUM(A1)");
    expect(data.nodeRows[1]?.label).toBe("'+1555");
    expect(data.nodeRows[2]?.label).toBe("plain");
    expect(data.neutralizedCells).toBe(2);
  });

  it("flags duplicate headers for commit rejection", () => {
    const data = parseSourceData(
      "csv",
      { nodesCsv: "label,type,label\nAda,person,Dup\n" },
      undefined,
      { nodes: { label: "label", type: "type" } },
    );
    expect(data.mappingProblems.some((problem) => problem.includes('Duplicate CSV header(s): label'))).toBe(true);
  });
});

describe("analyzeImport", () => {
  it("creates pending-plan inputs with generated or preserved uuid ids", () => {
    const plan = analyzeImport(
      emptySource({
        nodeRows: [
          { id: UUID(50), label: "Imported", type: "person", props: {} },
          { label: "Generated", type: "system", props: {} },
        ],
      }),
      LIVE_NODES,
      LIVE_EDGES,
    );
    expect(plan.nodes[0]).toEqual({ id: UUID(50), label: "Imported", type: "person", props: {} });
    expect(plan.nodes[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.skipped).toEqual([]);
  });

  it("skips duplicate ids and ids that already exist in the graph", () => {
    const plan = analyzeImport(
      emptySource({
        nodeRows: [
          { id: UUID(50), label: "First", type: "person", props: {} },
          { id: UUID(50), label: "Second", type: "person", props: {} },
          { id: UUID(1), label: "Existing", type: "person", props: {} },
        ],
      }),
      LIVE_NODES,
      LIVE_EDGES,
    );
    expect(plan.nodes).toHaveLength(1);
    expect(plan.skipped.map((row) => row.reason)).toEqual([
      "Duplicate node id 00000000-0000-4000-8000-000000000050 in this import.",
      "A node with id 00000000-0000-4000-8000-000000000001 already exists.",
    ]);
  });

  it("resolves edge references by import id, import label, then live id/label", () => {
    const plan = analyzeImport(
      emptySource({
        nodeRows: [{ id: UUID(50), label: "Imported", type: "person", props: {} }],
        edgeRows: [
          { source: UUID(50), target: "Ada", type: "knows", props: {} },
          { source: "Imported", target: "Kafka", type: "runs", props: {} },
        ],
      }),
      LIVE_NODES,
      LIVE_EDGES,
    );
    expect(plan.edges).toEqual([
      { sourceId: UUID(50), targetId: UUID(1), type: "knows", props: {} },
      { sourceId: UUID(50), targetId: UUID(2), type: "runs", props: {} },
    ]);
  });

  it("skips dangling references, self-loops, and duplicate edges", () => {
    const plan = analyzeImport(
      emptySource({
        nodeRows: [{ label: "Ada Two", type: "person", props: {} }],
        edgeRows: [
          { source: "Ghost", target: "Ada", type: "knows", props: {} },
          { source: "Ada", target: "Ada", type: "knows", props: {} },
          { source: "Ada", target: "Kafka", type: "uses", props: {} },
          { source: "Ada", target: "Kafka", type: "uses", props: {} },
        ],
      }),
      LIVE_NODES,
      LIVE_EDGES,
    );
    expect(plan.edges).toHaveLength(0);
    expect(plan.skipped.map((row) => row.kind)).toEqual(["edge", "edge", "edge", "edge"]);
    expect(plan.skipped[0].reason).toContain('"Ghost"');
    expect(plan.skipped[1].reason).toContain("Self-loop");
    expect(plan.skipped[2].reason).toContain("already exists");
  });

  it("warns about non-uuid ids, ambiguous labels, and unknown types", () => {
    const plan = analyzeImport(
      emptySource({
        nodeRows: [
          { id: "alice", label: "Dup", type: "team", props: {} },
          { label: "Dup", type: "team", props: {} },
        ],
      }),
      LIVE_NODES,
      LIVE_EDGES,
    );
    expect(plan.warnings.some((warning) => warning.includes('"alice" is not a uuid'))).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes('label "Dup"'))).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes('Unknown node type(s): "team"'))).toBe(true);
  });
});

describe("buildImportPreview", () => {
  it("returns parsed counts, samples, mapping, and warnings", () => {
    const preview = buildImportPreview(
      emptySource({
        kind: "csv",
        nodeRows: [
          { label: "A", type: "person", props: {} },
          { label: "B", type: "system", props: {} },
        ],
        edgeRows: [{ source: "A", target: "B", type: "uses", props: {} }],
        nodeHeaders: ["label", "type"],
        nodeMapping: { label: "label", type: "type" },
        edgeMapping: { source: "source", target: "target", type: "type" },
      }),
      LIVE_NODES,
      LIVE_EDGES,
    );
    expect(preview.kind).toBe("csv");
    expect(preview.nodes.count).toBe(2);
    expect(preview.nodes.willCreate).toBe(2);
    expect(preview.edges.willCreate).toBe(1);
    expect(preview.nodes.sample[0].label).toBe("A");
    expect(preview.mapping.nodes).toEqual({ label: "label", type: "type" });
    expect(preview.warnings).toEqual([]);
    expect(preview.skipped).toEqual([]);
  });
});