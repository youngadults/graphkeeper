import { SIM_AI, type ActivityAction, type ActivityEntry, type GraphEdge } from "./types";

/**
 * Maximum number of edges serialized in a graph export. Beyond this the export
 * endpoint refuses with 413 (Too Large) so the payload stays predictable.
 */
export const MAX_EXPORT_EDGES = 50_000;

/**
 * Validation / audit report aggregation for the export endpoints and the graph
 * health panel. Pure functions over store snapshots so the math is unit-testable
 * without a store. Shape mirrors the compliance-evidence style useful for
 * auditing provenance and review cadence (e.g. EU AI Act Article 10).
 */

export interface StatusCounts {
  pending: number;
  approved: number;
  rejected: number;
  retired: number;
}

export interface ProvenanceSplit {
  simAi: number;
  human: number;
}

/** One `approve` or `reject` decision recorded for a day. */
export interface TimelinePoint {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  approvals: number;
  rejections: number;
}

export interface PendingBacklog {
  count: number;
  /** Age of the oldest pending edge in whole days (0 when the queue is empty). */
  oldestPendingAgeDays: number;
  /** ISO timestamp of the oldest pending edge, or null when empty. */
  oldestPendingAt: string | null;
}

export interface GraphReport {
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  countsByStatus: StatusCounts;
  provenance: ProvenanceSplit;
  pendingBacklog: PendingBacklog;
  /** Approvals and rejections per day over the last 30 days. */
  timeline: TimelinePoint[];
}

export const SIM_AI_ACTOR = SIM_AI;

function dayKey(iso: string): string {
  // Local calendar day of the timestamp (server timezone).
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isHumanProposed(edge: GraphEdge): boolean {
  return edge.proposedBy !== SIM_AI;
}

/**
 * Aggregate a graph snapshot into the audit report. `generatedAt` defaults to
 * the current time; pass a fixed value in tests for determinism.
 */
export function buildGraphReport(
  nodes: { id: string }[],
  edges: GraphEdge[],
  activity: ActivityEntry[],
  generatedAt = new Date().toISOString(),
): GraphReport {
  const countsByStatus: StatusCounts = { pending: 0, approved: 0, rejected: 0, retired: 0 };
  let simAi = 0;
  let human = 0;
  let oldestPendingAt: string | null = null;

  for (const edge of edges) {
    countsByStatus[edge.status] += 1;
    if (isHumanProposed(edge)) human += 1;
    else simAi += 1;
    if (edge.status === "pending" && (oldestPendingAt === null || edge.createdAt < oldestPendingAt)) {
      oldestPendingAt = edge.createdAt;
    }
  }

  const pendingCount = countsByStatus.pending;
  const oldestPendingAgeDays =
    pendingCount === 0 || oldestPendingAt === null
      ? 0
      : Math.floor(
          Math.max(0, new Date(generatedAt).getTime() - new Date(oldestPendingAt).getTime()) / 86_400_000,
        );

  // Approval timeline over the last 30 calendar days, built from the activity
  // log (authoritative decision lineage).
  const bucket = new Map<string, TimelinePoint>();
  const now = new Date(generatedAt);
  for (let i = 0; i < 30; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = dayKey(date.toISOString());
    bucket.set(key, { date: key, approvals: 0, rejections: 0 });
  }

  const decisionActions: ReadonlySet<ActivityAction> = new Set(["approve", "reject"]);
  for (const entry of activity) {
    if (!decisionActions.has(entry.action)) continue;
    const key = dayKey(entry.createdAt);
    const point = bucket.get(key);
    if (!point) continue; // outside the last 30 days
    if (entry.action === "approve") point.approvals += 1;
    else point.rejections += 1;
  }
  // Chronological (oldest → newest).
  const timeline = [...bucket.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    generatedAt,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    countsByStatus,
    provenance: { simAi, human },
    pendingBacklog: {
      count: pendingCount,
      oldestPendingAgeDays,
      oldestPendingAt,
    },
    timeline,
  };
}
