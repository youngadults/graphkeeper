import type {
  ActivityEntry,
  ActivityEntityType,
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
  | "unprocessable"
  | "too_large";

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
}