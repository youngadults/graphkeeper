"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActivityEntry,
  ActivityEntityType,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  User,
} from "@/lib/domain/types";
import { SIM_AI } from "@/lib/domain/types";
import type { CreateEdgeInput, CreateNodeInput, UpdateEdgeInput, UpdateNodeInput } from "@/lib/db/store";
import { api } from "@/lib/client/api";
import { shortId } from "@/lib/client/format";

export type PanelTab = "details" | "review" | "history" | "create" | "health";

export interface Selection {
  kind: "node" | "edge";
  id: string;
}

export interface Notice {
  id: number;
  kind: "ok" | "error";
  text: string;
}

export interface ActorInfo {
  id: string;
  name: string;
  color: string;
  ai: boolean;
}

interface WorkspaceContextValue {
  users: User[];
  me: User | null;
  setMe: (id: string) => void;
  canWrite: boolean;
  graph: GraphSnapshot | null;
  nodeById: (id: string) => GraphNode | undefined;
  pendingCount: number;
  activity: ActivityEntry[];
  refreshCount: number;
  loading: boolean;
  error: string | null;
  notice: Notice | null;
  notify: (text: string, kind?: "ok" | "error") => void;
  selection: Selection | null;
  select: (selection: Selection | null) => void;
  tab: PanelTab;
  setTab: (tab: PanelTab) => void;
  createMode: "node" | "edge";
  openCreate: (mode: "node" | "edge") => void;
  labelFor: (entityType: ActivityEntityType, id: string) => string;
  actorInfo: (id: string | null | undefined) => ActorInfo | null;
  refresh: () => Promise<void>;
  createNode: (input: CreateNodeInput) => Promise<GraphNode>;
  updateNode: (id: string, patch: UpdateNodeInput) => Promise<GraphNode>;
  deleteNode: (id: string) => Promise<GraphNode>;
  restoreNode: (id: string) => Promise<GraphNode>;
  createEdge: (input: CreateEdgeInput) => Promise<GraphEdge>;
  updateEdge: (id: string, patch: UpdateEdgeInput) => Promise<GraphEdge>;
  deleteEdge: (id: string) => Promise<GraphEdge>;
  reviewEdge: (id: string, action: "approve" | "reject") => Promise<GraphEdge>;
  restoreEdge: (id: string) => Promise<GraphEdge>;
  generateProposals: (count: number) => Promise<{ count: number; proposals: GraphEdge[] }>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<PanelTab>("details");
  const [createMode, setCreateMode] = useState<"node" | "edge">("node");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const refreshing = useRef(false);
  const refreshQueued = useRef(false);

  const me = useMemo(() => users.find((user) => user.id === meId) ?? null, [users, meId]);
  const canWrite = me !== null && me.role !== "viewer";

