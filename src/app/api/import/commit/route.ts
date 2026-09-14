import { getStore } from "@/lib/db";
import { GraphError } from "@/lib/db/store";
import type { ImportContext, ImportRecord } from "@/lib/db/store";
import { ok, parseBody, requireActor, requireWriter, toErrorResponse } from "@/lib/api/http";
import { importCommitSchema } from "@/lib/domain/validation";
import { MAX_IMPORT_ROWS, neutralizationWarning, parseSourceData } from "@/lib/domain/import-source";
import type { GraphJsonSource } from "@/lib/domain/import-source";
import { analyzeImport } from "@/lib/domain/import-plan";
import type { ImportCommitResult } from "@/lib/domain/import-plan";

export const dynamic = "force-dynamic";

/**
 * Import commit: creates nodes (origin-tagged) and pending edges from the
 * confirmed mapping + source data, with `import` activity entries attributed
 * to the acting user. Idempotent per client-supplied importId via the
 * imports ledger — retries return the first run's result. Analyst/admin
 * only (viewers get 403).
 */
export async function POST(request: Request) {
  try {
    const store = getStore();
    const actor = await requireActor(store, request);
    requireWriter(actor);
    const body = importCommitSchema.parse(await parseBody(request));

    let kind: "csv" | "graph-json";
    let csv: { nodesCsv?: string; edgesCsv?: string } = {};
    let graphJson: GraphJsonSource | undefined;
    if ("graphJson" in body.source) {
      kind = "graph-json";
      graphJson = body.source.graphJson;
    } else {
      kind = "csv";
      csv = body.source;
    }

    // CSV commits require an explicitly confirmed mapping for each file sent.
    if (kind === "csv") {
      if (csv.nodesCsv !== undefined && body.mapping?.nodes === undefined) {
        throw new GraphError("unprocessable", "A confirmed nodes mapping is required for CSV imports.");
      }
      if (csv.edgesCsv !== undefined && body.mapping?.edges === undefined) {
        throw new GraphError("unprocessable", "A confirmed edges mapping is required for CSV imports.");
      }
    }

    const sourceData = parseSourceData(kind, csv, graphJson, body.mapping);
    if (sourceData.nodeRows.length > MAX_IMPORT_ROWS || sourceData.edgeRows.length > MAX_IMPORT_ROWS) {
      throw new GraphError(
        "unprocessable",
        `Import exceeds the cap of ${MAX_IMPORT_ROWS} rows per file — split the source into smaller files.`,
      );
    }
    if (sourceData.mappingProblems.length > 0) {
      throw new GraphError("unprocessable", `Invalid import mapping: ${sourceData.mappingProblems[0]}`);
    }

    const plan = analyzeImport(sourceData, await store.listNodes(), await store.listEdges());
    if (plan.nodes.length === 0 && plan.edges.length === 0) {
      throw new GraphError("unprocessable", "Nothing to import — every row was skipped or the source is empty.");
    }

    const record: ImportRecord = {
      importId: body.importId,
      actor: actor.id,
      source: kind,
      filename: body.filename ?? null,
      nodeCount: plan.nodes.length,
      edgeCount: plan.edges.length,
    };
    if (!(await store.insertImport(record))) {
      // Idempotent retry: the importId was already processed.
      const existing = await store.getImport(body.importId);
      const result: ImportCommitResult = {
        importId: body.importId,
        duplicate: true,
        origin: existing?.source === "graph-json" ? "graph-json" : "csv",
        filename: existing?.filename ?? null,
        nodesCreated: existing?.nodeCount ?? 0,
        edgesCreated: existing?.edgeCount ?? 0,
        skipped: [],
        warnings: ["This importId was already processed — nothing was re-imported."],
      };
      return ok(result);
    }

    const ctx: ImportContext = {
      actorId: actor.id,
      origin: kind === "csv" ? "csv" : "graph-json",
      originRef: body.filename ?? null,
    };
    try {
      const nodes = await store.importNodes(plan.nodes, ctx);
      const edges = await store.importEdges(plan.edges, ctx);
      const result: ImportCommitResult = {
        importId: body.importId,
        duplicate: false,
        origin: ctx.origin,
        filename: ctx.originRef,
        nodesCreated: nodes.length,
        edgesCreated: edges.length,
        skipped: plan.skipped,
        warnings: [...neutralizationWarning(sourceData.neutralizedCells), ...plan.warnings],
      };
      return ok(result, 201);
    } catch (error) {
      // Release the ledger slot so a corrected retry can proceed.
      await store.deleteImport(body.importId);
      throw error;
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}