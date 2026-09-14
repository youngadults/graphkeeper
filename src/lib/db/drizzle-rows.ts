import type { ActivityEntry, GraphEdge, GraphNode, User } from "@/lib/domain/types";
import type { ActivityRow, EdgeRow, NodeRow, UserRow } from "./schema";

/**
 * Row -> domain mappers shared by the Drizzle store and the import methods.
 * Timestamps are stored as Date and surfaced as ISO 8601 strings.
 */

export function toUser(row: UserRow): User {
  return { id: row.id, name: row.name, role: row.role, color: row.color };
}

export function toNode(row: NodeRow): GraphNode {
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    props: row.props ?? {},
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    origin: row.origin,
    originRef: row.originRef ?? null,
  };
}

export function toEdge(row: EdgeRow): GraphEdge {
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
    origin: row.origin,
    originRef: row.originRef ?? null,
  };
}

export function toActivity(row: ActivityRow): ActivityEntry {
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