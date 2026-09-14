import { describe, expect, it } from "vitest";
import { buildGraphReport } from "@/lib/domain/report";
import { buildSeedGraph } from "@/lib/db/seed-data";
import { SIM_AI } from "@/lib/domain/types";
import type { ActivityAction, GraphEdge } from "@/lib/domain/types";

/** Deterministic 30-day-old ISO timestamp used to make backlog math stable. */
const DAY_MS = 86_400_000;
const fixedNow = new Date("2026-03-10T12:00:00.000Z").toISOString();

function edge(overrides: Partial<GraphEdge> & { id: string; createdAt: string; proposedBy: string }): GraphEdge {
  return {
    sourceId: "00000000-0000-4000-8000-000000000001",
    targetId: "00000000-0000-4000-8000-000000000002",
    type: "related_to",
    props: {},
    status: "approved",
    decidedBy: null,
    decidedAt: null,
    origin: "manual",
    originRef: null,
    updatedAt: overrides.createdAt,
    ...overrides,
  };
}

describe("buildGraphReport", () => {
  it("counts nodes and edges, and buckets by status", () => {
    const edges = [
      edge({ id: "1", status: "approved", proposedBy: SIM_AI, createdAt: fixedNow }),
      edge({ id: "2", status: "pending", proposedBy: "user-a", createdAt: fixedNow }),
      edge({ id: "3", status: "rejected", proposedBy: "user-a", createdAt: fixedNow }),
      edge({ id: "4", status: "retired", proposedBy: SIM_AI, createdAt: fixedNow }),
      edge({ id: "5", status: "pending", proposedBy: "user-a", createdAt: fixedNow }),
    ];
    const report = buildGraphReport([{ id: "n1" }, { id: "n2" }], edges, [], fixedNow);

    expect(report.nodeCount).toBe(2);
    expect(report.edgeCount).toBe(5);
    expect(report.countsByStatus).toEqual({
      pending: 2,
      approved: 1,
      rejected: 1,
      retired: 1,
    });
    expect(report.generatedAt).toBe(fixedNow);
  });

  it("splits provenance by proposed_by (sim-ai vs human)", () => {
    const edges = [
      edge({ id: "1", status: "pending", proposedBy: SIM_AI, createdAt: fixedNow }),
      edge({ id: "2", status: "pending", proposedBy: "user-a", createdAt: fixedNow }),
      edge({ id: "3", status: "pending", proposedBy: "user-b", createdAt: fixedNow }),
    ];
    const report = buildGraphReport([], edges, [], fixedNow);
    expect(report.provenance).toEqual({ simAi: 1, human: 2 });
  });

  it("reports pending backlog count and oldest pending age in days", () => {
    const oldest = new Date(Date.parse(fixedNow) - 5 * DAY_MS).toISOString();
    const edges = [
      edge({ id: "1", status: "pending", proposedBy: SIM_AI, createdAt: oldest }),
      edge({
        id: "2",
        status: "pending",
        proposedBy: "user-a",
        createdAt: new Date(Date.parse(fixedNow) - 1 * DAY_MS).toISOString(),
      }),
      edge({ id: "3", status: "approved", proposedBy: "user-a", createdAt: fixedNow }),
    ];
    const report = buildGraphReport([], edges, [], fixedNow);
    expect(report.pendingBacklog.count).toBe(2);
    expect(report.pendingBacklog.oldestPendingAt).toBe(oldest);
    expect(report.pendingBacklog.oldestPendingAgeDays).toBe(5);
  });

  it("reports zero backlog age when there are no pending edges", () => {
    const edges = [edge({ id: "1", status: "approved", proposedBy: SIM_AI, createdAt: fixedNow })];
    const report = buildGraphReport([], edges, [], fixedNow);
    expect(report.pendingBacklog).toEqual({
      count: 0,
      oldestPendingAgeDays: 0,
      oldestPendingAt: null,
    });
  });

  it("aggregates approvals/rejections into a 30-day timeline, newest last", () => {
    const day0 = fixedNow;
    const day1 = new Date(Date.parse(fixedNow) - 1 * DAY_MS).toISOString();
    const activity = [
      { action: "approve" as ActivityAction, createdAt: day0 },
      { action: "approve" as ActivityAction, createdAt: day0 },
      { action: "reject" as ActivityAction, createdAt: day1 },
      { action: "propose" as ActivityAction, createdAt: day0 }, // ignored: not a decision
      { action: "update" as ActivityAction, createdAt: day0 }, // ignored
    ].map((entry, i) => ({
      id: `a${i}`,
      actor: "user-a",
      entityType: "edge" as const,
      entityId: "e1",
      before: null,
      after: null,
      ...entry,
    }));

    const report = buildGraphReport([], [], activity, fixedNow);
    expect(report.timeline.length).toBe(30);
    const latest = report.timeline[report.timeline.length - 1];
    expect(latest.approvals).toBe(2);
    const yesterday = report.timeline[report.timeline.length - 2];
    expect(yesterday.rejections).toBe(1);
  });

  it("matches seed snapshot invariants (sanity against demo data)", () => {
    const seed = buildSeedGraph();
    const report = buildGraphReport(seed.nodes, seed.edges, seed.activity);
    expect(report.nodeCount).toBe(seed.nodes.length);
    expect(report.edgeCount).toBe(seed.edges.length);
    const statusSum = Object.values(report.countsByStatus).reduce((a, b) => a + b, 0);
    expect(statusSum).toBe(seed.edges.length);
    expect(report.provenance.simAi + report.provenance.human).toBe(seed.edges.length);
  });
});