  const notify = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    setNotice({ id: Date.now(), kind, text });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(timer);
  }, [notice]);

  const refresh = useCallback(async () => {
    // Guard against overlapping fetches: if a refresh is already in flight,
    // mark one as pending and re-run after it finishes. This prevents both
    // concurrent fetches racing each other AND a mutation's refresh being
    // silently dropped when a poll is mid-flight (which would leave stale
    // state on screen).
    if (refreshing.current) {
      refreshQueued.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const [snapshot, feed, userList] = await Promise.all([
        api.graph(),
        api.activity({ limit: 60 }),
        api.users(),
      ]);
      // Hide edges that reference nodes the API no longer returns (soft-deleted).
      const alive = new Set(snapshot.nodes.map((node) => node.id));
      setGraph({ nodes: snapshot.nodes, edges: snapshot.edges.filter((edge) => alive.has(edge.sourceId) && alive.has(edge.targetId)) });
      setActivity(feed);
      setUsers(userList);
      setMeId((current) => current ?? userList[0]?.id ?? null);
      setError(null);
      setRefreshCount((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load the graph.");
    } finally {
      refreshing.current = false;
      setLoading(false);
      // If a refresh was requested while this one was in flight, run it now so
      // the newest state is never overwritten by an older response.
      if (refreshQueued.current) {
        refreshQueued.current = false;
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Light polling keeps collaborators roughly in sync (full websockets are a follow-up).
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const guardActor = useCallback((): string => {
    if (!me) {
      notify("Pick a user in the header first.", "error");
      throw new Error("no-actor");
    }
    return me.id;
  }, [me, notify]);

  const run = useCallback(
    async <T,>(action: (actorId: string) => Promise<T>, okMessage?: string): Promise<T> => {
      const actorId = guardActor();
      try {
        const result = await action(actorId);
        await refresh();
        if (okMessage) notify(okMessage);
        return result;
      } catch (cause) {
        if (cause instanceof Error && cause.message === "no-actor") throw cause;
        notify(cause instanceof Error ? cause.message : "Request failed.", "error");
        throw cause;
      }
    },
    [guardActor, notify, refresh],
  );

  const mutate = useMemo(() => {
    return {
      createNode: (input: CreateNodeInput) =>
        run((actorId) => api.createNode(input, actorId), "Node created."),
      updateNode: (id: string, patch: UpdateNodeInput) =>
        run((actorId) => api.updateNode(id, patch, actorId), "Saved."),
      deleteNode: (id: string) => run((actorId) => api.deleteNode(id, actorId), "Node deleted."),
      restoreNode: (id: string) => run((actorId) => api.restoreNode(id, actorId), "Node restored."),
      createEdge: (input: CreateEdgeInput) =>
        run((actorId) => api.createEdge(input, actorId), "Relationship proposed — it is pending review."),
      updateEdge: (id: string, patch: UpdateEdgeInput) =>
        run((actorId) => api.updateEdge(id, patch, actorId), "Saved."),
      deleteEdge: (id: string) => run((actorId) => api.deleteEdge(id, actorId), "Relationship retired."),
      reviewEdge: (id: string, action: "approve" | "reject") =>
        run((actorId) => api.reviewEdge(id, action, actorId), action === "approve" ? "Approved." : "Rejected."),
      restoreEdge: (id: string) => run((actorId) => api.restoreEdge(id, actorId), "Back to pending review."),
      generateProposals: (count: number) =>
        run((actorId) => api.generateProposals(count, actorId), "Sim AI proposals generated."),
    };
  }, [run]);

  const select = useCallback((next: Selection | null) => {
    setSelection(next);
    if (next) setTab("details");
  }, []);

  const openCreate = useCallback((mode: "node" | "edge") => {
    setCreateMode(mode);
    setTab("create");
  }, []);

  const nodeById = useCallback(
    (id: string) => graph?.nodes.find((node) => node.id === id),
    [graph],
  );

  const labelFor = useCallback(
    (entityType: ActivityEntityType, id: string): string => {
      if (!graph) return shortId(id);
      if (entityType === "node") {
        return graph.nodes.find((node) => node.id === id)?.label ?? shortId(id);
      }
      const edge = graph.edges.find((candidate) => candidate.id === id);
      if (!edge) return shortId(id);
      const source = graph.nodes.find((node) => node.id === edge.sourceId)?.label ?? "?";
      const target = graph.nodes.find((node) => node.id === edge.targetId)?.label ?? "?";
      return `${source} →${edge.type}→ ${target}`;
    },
    [graph],
  );

  const actorInfo = useCallback(
    (id: string | null | undefined): ActorInfo | null => {
      if (!id) return null;
      if (id === SIM_AI) return { id, name: "Sim AI", color: "#8b5cf6", ai: true };
      const user = users.find((candidate) => candidate.id === id);
      if (user) return { id: user.id, name: user.name, color: user.color, ai: false };
      return { id, name: shortId(id), color: "#94a3b8", ai: false };
    },
    [users],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      users,
      me,
      setMe: setMeId,
      canWrite,
      graph,
      nodeById,
      pendingCount: graph?.edges.filter((edge) => edge.status === "pending").length ?? 0,
      activity,
      refreshCount,
      loading,
      error,
      notice,
      notify,
      selection,
      select,
      tab,
      setTab,
      createMode,
      openCreate,
      labelFor,
      actorInfo,
      refresh,
      ...mutate,
    }),
    [
      users,
      me,
      canWrite,
      graph,
      nodeById,
      activity,
      refreshCount,
      loading,
      error,
      notice,
      notify,
      selection,
      select,
      tab,
      createMode,
      openCreate,
      labelFor,
      actorInfo,
      refresh,
      mutate,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}