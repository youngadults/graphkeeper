import { transitionEdge } from "@/lib/domain/transitions";
import { SIM_AI } from "@/lib/domain/types";
import type {
  ActivityEntry,
  ActivityEntityType,
  EdgeStatus,
  GraphEdge,
  GraphNode,
  User,
} from "@/lib/domain/types";
import type {
  ActivityFilter,
  CreateEdgeInput,
  CreateNodeInput,
  GraphStore,
  UpdateEdgeInput,
  UpdateNodeInput,
} from "./store";
import { GraphError } from "./store";
import type { SeedGraph } from "./seed-data";

/**
 * In-memory GraphStore used when POSTGRES_URL is not configured. Gives every
 * clone an instantly explorable seeded demo graph; data resets on restart.
 */
export class MemoryStore implements GraphStore {
  readonly mode = "memory" as const;

  private users: Map<string, User>;
  private nodes: Map<string, GraphNode>;
  private edges: Map<string, GraphEdge>;
  private activity: ActivityEntry[] = [];

  constructor(seed?: SeedGraph) {
    this.users = new Map();
    this.nodes = new Map();
    this.edges = new Map();
    if (seed) {
      for (const user of seed.users) this.users.set(user.id, { ...user });
      for (const node of seed.nodes) this.nodes.set(node.id, { ...node, props: { ...node.props } });
      for (const edge of seed.edges) this.edges.set(edge.id, { ...edge, props: { ...edge.props } });
      this.activity = seed.activity.map((entry) => ({ ...entry }));
    }
  }

  private newId(): string {
    return crypto.randomUUID();
  }

  private now(): string {
    return new Date().toISOString();
  }

  private appendActivity(
    actor: string,
    action: ActivityEntry["action"],
    entityType: ActivityEntityType,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): ActivityEntry {
    const entry: ActivityEntry = {
      id: this.newId(),
      actor,
      action,
      entityType,
      entityId,
      before,
      after,
      createdAt: this.now(),
    };
    this.activity.push(entry);
    return entry;
  }

  private requireUser(actorId: string): User {
    const user = this.users.get(actorId);
    if (!user) throw new GraphError("validation", `Unknown actor "${actorId}".`);
    return user;
  }

  private requireNode(id: string): GraphNode {
    const node = this.nodes.get(id);
    if (!node) throw new GraphError("not_found", `Node "${id}" was not found.`);
    return node;
  }

  private requireEdge(id: string): GraphEdge {
    const edge = this.edges.get(id);
    if (!edge) throw new GraphError("not_found", `Edge "${id}" was not found.`);
    return edge;
  }

  private assertAliveNode(id: string, role: string): void {
    const node = this.nodes.get(id);
    if (!node || node.deletedAt) {
      throw new GraphError("validation", `Cannot reference ${role} "${id}": node does not exist or is deleted.`);
    }
  }

  // ---- users -------------------------------------------------------------

  async listUsers(): Promise<User[]> {
    return [...this.users.values()];
  }

  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  // ---- nodes -------------------------------------------------------------

  async listNodes(includeDeleted = false): Promise<GraphNode[]> {
    return [...this.nodes.values()].filter((node) => includeDeleted || !node.deletedAt);
  }

  async getNode(id: string): Promise<GraphNode | null> {
    return this.nodes.get(id) ?? null;
  }

