import { getStore } from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api/http";
import { buildGraphReport } from "@/lib/domain/report";

export const dynamic = "force-dynamic";

/**
 * Validation / audit report — the compliance-evidence artifact. Read-only, so
 * every role may request it. Aggregates node/edge counts, status distribution,
 * provenance counts by origin (manual / csv / graph-json / sim-ai), the pending
 * backlog, and
 * the last 30 days of approvals/rejections from the activity log.
 */
export async function GET() {
  try {
    const store = getStore();
    const [nodes, edges, activity] = await Promise.all([
      store.listNodes(true),
      store.listEdges(),
      store.listActivity({ limit: 10_000 }),
    ]);
    return ok(buildGraphReport(nodes, edges, activity));
  } catch (error) {
    return toErrorResponse(error);
  }
}
