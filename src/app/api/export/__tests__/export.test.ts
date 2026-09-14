import { afterEach, describe, expect, it } from "vitest";
import { GET as exportGraphGET } from "@/app/api/export/graph/route";
import { GET as exportReportGET } from "@/app/api/export/report/route";
import { buildSeedGraph } from "@/lib/db/seed-data";
import { MAX_EXPORT_EDGES } from "@/lib/domain/report";
import { SIM_AI } from "@/lib/domain/types";
import type { GraphEdge } from "@/lib/domain/types";
import type { GraphStore } from "@/lib/db/store";

const SEED = buildSeedGraph();

function seedRequest(url = "http://localhost/api/export/graph"): Request {
  return new Request(url, { method: "GET" });
}

/** Inject a fake store (satisfying the slice the route uses) for cap tests. */
function injectStore(edges: GraphEdge[]) {
  const store = {
    mode: "memory" as const,
    listNodes: async () => [], // routes call listNodes(true) — slice is untyped, cast below
  } as unknown as GraphStore;
  // The route uses listNodes(true), listEdges(), listActivity(limit). Provide them.
  const full = {
    ...store,
    listNodes: async () => [],
    listEdges: async () => edges,
    listActivity: async () => [],
  } as unknown as GraphStore;
  (globalThis as Record<string, unknown>)["__graphKeeperStore"] = full;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)["__graphKeeperStore"];
});

describe("GET /api/export/graph", () => {
  const makeEdge = (id: string): GraphEdge => ({
    id,
    sourceId: "00000000-0000-4000-8000-000000000001",
    targetId: "00000000-0000-4000-8000-000000000002",
    type: "related_to",
    props: {},
    status: "pending",
    proposedBy: SIM_AI,
    decidedBy: null,
    decidedAt: null,
    origin: "sim-ai",
    originRef: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it("returns a full node+edge snapshot with all expected fields", async () => {
    const res = await exportGraphGET(seedRequest());
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      nodes: Array<{ label: string; type: string; createdAt: string }>;
      edges: Array<{ status: string; proposedBy: string; decidedBy: string | null; decidedAt: string | null; createdAt: string }>;
      activity?: unknown;
    };
    expect(data.nodes.length).toBeGreaterThan(0);
    for (const node of data.nodes) {
      expect(node).toHaveProperty("label");
      expect(node).toHaveProperty("type");
      expect(node).toHaveProperty("createdAt");
    }
    expect(data.edges.length).toBeGreaterThan(0);
    for (const edge of data.edges) {
      expect(edge).toHaveProperty("status");
      expect(edge).toHaveProperty("proposedBy");
      expect(edge).toHaveProperty("decidedBy");
      expect(edge).toHaveProperty("decidedAt");
      expect(edge).toHaveProperty("createdAt");
    }
    // By default no activity is embedded.
    expect(data.activity).toBeUndefined();
  });

  it("embeds the full activity log with ?include=activity", async () => {
    const res = await exportGraphGET(seedRequest("http://localhost/api/export/graph?include=activity"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { activity?: Array<{ action: string; createdAt: string }> };
    expect(Array.isArray(data.activity)).toBe(true);
    expect(data.activity!.length).toBeGreaterThan(0);
    for (const entry of data.activity!) {
      expect(entry).toHaveProperty("action");
      expect(entry).toHaveProperty("createdAt");
    }
  });

  it("rejects an invalid include value with 422", async () => {
    const res = await exportGraphGET(seedRequest("http://localhost/api/export/graph?include=nodes"));
    expect(res.status).toBe(422);
  });

  it("is read-only — works without an actor header (all roles may export)", async () => {
    const res = await exportGraphGET(seedRequest());
    expect(res.status).toBe(200);
  });

  it("returns 413 when the edge count exceeds the cap", async () => {
    const tooMany = Array.from({ length: MAX_EXPORT_EDGES + 1 }, (_, i) => makeEdge(`edge-${i}`));
    injectStore(tooMany);
    const res = await exportGraphGET(seedRequest());
    expect(res.status).toBe(413);
  });
});

describe("GET /api/export/report", () => {
  it("returns the compliance report shape", async () => {
    const res = await exportReportGET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      generatedAt: string;
      nodeCount: number;
      edgeCount: number;
      countsByStatus: Record<string, number>;
      provenance: Record<string, number>;
      pendingBacklog: { count: number; oldestPendingAgeDays: number };
      timeline: Array<{ date: string; approvals: number; rejections: number }>;
    };
    expect(typeof data.generatedAt).toBe("string");
    expect(data.nodeCount).toBe(SEED.nodes.length);
    expect(data.edgeCount).toBe(SEED.edges.length);
    const statusKeys = ["pending", "approved", "rejected", "retired"];
    for (const key of statusKeys) {
      expect(typeof data.countsByStatus[key]).toBe("number");
    }
    expect(Object.values(data.provenance).reduce((a, b) => a + b, 0)).toBe(SEED.edges.length);
    expect(Object.keys(data.provenance).sort()).toEqual(["csv", "graph-json", "manual", "sim-ai"]);
    expect(data.pendingBacklog.count).toBeGreaterThan(0);
    expect(Array.isArray(data.timeline)).toBe(true);
    expect(data.timeline.length).toBe(30);
  });
});
