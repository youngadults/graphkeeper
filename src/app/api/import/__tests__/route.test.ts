import { describe, expect, it } from "vitest";
import { POST as PREVIEW } from "@/app/api/import/preview/route";
import { POST as COMMIT } from "@/app/api/import/commit/route";
import { getStore } from "@/lib/db";
import { buildSeedGraph } from "@/lib/db/seed-data";

const seed = buildSeedGraph();
const ADMIN = seed.users.find((user) => user.role === "admin")?.id ?? seed.users[0].id;
const ANALYST = seed.users.find((user) => user.role === "analyst")?.id ?? ADMIN;
const VIEWER = seed.users.find((user) => user.role === "viewer")?.id ?? seed.users[1].id;

const NODES_CSV = "label,type\nGK Import Person,person\nGK Import System,system\n";
const EDGES_CSV = "source,target,type\nGK Import Person,GK Import System,operates\n";
const MAPPING = {
  nodes: { label: "label", type: "type" },
  edges: { source: "source", target: "target", type: "type" },
};

function previewRequest(body: unknown): Request {
  return new Request("http://localhost/api/import/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function commitRequest(actorId: string | null, body: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (actorId !== null) headers["x-gk-actor"] = actorId;
  return new Request("http://localhost/api/import/commit", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/import/preview", () => {
  it("returns counts, inferred mapping, and samples for CSV", async () => {
    const res = await PREVIEW(previewRequest({ source: { nodesCsv: NODES_CSV, edgesCsv: EDGES_CSV } }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      kind: string;
      nodes: { count: number; willCreate: number; mapping?: { label?: string } };
      edges: { willCreate: number; sample: Array<{ type: string }> };
      mapping: { nodes: { label?: string; type?: string }; edges: { source?: string } };
    };
    expect(data.kind).toBe("csv");
    expect(data.nodes.count).toBe(2);
    expect(data.nodes.willCreate).toBe(2);
    expect(data.edges.willCreate).toBe(1);
    expect(data.mapping.nodes.label).toBe("label");
    expect(data.mapping.nodes.type).toBe("type");
    expect(data.mapping.edges.source).toBe("source");
    expect(data.edges.sample[0].type).toBe("operates");
  });

  it("applies the confirmed mapping when provided", async () => {
    const res = await PREVIEW(
      previewRequest({
        source: { nodesCsv: "name,kind\nRenamed,person\n" },
        mapping: { nodes: { label: "name", type: "kind" } },
      }),
    );
    const data = (await res.json()) as { mapping: { nodes: { label?: string } }; nodes: { willCreate: number } };
    expect(data.mapping.nodes.label).toBe("name");
    expect(data.nodes.willCreate).toBe(1);
  });

  it("warns about unknown node types and dangling references", async () => {
    const res = await PREVIEW(
      previewRequest({
        source: {
          nodesCsv: "label,type\nOdd One,widget\n",
          edgesCsv: "source,target,type\nOdd One,Ghost,likes\n",
        },
      }),
    );
    const data = (await res.json()) as {
      warnings: string[];
      skipped: Array<{ kind: string; reason: string }>;
      edges: { willCreate: number };
    };
    expect(data.warnings.some((warning) => warning.includes("Unknown node type"))).toBe(true);
    expect(data.skipped.some((row) => row.reason.includes('"Ghost"'))).toBe(true);
    expect(data.edges.willCreate).toBe(0);
  });

  it("previews graphJson and defaults missing types", async () => {
    const res = await PREVIEW(
      previewRequest({ source: { graphJson: { nodes: [{ label: "GK Json Node" }], edges: [] } } }),
    );
    const data = (await res.json()) as { kind: string; nodes: { sample: Array<{ type: string }> } };
    expect(data.kind).toBe("graph-json");
    expect(data.nodes.sample[0].type).toBe("unknown");
  });

  it("422s beyond the 5000 row cap", async () => {
    const rows = Array.from({ length: 5002 }, (_, i) => `Node ${i},person`).join("\n");
    const res = await PREVIEW(previewRequest({ source: { nodesCsv: `label,type\n${rows}` } }));
    expect(res.status).toBe(422);
  });

  it("rejects an empty source with 422", async () => {
    const res = await PREVIEW(previewRequest({ source: {} }));
    expect(res.status).toBe(422);
  });

  it("reports neutralized formula cells in the preview", async () => {
    const res = await PREVIEW(previewRequest({ source: { nodesCsv: "label,type\n=SUM(A1),person\n" } }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      warnings: string[];
      nodes: { sample: Array<{ label: string }> };
    };
    expect(data.warnings.some((warning) => warning.includes("leading apostrophe"))).toBe(true);
    expect(data.nodes.sample[0]?.label).toBe("'=SUM(A1)");
  });
});

describe("POST /api/import/commit", () => {
  it("rejects viewers with 403", async () => {
    const res = await COMMIT(
      commitRequest(VIEWER, { importId: "viewer-block-01", source: { graphJson: { nodes: [{ label: "X" }] } } }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects an unknown actor with 422 and a missing actor with 400", async () => {
    const unknown = await COMMIT(
      commitRequest(
        "00000000-0000-4000-8000-000000009999",
        { importId: "unknown-actor-01", source: { graphJson: { nodes: [{ label: "X" }] } } },
      ),
    );
    expect(unknown.status).toBe(422);
    const missing = await COMMIT(
      commitRequest(null, { importId: "no-actor-000001", source: { graphJson: { nodes: [{ label: "X" }] } } }),
    );
    expect(missing.status).toBe(400);
  });

  it("creates pending edges with origin and import activity for an analyst", async () => {
    const store = getStore();
    const res = await COMMIT(
      commitRequest(ANALYST, {
        importId: "route-commit-001",
        source: { nodesCsv: NODES_CSV, edgesCsv: EDGES_CSV },
        mapping: MAPPING,
        filename: "route-nodes.csv",
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      duplicate: boolean;
      nodesCreated: number;
      edgesCreated: number;
      origin: string;
    };
    expect(data.duplicate).toBe(false);
    expect(data.nodesCreated).toBe(2);
    expect(data.edgesCreated).toBe(1);
    expect(data.origin).toBe("csv");

    const importedNodes = (await store.listNodes()).filter((node) => node.originRef === "route-nodes.csv");
    expect(importedNodes).toHaveLength(2);
    expect(importedNodes.every((node) => node.origin === "csv")).toBe(true);

    const importedEdges = (await store.listEdges()).filter((edge) => edge.originRef === "route-nodes.csv");
    expect(importedEdges).toHaveLength(1);
    expect(importedEdges[0].status).toBe("pending");
    expect(importedEdges[0].origin).toBe("csv");
    expect(importedEdges[0].proposedBy).toBe(ANALYST);

    const edgeFeed = await store.listActivity({ entityType: "edge", limit: 100 });
    expect(
      edgeFeed.some(
        (entry) => entry.action === "import" && entry.entityId === importedEdges[0].id && entry.actor === ANALYST,
      ),
    ).toBe(true);
    const nodeFeed = await store.listActivity({ entityType: "node", limit: 100 });
    expect(nodeFeed.some((entry) => entry.action === "import")).toBe(true);
  });

  it("is idempotent per importId (retries return the first result)", async () => {
    const body = {
      importId: "route-idem-001",
      source: { graphJson: { nodes: [{ label: "GK Idem Node", type: "person" }], edges: [] } },
    };
    const first = await COMMIT(commitRequest(ADMIN, body));
    expect(first.status).toBe(201);
    const firstData = (await first.json()) as { duplicate: boolean; nodesCreated: number };
    expect(firstData.duplicate).toBe(false);
    expect(firstData.nodesCreated).toBe(1);

    const second = await COMMIT(commitRequest(ADMIN, body));
    expect(second.status).toBe(200);
    const secondData = (await second.json()) as { duplicate: boolean; nodesCreated: number };
    expect(secondData.duplicate).toBe(true);
    expect(secondData.nodesCreated).toBe(1);

    const store = getStore();
    expect((await store.listNodes()).filter((node) => node.label === "GK Idem Node")).toHaveLength(1);
  });

  it("stores formula cells neutralized on commit", async () => {
    const store = getStore();
    const res = await COMMIT(
      commitRequest(ANALYST, {
        importId: "route-formula-01",
        source: { nodesCsv: "label,type\n=SUM(A1),person\n" },
        mapping: { nodes: { label: "label", type: "type" } },
        filename: "formula.csv",
      }),
    );
    expect(res.status).toBe(201);
    const imported = (await store.listNodes()).filter((node) => node.originRef === "formula.csv");
    expect(imported).toHaveLength(1);
    expect(imported[0]?.label).toBe("'=SUM(A1)");
  });

  it("422s an invalid confirmed mapping", async () => {
    const res = await COMMIT(
      commitRequest(ANALYST, {
        importId: "route-badmap-01",
        source: { nodesCsv: NODES_CSV },
        mapping: { nodes: { label: "nope" } },
      }),
    );
    expect(res.status).toBe(422);
  });

  it("422s when a CSV commit lacks a confirmed mapping", async () => {
    const res = await COMMIT(
      commitRequest(ANALYST, { importId: "route-nomap-001", source: { nodesCsv: NODES_CSV } }),
    );
    expect(res.status).toBe(422);
  });

  it("tags graphJson imports with the graph-json origin", async () => {
    const res = await COMMIT(
      commitRequest(ADMIN, {
        importId: "route-graphjson-01",
        source: { graphJson: { nodes: [{ label: "GK Json Node", type: "system", props: { tier: "t1" } }], edges: [] } },
      }),
    );
    const data = (await res.json()) as { origin: string };
    expect(data.origin).toBe("graph-json");
    const node = (await getStore().listNodes()).find((candidate) => candidate.label === "GK Json Node");
    expect(node?.origin).toBe("graph-json");
  });
});