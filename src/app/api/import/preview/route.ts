import { getStore } from "@/lib/db";
import { GraphError } from "@/lib/db/store";
import { ok, parseBody, toErrorResponse } from "@/lib/api/http";
import { importPreviewSchema } from "@/lib/domain/validation";
import { MAX_IMPORT_ROWS, parseSourceData } from "@/lib/domain/import-source";
import type { GraphJsonSource } from "@/lib/domain/import-source";
import { buildImportPreview } from "@/lib/domain/import-plan";

export const dynamic = "force-dynamic";

/**
 * Import preview: parses the submitted source (CSV text or graph JSON),
 * infers a field mapping (or applies the client's confirmed one), and
 * returns counts, sample rows, and warnings — without touching the graph.
 * Read-only, so no actor header or role is required.
 */
export async function POST(request: Request) {
  try {
    const body = importPreviewSchema.parse(await parseBody(request));

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

    const sourceData = parseSourceData(kind, csv, graphJson, body.mapping);
    if (sourceData.nodeRows.length > MAX_IMPORT_ROWS || sourceData.edgeRows.length > MAX_IMPORT_ROWS) {
      throw new GraphError(
        "unprocessable",
        `Import exceeds the cap of ${MAX_IMPORT_ROWS} rows per file — split the source into smaller files.`,
      );
    }

    const liveNodes = await getStore().listNodes();
    const liveEdges = await getStore().listEdges();
    return ok(buildImportPreview(sourceData, liveNodes, liveEdges));
  } catch (error) {
    return toErrorResponse(error);
  }
}