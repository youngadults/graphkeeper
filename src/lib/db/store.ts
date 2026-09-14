import type {
  ActivityEntry,
  ActivityEntityType,
  EdgeOrigin,
  EdgeStatus,
  GraphEdge,
  GraphNode,
  User,
} from "@/lib/domain/types";

/** Error codes map onto HTTP statuses in `lib/api/http.ts`. */
export type GraphErrorCode =
  | "validation"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable";

export class GraphError extends Error {
  readonly code: GraphErrorCode;

  constructor(code: GraphErrorCode, message: string) {
    super(message);
    this.name = "GraphError";
    this.code = code;
  }
}

export interface CreateNodeInput {
  label: string;
  type: string;
  props?: Record<string, unknown>;
}

export interface UpdateNodeInput {
  label?: string;
  type?: string;
  props?: Record<string, unknown>;
}

export interface CreateEdgeInput {
  sourceId: string;
  targetId: string;
  type: string;
  props?: Record<string, unknown>;
}

/** One node row of a bulk import; `id` is the pre-assigned uuid to insert. */
export interface ImportNodeInput {
  id: string;
  label: string;
  type: string;
  props?: Record<string, unknown>;
}

/** One edge row of a bulk import; endpoints are pre-resolved node uuids. */
export interface ImportEdgeInput {
  sourceId: string;
  targetId: string;
  type: string;
  props?: Record<string, unknown>;
}

/** Origin context stamped onto every row of one import run. */
export interface ImportContext {
  actorId: string;
  origin: EdgeOrigin;
  originRef: string | null;
}

  /** Ledger row for an accepted bulk import — powers importId idempotency. */
export interface ImportRecord {
  importId: string;
  actor: string;
  source: "csv" | "graph-json";
  filename: string | null;
  nodeCount: number;
  edgeCount: number;
  /** Timestamped by the store when omitted. */
  createdAt?: string;
}

export interface UpdateEdgeInput {
  sourceId?: string;
  targetId?: string;
  type?: string;
  props?: Record<string, unknown>;
}

export interface ActivityFilter {
  entityType?: ActivityEntityType;
  entityId?: string;
  limit?: number;
}

/**
 * Storage contract shared by the Postgres (Drizzle/Neon) implementation and
 * the in-memory fallback. All methods return serializable domain objects and
 * append to the activity log as part of each mutation.
 */
export interface GraphStore {
  readonly mode: "memory" | "postgres";

  listUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | null>;

  listNodes(includeDeleted?: boolean): Promise<GraphNode[]>;
  getNode(id: string): Promise<GraphNode | null>;
  createNode(input: CreateNodeInput, actorId: string): Promise<GraphNode>;
  updateNode(id: string, patch: UpdateNodeInput, actorId: string): Promise<GraphNode>;
  softDeleteNode(id: string, actorId: string): Promise<GraphNode>;
  restoreNode(id: string, actorId: string): Promise<GraphNode>;

  listEdges(filter?: { status?: EdgeStatus }): Promise<GraphEdge[]>;
  getEdge(id: string): Promise<GraphEdge | null>;
  createEdge(input: CreateEdgeInput, proposedBy: string): Promise<GraphEdge>;
  updateEdge(id: string, patch: UpdateEdgeInput, actorId: string): Promise<GraphEdge>;
  reviewEdge(id: string, action: "approve" | "reject", decidedBy: string): Promise<GraphEdge>;
  retireEdge(id: string, actorId: string): Promise<GraphEdge>;
  restoreEdge(id: string, actorId: string): Promise<GraphEdge>;

  listActivity(filter?: ActivityFilter): Promise<ActivityEntry[]>;

  /**
   * Bulk-create nodes/edges for an import run: every row is tagged with the
   * run's origin/originRef and logged with the `import` action. Imported
   * edges always enter as `pending` (governance by default). Inputs are
   * expected pre-validated by the caller (unique ids, resolved endpoints).
   */
  importNodes(inputs: ImportNodeInput[], ctx: ImportContext): Promise<GraphNode[]>;
  importEdges(inputs: ImportEdgeInput[], ctx: ImportContext): Promise<GraphEdge[]>;

  /** Idempotency ledger. `insertImport` returns false when importId already exists. */
  insertImport(record: ImportRecord): Promise<boolean>;
  getImport(importId: string): Promise<ImportRecord | null>;
  deleteImport(importId: string): Promise<void>;
}