export const dynamic = "force-dynamic";

import { getStore } from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api/http";
import { exportGraphQuerySchema } from "@/lib/domain/validation";
import { MAX_EXPORT_EDGES } from "@/lib/domain/report";
import { GraphError } from "@/lib/db/store";

/**
 * Full graph export — a snapshot for backup, downstream pipelines, or analysis.
 * Read-only: every role (viewer/analyst/admin) may export. Query `?include=activity`
 * embeds the complete activity log.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { include } = exportGraphQuerySchema.parse({
      include: url.searchParams.get("include") ?? undefined,
    });

    const store = getStore();
    const [nodes, edges, activity] = await Promise.all([
      store.listNodes(true),
      store.listEdges(),
      include === "activity" ? store.listActivity({ limit: 10_000 }) : Promise.resolve([]),
    ]);

    if (edges.length > MAX_EXPORT_EDGES) {
      throw new GraphError(
        "too_large",
        `Graph export exceeds the ${MAX_EXPORT_EDGES.toLocaleString()} edge limit (got ${edges.length}). Refusing to serialize.`,
      );
    }

    const payload = include === "activity" ? { nodes, edges, activity } : { nodes, edges };
    return ok(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
