/**
 * Core domain types for GraphKeeper.
 *
 * These are the serializable shapes used across the API, the stores, and the
 * UI. Timestamps are ISO 8601 strings; `props` are free-form JSON objects.
 */

export const USER_ROLES = ["viewer", "analyst", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EDGE_STATUSES = ["pending", "approved", "rejected", "retired"] as const;
export type EdgeStatus = (typeof EDGE_STATUSES)[number];

export const ACTIVITY_ACTIONS = [
  "create",
  "update",
  "delete",
  "approve",
  "reject",
  "propose",
  "retire",
  "restore",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ENTITY_TYPES = ["node", "edge"] as const;
export type ActivityEntityType = (typeof ENTITY_TYPES)[number];

/** Edges proposed by the simulated AI use this sentinel actor id. */
export const SIM_AI = "sim-ai";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  color: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  props: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Soft-delete flag: set when the node is deleted, null while alive. */
  deletedAt: string | null;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  props: Record<string, unknown>;
  status: EdgeStatus;
  /** User id or the `sim-ai` sentinel. */
  proposedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEntry {
  id: string;
  actor: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Canvas fill colors for known node types; unknown types fall back to gray. */
export const NODE_TYPE_COLORS: Record<string, string> = {
  person: "#2563eb",
  project: "#d97706",
  system: "#7c3aed",
};

export const UNKNOWN_TYPE_COLOR = "#64748b";

export function nodeColor(type: string): string {
  return NODE_TYPE_COLORS[type] ?? UNKNOWN_TYPE_COLOR;
}