import { neon } from "@neondatabase/serverless";
import { and, desc, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { transitionEdge } from "@/lib/domain/transitions";
import { SIM_AI } from "@/lib/domain/types";
import type {
  ActivityEntry,
  ActivityEntityType,
  GraphEdge,
  GraphNode,
  User,
} from "@/lib/domain/types";
import type { GraphStore } from "./store";
import { GraphError } from "./store";
import { activityLog, edges, nodes, users } from "./schema";
import type { ActivityRow, EdgeRow, NodeRow, UserRow } from "./schema";

/**
 * Postgres GraphStore backed by Drizzle ORM + the Neon serverless driver.
 * Every mutation also appends a full before/after snapshot to activity_log.
 */

function toUser(row: UserRow): User {
  return { id: row.id, name: row.name, role: row.role, color: row.color };
}

function toNode(row: NodeRow): GraphNode {
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    props: row.props ?? {},
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

function toEdge(row: EdgeRow): GraphEdge {
  return {
    id: row.id,
    sourceId: row.sourceId,
    targetId: row.targetId,
    type: row.type,
    props: row.props ?? {},
    status: row.status,
    proposedBy: row.proposedBy,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toActivity(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before ?? null,
    after: row.after ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createDrizzleStore(url: string): GraphStore {
  const db = drizzle(neon(url));

  const insertActivity = async (
    actor: string,
    action: ActivityEntry["action"],
    entityType: ActivityEntityType,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> => {
    await db.insert(activityLog).values({ actor, action, entityType, entityId, before, after });
  };

  const requireUserRow = async (actorId: string): Promise<UserRow> => {
    const [row] = await db.select().from(users).where(eq(users.id, actorId));
    if (!row) throw new GraphError("validation", `Unknown actor "${actorId}".`);
    return row;
  };

  const requireNodeRow = async (id: string): Promise<NodeRow> => {
    const [row] = await db.select().from(nodes).where(eq(nodes.id, id));
    if (!row) throw new GraphError("not_found", `Node "${id}" was not found.`);
    return row;
  };

  const requireEdgeRow = async (id: string): Promise<EdgeRow> => {
    const [row] = await db.select().from(edges).where(eq(edges.id, id));
    if (!row) throw new GraphError("not_found", `Edge "${id}" was not found.`);
    return row;
  };

  const assertAliveNode = async (id: string, role: string): Promise<void> => {
    const [row] = await db.select().from(nodes).where(eq(nodes.id, id));
    if (!row || row.deletedAt) {
      throw new GraphError("validation", `Cannot reference ${role} "${id}": node does not exist or is deleted.`);
    }
  };

  return {
    mode: "postgres",

    async listUsers() {
      const rows = await db.select().from(users);
      return rows.map(toUser).sort((a, b) => a.name.localeCompare(b.name));
    },

    async getUser(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row ? toUser(row) : null;
    },

    async listNodes(includeDeleted = false) {
      const rows = await db.select().from(nodes);
      return rows.map(toNode).filter((node) => includeDeleted || !node.deletedAt);
    },

    async getNode(id) {
      const [row] = await db.select().from(nodes).where(eq(nodes.id, id));
      return row ? toNode(row) : null;
    },

    async createNode(input, actorId) {
      await requireUserRow(actorId);
      const [row] = await db
        .insert(nodes)
        .values({
          label: input.label,
          type: input.type,
          props: input.props ?? {},
          createdBy: actorId,
        })
        .returning();
      const node = toNode(row);
      await insertActivity(actorId, "create", "node", node.id, null, { ...node });
      return node;
    },

    async updateNode(id, patch, actorId) {
      await requireUserRow(actorId);
      const beforeRow = await requireNodeRow(id);
      const before = toNode(beforeRow);
      const [row] = await db
        .update(nodes)
        .set({
          label: patch.label ?? before.label,
          type: patch.type ?? before.type,
          props: patch.props ? { ...before.props, ...patch.props } : before.props,
          updatedAt: new Date(),
        })
        .where(eq(nodes.id, id))
        .returning();
      const updated = toNode(row);
      await insertActivity(actorId, "update", "node", id, { ...before }, { ...updated });
      return updated;
    },

    async softDeleteNode(id, actorId) {
      await requireUserRow(actorId);
      const beforeRow = await requireNodeRow(id);
      const before = toNode(beforeRow);
      if (before.deletedAt) return before;
      const [row] = await db
        .update(nodes)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .returning();
      await insertActivity(actorId, "delete", "node", id, { ...before }, null);
      return toNode(row);
    },

    async restoreNode(id, actorId) {
      await requireUserRow(actorId);
      const beforeRow = await requireNodeRow(id);
      const before = toNode(beforeRow);
      if (!before.deletedAt) return before;
      const [row] = await db
        .update(nodes)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .returning();
      const updated = toNode(row);
      await insertActivity(actorId, "restore", "node", id, { ...before }, { ...updated });
      return updated;
    },

    async listEdges(filter) {
      const rows =
        filter?.status !== undefined
          ? await db.select().from(edges).where(eq(edges.status, filter.status))
          : await db.select().from(edges);
      return rows.map(toEdge);
    },

    async getEdge(id) {
      const [row] = await db.select().from(edges).where(eq(edges.id, id));
      return row ? toEdge(row) : null;
    },

    async createEdge(input, proposedBy) {
      if (proposedBy !== SIM_AI) await requireUserRow(proposedBy);
      await assertAliveNode(input.sourceId, "source");
      await assertAliveNode(input.targetId, "target");
      const [row] = await db
        .insert(edges)
        .values({
          sourceId: input.sourceId,
          targetId: input.targetId,
          type: input.type,
          props: input.props ?? {},
          status: "pending",
          proposedBy,
        })
        .returning();
      const edge = toEdge(row);
      await insertActivity(proposedBy, "propose", "edge", edge.id, null, { ...edge });
      return edge;
    },

    async updateEdge(id, patch, actorId) {
      await requireUserRow(actorId);
      const beforeRow = await requireEdgeRow(id);
      const before = toEdge(beforeRow);
      const changesEndpoints = patch.sourceId !== undefined || patch.targetId !== undefined;
      if (changesEndpoints && before.status !== "pending") {
        throw new GraphError("conflict", "Edge endpoints can only change while the edge is pending.");
      }
      if (patch.sourceId !== undefined) await assertAliveNode(patch.sourceId, "source");
      if (patch.targetId !== undefined) await assertAliveNode(patch.targetId, "target");
      const sourceId = patch.sourceId ?? before.sourceId;
      const targetId = patch.targetId ?? before.targetId;
      if (sourceId === targetId) {
        throw new GraphError("validation", "An edge cannot connect a node to itself.");
      }
      const [row] = await db
        .update(edges)
        .set({
          sourceId,
          targetId,
          type: patch.type ?? before.type,
          props: patch.props ? { ...before.props, ...patch.props } : before.props,
          updatedAt: new Date(),
        })
        .where(eq(edges.id, id))
        .returning();
      const updated = toEdge(row);
      await insertActivity(actorId, "update", "edge", id, { ...before }, { ...updated });
      return updated;
    },

    async reviewEdge(id, action, decidedBy) {
      await requireUserRow(decidedBy);
      const before = toEdge(await requireEdgeRow(id));
      const transition = transitionEdge(before.status, action);
      if (!transition.ok) throw new GraphError("conflict", transition.reason);
      const [row] = await db
        .update(edges)
        .set({ status: transition.status, decidedBy, decidedAt: new Date(), updatedAt: new Date() })
        .where(eq(edges.id, id))
        .returning();
      const updated = toEdge(row);
      await insertActivity(decidedBy, action, "edge", id, { ...before }, { ...updated });
      return updated;
    },

    async retireEdge(id, actorId) {
      await requireUserRow(actorId);
      const before = toEdge(await requireEdgeRow(id));
      const transition = transitionEdge(before.status, "retire");
      if (!transition.ok) throw new GraphError("conflict", transition.reason);
      const [row] = await db
        .update(edges)
        .set({ status: transition.status, updatedAt: new Date() })
        .where(eq(edges.id, id))
        .returning();
      const updated = toEdge(row);
      await insertActivity(actorId, "retire", "edge", id, { ...before }, { ...updated });
      return updated;
    },

    async restoreEdge(id, actorId) {
      await requireUserRow(actorId);
      const before = toEdge(await requireEdgeRow(id));
      const transition = transitionEdge(before.status, "restore");
      if (!transition.ok) throw new GraphError("conflict", transition.reason);
      const [row] = await db
        .update(edges)
        .set({ status: transition.status, decidedBy: null, decidedAt: null, updatedAt: new Date() })
        .where(eq(edges.id, id))
        .returning();
      const updated = toEdge(row);
      await insertActivity(actorId, "restore", "edge", id, { ...before }, { ...updated });
      return updated;
    },

    async listActivity(filter) {
      const conditions: SQL[] = [];
      if (filter?.entityType) conditions.push(eq(activityLog.entityType, filter.entityType));
      if (filter?.entityId) conditions.push(eq(activityLog.entityId, filter.entityId));
      const rows = await db
        .select()
        .from(activityLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(activityLog.createdAt))
        .limit(filter?.limit ?? 100);
      return rows.map(toActivity);
    },
  };
}