  async createNode(input: CreateNodeInput, actorId: string): Promise<GraphNode> {
    this.requireUser(actorId);
    const now = this.now();
    const node: GraphNode = {
      id: this.newId(),
      label: input.label,
      type: input.type,
      props: { ...(input.props ?? {}) },
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.nodes.set(node.id, node);
    this.appendActivity(actorId, "create", "node", node.id, null, { ...node });
    return { ...node };
  }

  async updateNode(id: string, patch: UpdateNodeInput, actorId: string): Promise<GraphNode> {
    this.requireUser(actorId);
    const before = { ...this.requireNode(id) };
    const updated: GraphNode = {
      ...before,
      label: patch.label ?? before.label,
      type: patch.type ?? before.type,
      props: patch.props ? { ...before.props, ...patch.props } : before.props,
      updatedAt: this.now(),
    };
    this.nodes.set(id, updated);
    this.appendActivity(actorId, "update", "node", id, { ...before }, { ...updated });
    return { ...updated };
  }

  async softDeleteNode(id: string, actorId: string): Promise<GraphNode> {
    this.requireUser(actorId);
    const before = { ...this.requireNode(id) };
    const updated: GraphNode = { ...before, deletedAt: this.now(), updatedAt: this.now() };
    this.nodes.set(id, updated);
    this.appendActivity(actorId, "delete", "node", id, { ...before }, null);
    return { ...updated };
  }

  async restoreNode(id: string, actorId: string): Promise<GraphNode> {
    this.requireUser(actorId);
    const before = { ...this.requireNode(id) };
    if (!before.deletedAt) return { ...before };
    const updated: GraphNode = { ...before, deletedAt: null, updatedAt: this.now() };
    this.nodes.set(id, updated);
    this.appendActivity(actorId, "restore", "node", id, { ...before }, { ...updated });
    return { ...updated };
  }

  // ---- edges -------------------------------------------------------------

  async listEdges(filter?: { status?: EdgeStatus }): Promise<GraphEdge[]> {
    return [...this.edges.values()].filter((edge) => !filter?.status || edge.status === filter.status);
  }

  async getEdge(id: string): Promise<GraphEdge | null> {
    return this.edges.get(id) ?? null;
  }

  async createEdge(input: CreateEdgeInput, proposedBy: string): Promise<GraphEdge> {
    if (proposedBy !== SIM_AI) this.requireUser(proposedBy);
    this.assertAliveNode(input.sourceId, "source");
    this.assertAliveNode(input.targetId, "target");
    const now = this.now();
    const edge: GraphEdge = {
      id: this.newId(),
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
      props: { ...(input.props ?? {}) },
      status: "pending",
      proposedBy,
      decidedBy: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.edges.set(edge.id, edge);
    this.appendActivity(proposedBy, "propose", "edge", edge.id, null, { ...edge });
    return { ...edge };
  }

  async updateEdge(id: string, patch: UpdateEdgeInput, actorId: string): Promise<GraphEdge> {
    this.requireUser(actorId);
    const before = { ...this.requireEdge(id) };
    const changesEndpoints = patch.sourceId !== undefined || patch.targetId !== undefined;
    if (changesEndpoints && before.status !== "pending") {
      throw new GraphError("conflict", "Edge endpoints can only change while the edge is pending.");
    }
    if (patch.sourceId !== undefined) this.assertAliveNode(patch.sourceId, "source");
    if (patch.targetId !== undefined) this.assertAliveNode(patch.targetId, "target");
    const sourceId = patch.sourceId ?? before.sourceId;
    const targetId = patch.targetId ?? before.targetId;
    if (sourceId === targetId) {
      throw new GraphError("validation", "An edge cannot connect a node to itself.");
    }
    const updated: GraphEdge = {
      ...before,
      sourceId,
      targetId,
      type: patch.type ?? before.type,
      props: patch.props ? { ...before.props, ...patch.props } : before.props,
      updatedAt: this.now(),
    };
    this.edges.set(id, updated);
    this.appendActivity(actorId, "update", "edge", id, { ...before }, { ...updated });
    return { ...updated };
  }

  async reviewEdge(id: string, action: "approve" | "reject", decidedBy: string): Promise<GraphEdge> {
    this.requireUser(decidedBy);
    const before = { ...this.requireEdge(id) };
    const transition = transitionEdge(before.status, action);
    if (!transition.ok) throw new GraphError("conflict", transition.reason);
    const updated: GraphEdge = {
      ...before,
      status: transition.status,
      decidedBy,
      decidedAt: this.now(),
      updatedAt: this.now(),
    };
    this.edges.set(id, updated);
    this.appendActivity(decidedBy, action, "edge", id, { ...before }, { ...updated });
    return { ...updated };
  }

  async retireEdge(id: string, actorId: string): Promise<GraphEdge> {
    this.requireUser(actorId);
    const before = { ...this.requireEdge(id) };
    const transition = transitionEdge(before.status, "retire");
    if (!transition.ok) throw new GraphError("conflict", transition.reason);
    const updated: GraphEdge = { ...before, status: transition.status, updatedAt: this.now() };
    this.edges.set(id, updated);
    this.appendActivity(actorId, "delete", "edge", id, { ...before }, { ...updated });
    return { ...updated };
  }

  async restoreEdge(id: string, actorId: string): Promise<GraphEdge> {
    this.requireUser(actorId);
    const before = { ...this.requireEdge(id) };
    const transition = transitionEdge(before.status, "restore");
    if (!transition.ok) throw new GraphError("conflict", transition.reason);
    const updated: GraphEdge = {
      ...before,
      status: transition.status,
      decidedBy: null,
      decidedAt: null,
      updatedAt: this.now(),
    };
    this.edges.set(id, updated);
    this.appendActivity(actorId, "restore", "edge", id, { ...before }, { ...updated });
    return { ...updated };
  }

  // ---- activity ----------------------------------------------------------

  async listActivity(filter?: ActivityFilter): Promise<ActivityEntry[]> {
    const entries = this.activity
      .filter(
        (entry) =>
          (!filter?.entityType || entry.entityType === filter.entityType) &&
          (!filter?.entityId || entry.entityId === filter.entityId),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const limit = filter?.limit ?? 100;
    return entries.slice(0, limit).map((entry) => ({ ...entry }));
  }
}