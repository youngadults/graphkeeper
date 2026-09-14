import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory";
import { buildSeedGraph } from "@/lib/db/seed-data";
import { GraphError } from "@/lib/db/store";
import { SIM_AI } from "@/lib/domain/types";

const seed = buildSeedGraph();
const ADMIN = seed.users[0].id;
const ANALYST =
  seed.users.find((user) => user.role === "analyst")?.id ?? seed.users[1].id;

function store(): MemoryStore {
  return new MemoryStore(buildSeedGraph());
}

describe("seeded memory store", () => {
  it("loads the demo graph", async () => {
    const s = store();
    expect((await s.listUsers()).length).toBe(12);
    const nodes = await s.listNodes();
    expect(nodes.length).toBe(26);
    const edges = await s.listEdges();
    expect(edges.filter((e) => e.status === "approved").length).toBeGreaterThanOrEqual(25);
    expect(edges.filter((e) => e.status === "pending").length).toBe(18);
    expect(edges.filter((e) => e.status === "rejected").length).toBe(1);
    expect(edges.filter((e) => e.status === "retired").length).toBe(1);
    expect(edges.filter((e) => e.proposedBy === SIM_AI).length).toBeGreaterThan(0);
  });
});

describe("node mutations + activity", () => {
  it("creates a node and logs a create entry with after snapshot", async () => {
    const s = store();
    const node = await s.createNode({ label: "Warehouse", type: "system" }, ADMIN);
    expect(node.createdBy).toBe(ADMIN);
    const log = await s.listActivity({ entityType: "node", entityId: node.id });
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe("create");
    expect(log[0].after?.label).toBe("Warehouse");
    expect(log[0].before).toBeNull();
  });

  it("updates a node and logs before/after", async () => {
    const s = store();
    const node = await s.createNode({ label: "Old", type: "project" }, ADMIN);
    const updated = await s.updateNode(node.id, { label: "New", props: { phase: "beta" } }, ANALYST);
    expect(updated.label).toBe("New");
    const log = await s.listActivity({ entityType: "node", entityId: node.id });
    expect(log[0].action).toBe("update");
    expect(log[0].before?.label).toBe("Old");
    expect(log[0].after?.label).toBe("New");
  });

  it("soft-deletes and restores a node", async () => {
    const s = store();
    const node = await s.createNode({ label: "Temp", type: "system" }, ADMIN);
    await s.softDeleteNode(node.id, ADMIN);
    expect((await s.listNodes()).find((n) => n.id === node.id)).toBeUndefined();
    expect((await s.getNode(node.id))?.deletedAt).toBeTruthy();
    await s.restoreNode(node.id, ADMIN);
    expect((await s.listNodes()).find((n) => n.id === node.id)).toBeTruthy();
    const log = await s.listActivity({ entityType: "node", entityId: node.id });
    expect(log.map((entry) => entry.action)).toEqual(["restore", "delete", "create"]);
  });

  it("rejects unknown actors", async () => {
    const s = store();
    await expect(s.createNode({ label: "X", type: "person" }, "nobody")).rejects.toThrow(GraphError);
  });
});

describe("review state transitions", () => {
  it("approves a pending edge with decision attribution", async () => {
    const s = store();
    const edge = (await s.listEdges({ status: "pending" }))[0];
    const approved = await s.reviewEdge(edge.id, "approve", ANALYST);
    expect(approved.status).toBe("approved");
    expect(approved.decidedBy).toBe(ANALYST);
    expect(approved.decidedAt).toBeTruthy();
    const log = await s.listActivity({ entityType: "edge", entityId: edge.id });
    expect(log[0].action).toBe("approve");
    expect(log[0].before?.status).toBe("pending");
    expect(log[0].after?.status).toBe("approved");
  });

  it("rejects a pending edge", async () => {
    const s = store();
    const edge = (await s.listEdges({ status: "pending" }))[0];
    const rejected = await s.reviewEdge(edge.id, "reject", ADMIN);
    expect(rejected.status).toBe("rejected");
  });

  it("refuses reviewing a non-pending edge (conflict)", async () => {
    const s = store();
    const approved = (await s.listEdges({ status: "approved" }))[0];
    await expect(s.reviewEdge(approved.id, "approve", ADMIN)).rejects.toThrow(GraphError);
    await expect(s.reviewEdge(approved.id, "reject", ADMIN)).rejects.toThrow(GraphError);
  });

  it("retires and restores edges", async () => {
    const s = store();
    const approved = (await s.listEdges({ status: "approved" }))[0];
    const retired = await s.retireEdge(approved.id, ADMIN);
    expect(retired.status).toBe("retired");
    const restored = await s.restoreEdge(approved.id, ADMIN);
    expect(restored.status).toBe("pending");
    expect(restored.decidedBy).toBeNull();
    const log = await s.listActivity({ entityType: "edge", entityId: approved.id });
    const [latest, previous] = log;
    expect(latest?.action).toBe("restore");
    expect(previous?.action).toBe("retire");
    expect(log.every((entry) => ["restore", "retire", "approve", "propose"].includes(entry.action))).toBe(true);
  });
});

describe("edge creation", () => {
  it("creates a pending edge attributed to the proposer", async () => {
    const s = store();
    const nodes = await s.listNodes();
    const edge = await s.createEdge(
      { sourceId: nodes[0].id, targetId: nodes[1].id, type: "works_on" },
      ANALYST,
    );
    expect(edge.status).toBe("pending");
    expect(edge.proposedBy).toBe(ANALYST);
    const log = await s.listActivity({ entityType: "edge", entityId: edge.id });
    expect(log[0].action).toBe("propose");
  });

  it("validates endpoints exist and are alive", async () => {
    const s = store();
    const nodes = await s.listNodes();
    await expect(
      s.createEdge({ sourceId: "00000000-0000-4000-8000-000000009999", targetId: nodes[0].id, type: "uses" }, ADMIN),
    ).rejects.toThrow(GraphError);
    const dead = await s.createNode({ label: "Dead", type: "system" }, ADMIN);
    await s.softDeleteNode(dead.id, ADMIN);
    await expect(
      s.createEdge({ sourceId: dead.id, targetId: nodes[0].id, type: "uses" }, ADMIN),
    ).rejects.toThrow(GraphError);
  });
});