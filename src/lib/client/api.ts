import type {
  ActivityEntry,
  ActivityEntityType,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  User,
} from "@/lib/domain/types";
import type { CreateEdgeInput, CreateNodeInput, UpdateEdgeInput, UpdateNodeInput } from "@/lib/db/store";

/**
 * Thin typed fetch wrapper for the browser. Mutating calls attach the acting
 * user via the x-gk-actor header (no real auth in the MVP).
 */

interface RequestOptions {
  method?: string;
  body?: unknown;
  actorId?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.actorId) headers["x-gk-actor"] = options.actorId;

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export interface ActivityQuery {
  entityType?: ActivityEntityType;
  entityId?: string;
  limit?: number;
}

function activityPath(query: ActivityQuery): string {
  const params = new URLSearchParams();
  if (query.entityType) params.set("entityType", query.entityType);
  if (query.entityId) params.set("entityId", query.entityId);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const qs = params.toString();
  return `/api/activity${qs ? `?${qs}` : ""}`;
}

export const api = {
  graph: (): Promise<GraphSnapshot> => request<GraphSnapshot>("/api/graph"),

  users: (): Promise<User[]> => request<User[]>("/api/users"),

  activity: (query: ActivityQuery = {}): Promise<ActivityEntry[]> =>
    request<ActivityEntry[]>(activityPath(query)),

  createNode: (input: CreateNodeInput, actorId: string): Promise<GraphNode> =>
    request<GraphNode>("/api/nodes", { method: "POST", body: input, actorId }),

  updateNode: (id: string, patch: UpdateNodeInput, actorId: string): Promise<GraphNode> =>
    request<GraphNode>(`/api/nodes/${id}`, { method: "PATCH", body: patch, actorId }),

  deleteNode: (id: string, actorId: string): Promise<GraphNode> =>
    request<GraphNode>(`/api/nodes/${id}`, { method: "DELETE", actorId }),

  restoreNode: (id: string, actorId: string): Promise<GraphNode> =>
    request<GraphNode>(`/api/nodes/${id}/restore`, { method: "POST", actorId }),

  createEdge: (input: CreateEdgeInput, actorId: string): Promise<GraphEdge> =>
    request<GraphEdge>("/api/edges", { method: "POST", body: input, actorId }),

  updateEdge: (id: string, patch: UpdateEdgeInput, actorId: string): Promise<GraphEdge> =>
    request<GraphEdge>(`/api/edges/${id}`, { method: "PATCH", body: patch, actorId }),

  deleteEdge: (id: string, actorId: string): Promise<GraphEdge> =>
    request<GraphEdge>(`/api/edges/${id}`, { method: "DELETE", actorId }),

  reviewEdge: (id: string, action: "approve" | "reject", actorId: string): Promise<GraphEdge> =>
    request<GraphEdge>(`/api/edges/${id}/review`, { method: "POST", body: { action }, actorId }),

  restoreEdge: (id: string, actorId: string): Promise<GraphEdge> =>
    request<GraphEdge>(`/api/edges/${id}/restore`, { method: "POST", actorId }),
};