import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { GraphEdge, GraphNode } from "@/lib/domain/types";
import type { GraphStore, ImportContext, ImportRecord } from "./store";
import { activityLog, edges, imports, nodes } from "./schema";
import type { ImportRow, UserRow } from "./schema";
import { toEdge, toNode } from "./drizzle-rows";

type Db = ReturnType<typeof drizzle>;

/** Neon-http executes one HTTP round trip per statement — batch in chunks. */
function chunk<T>(items: T[], size = 500): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

function toImportRecord(row: ImportRow): ImportRecord {
  return {
    importId: row.importId,
    actor: row.actor,
    source: row.source === "graph-json" ? "graph-json" : "csv",
    filename: row.filename ?? null,
    nodeCount: row.nodeCount,
    edgeCount: row.edgeCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Import support for the Drizzle store: batch creation of origin-tagged
 * nodes/edges with `import` activity entries, plus the importId ledger.
 * Neon-http costs one request per statement, so everything is batched.
 */
export function createImportMethods(
  db: Db,
  requireUserRow: (actorId: string) => Promise<UserRow>,
): Pick<GraphStore, "importNodes" | "importEdges" | "insertImport" | "getImport" | "deleteImport"> {
  const importNodes = async (
    inputs: import("./store").ImportNodeInput[],
    ctx: ImportContext,
  ): Promise<GraphNode[]> => {
    await requireUserRow(ctx.actorId);
    if (inputs.length === 0) return [];
    const values = inputs.map((input) => ({
      id: input.id,
      label: input.label,
      type: input.type,
      props: input.props ?? {},
      createdBy: ctx.actorId,
      origin: ctx.origin,
      originRef: ctx.originRef,
    }));
    const created: GraphNode[] = [];
    for (const batch of chunk(values)) {
      const rows = await db.insert(nodes).values(batch).returning();
      created.push(...rows.map(toNode));
    }
    const activity = created.map((node) => ({
      actor: ctx.actorId,
      action: "import" as const,
      entityType: "node" as const,
      entityId: node.id,
      before: null,
      after: { ...node },
    }));
    for (const batch of chunk(activity)) await db.insert(activityLog).values(batch);
    return created;
  };

  const importEdges = async (
    inputs: import("./store").ImportEdgeInput[],
    ctx: ImportContext,
  ): Promise<GraphEdge[]> => {
    await requireUserRow(ctx.actorId);
    if (inputs.length === 0) return [];
    const values = inputs.map((input) => ({
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
      props: input.props ?? {},
      status: "pending" as const,
      proposedBy: ctx.actorId,
      origin: ctx.origin,
      originRef: ctx.originRef,
    }));
    const created: GraphEdge[] = [];
    for (const batch of chunk(values)) {
      const rows = await db.insert(edges).values(batch).returning();
      created.push(...rows.map(toEdge));
    }
    const activity = created.map((edge) => ({
      actor: ctx.actorId,
      action: "import" as const,
      entityType: "edge" as const,
      entityId: edge.id,
      before: null,
      after: { ...edge },
    }));
    for (const batch of chunk(activity)) await db.insert(activityLog).values(batch);
    return created;
  };

  return {
    importNodes,
    importEdges,

    async insertImport(record: ImportRecord): Promise<boolean> {
      const [row] = await db
        .insert(imports)
        .values({
          importId: record.importId,
          actor: record.actor,
          source: record.source,
          filename: record.filename,
          nodeCount: record.nodeCount,
          edgeCount: record.edgeCount,
        })
        .onConflictDoNothing({ target: imports.importId })
        .returning();
      return row !== undefined;
    },

    async getImport(importId: string): Promise<ImportRecord | null> {
      const [row] = await db.select().from(imports).where(eq(imports.importId, importId));
      return row ? toImportRecord(row) : null;
    },

    async deleteImport(importId: string): Promise<void> {
      await db.delete(imports).where(eq(imports.importId, importId));
    },
  };
}