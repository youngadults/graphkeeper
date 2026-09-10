import { SIM_AI } from "@/lib/domain/types";
import type { ActivityAction, ActivityEntityType, EdgeStatus, UserRole } from "@/lib/domain/types";
import {
  SEED_APPROVED_EDGES,
  SEED_PEOPLE,
  SEED_PENDING_EDGES,
  SEED_PROJECTS,
  SEED_SYSTEMS,
} from "./seed-content";

/**
 * Builds the demo graph: 12 people, 8 projects, 6 systems (~26 nodes),
 * ~28 approved edges, 18 pending simulated-AI proposals, one rejected and
 * one retired edge for status variety, and a rich activity log.
 */

export interface SeedUser {
  id: string;
  name: string;
  role: UserRole;
  color: string;
}

export interface SeedNode {
  id: string;
  label: string;
  type: string;
  props: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SeedEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  props: Record<string, unknown>;
  status: EdgeStatus;
  proposedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeedActivity {
  id: string;
  actor: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface SeedGraph {
  users: SeedUser[];
  nodes: SeedNode[];
  edges: SeedEdge[];
  activity: SeedActivity[];
}

/** Deterministic uuid derived from a sequence number. */
function uid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

const DAY_MS = 86_400_000;

export function buildSeedGraph(now = Date.now()): SeedGraph {
  const at = (daysAgo: number, minutesAgo = 0): string =>
    new Date(now - daysAgo * DAY_MS - minutesAgo * 60_000).toISOString();

  const adminId = uid(1);

  // ---- users -------------------------------------------------------------
  const users: SeedUser[] = SEED_PEOPLE.map((person, i) => ({
    id: uid(1 + i),
    name: person.name,
    role: person.role,
    color: person.color,
  }));
  const personId = (i: number): string => uid(101 + i);
  const userId = (i: number): string => uid(i); // 1-based person index -> user id

  // ---- nodes -------------------------------------------------------------
  const nodes: SeedNode[] = [];
  SEED_PEOPLE.forEach((person, i) => {
    nodes.push({
      id: personId(i + 1),
      label: person.name,
      type: "person",
      props: { title: person.title },
      createdBy: adminId,
      createdAt: at(30, (SEED_PEOPLE.length - i) * 7),
      updatedAt: at(30, (SEED_PEOPLE.length - i) * 7),
      deletedAt: null,
    });
  });
  SEED_PROJECTS.forEach((project, i) => {
    nodes.push({
      id: uid(201 + i),
      label: project.name,
      type: "project",
      props: { phase: project.phase, started: project.started },
      createdBy: adminId,
      createdAt: at(29, (SEED_PROJECTS.length - i) * 9),
      updatedAt: at(29, (SEED_PROJECTS.length - i) * 9),
      deletedAt: null,
    });
  });
  SEED_SYSTEMS.forEach((system, i) => {
    nodes.push({
      id: uid(301 + i),
      label: system.name,
      type: "system",
      props: { vendor: system.vendor, tier: system.tier },
      createdBy: adminId,
      createdAt: at(28, (SEED_SYSTEMS.length - i) * 11),
      updatedAt: at(28, (SEED_SYSTEMS.length - i) * 11),
      deletedAt: null,
    });
  });

  const resolveRef = (ref: string): string => {
    const [kind, index] = ref.split(":");
    const n = Number(index);
    if (kind === "p") return personId(n);
    if (kind === "pr") return uid(200 + n);
    if (kind === "sy") return uid(300 + n);
    throw new Error(`Unknown seed ref: ${ref}`);
  };

  // ---- edges -------------------------------------------------------------
  const edges: SeedEdge[] = [];
  let edgeSeq = 0;
  const addEdge = (
    sourceRef: string,
    type: string,
    targetRef: string,
    status: EdgeStatus,
    props: Record<string, unknown>,
    createdAt: string,
    decidedBy: string | null,
    decidedAt: string | null,
  ): SeedEdge => {
    const edge: SeedEdge = {
      id: uid(400 + ++edgeSeq),
      sourceId: resolveRef(sourceRef),
      targetId: resolveRef(targetRef),
      type,
      props,
      status,
      proposedBy: SIM_AI,
      decidedBy,
      decidedAt,
      createdAt,
      updatedAt: decidedAt ?? createdAt,
    };
    edges.push(edge);
    return edge;
  };

  const approvedEdges = SEED_APPROVED_EDGES.map((tuple, i) => {
    const [source, type, target, props] = tuple;
    const createdAt = at(22 - i * 0.35);
    return addEdge(source, type, target, "approved", props ?? {}, createdAt, adminId, at(21.5 - i * 0.35));
  });

  const pendingEdges = SEED_PENDING_EDGES.map((tuple, i) => {
    const [source, type, target, confidence, rationale] = tuple;
    return addEdge(
      source,
      type,
      target,
      "pending",
      { confidence: Number(confidence.toFixed(2)), rationale },
      at(5.5 - i * 0.25),
      null,
      null,
    );
  });

  // One rejected proposal (low confidence, human said no)…
  const rejectedEdge = addEdge(
    "pr:8",
    "depends_on",
    "pr:7",
    "rejected",
    { confidence: 0.41, rationale: "Beacon load spikes correlate with Pulse incidents." },
    at(7.4),
    userId(1),
    at(7),
  );
  // …and one retired relationship (approved once, later removed).
  const retiredEdge = addEdge(
    "pr:4",
    "depends_on",
    "sy:5",
    "retired",
    { since: "2025-03" },
    at(16),
    adminId,
    at(15.5),
  );

  // ---- activity log ------------------------------------------------------
  const activity: SeedActivity[] = [];
  let actSeq = 0;
  const addAct = (
    actor: string,
    action: ActivityAction,
    entityType: ActivityEntityType,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    createdAt: string,
  ): void => {
    activity.push({ id: uid(1000 + ++actSeq), actor, action, entityType, entityId, before, after, createdAt });
  };
  const nodeSnapshot = (node: SeedNode): Record<string, unknown> => ({
    label: node.label,
    type: node.type,
    props: node.props,
  });
  const edgeSnapshot = (edge: SeedEdge): Record<string, unknown> => ({
    type: edge.type,
    status: edge.status,
    props: edge.props,
  });

  // The Beacon project was renamed after import — keep its create snapshot coherent.
  const beacon = nodes.find((node) => node.label === "Beacon");

  // Nodes were imported by the admin.
  nodes.forEach((node) => {
    const snapshot =
      beacon && node.id === beacon.id
        ? { ...nodeSnapshot(node), label: "Beacon Marketing Site" }
        : nodeSnapshot(node);
    addAct(adminId, "create", "node", node.id, null, snapshot, node.createdAt);
  });

  // The first six approved edges show full propose -> approve lineage.
  approvedEdges.forEach((edge, i) => {
    if (i < 6) {
      addAct(SIM_AI, "propose", "edge", edge.id, null, edgeSnapshot(edge), edge.createdAt);
    }
    addAct(adminId, "approve", "edge", edge.id, { status: "pending" }, { status: "approved" }, edge.decidedAt ?? edge.createdAt);
  });

  // Rejected edge lineage.
  addAct(SIM_AI, "propose", "edge", rejectedEdge.id, null, edgeSnapshot(rejectedEdge), rejectedEdge.createdAt);
  addAct(adminId, "reject", "edge", rejectedEdge.id, { status: "pending" }, { status: "rejected" }, rejectedEdge.decidedAt ?? at(7));

  // Retired edge lineage: approved, then removed by the platform engineer.
  addAct(adminId, "approve", "edge", retiredEdge.id, { status: "pending" }, { status: "approved" }, at(15.5));
  addAct(userId(6), "delete", "edge", retiredEdge.id, { status: "approved" }, { status: "retired" }, at(6));

  // Pending proposals entered the queue via the simulated AI.
  pendingEdges.forEach((edge) => {
    addAct(SIM_AI, "propose", "edge", edge.id, null, edgeSnapshot(edge), edge.createdAt);
  });

  // A human renamed the Beacon project after import — demo `update` lineage.
  if (beacon) {
    addAct(
      userId(5),
      "update",
      "node",
      beacon.id,
      { label: "Beacon Marketing Site", type: "project" },
      { label: "Beacon", type: "project" },
      at(3),
    );
  }

  return { users, nodes, edges, activity };
}