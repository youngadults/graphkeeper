import { getStore } from "@/lib/db";
import { ok, parseBody, requireActor, requireWriter, toErrorResponse } from "@/lib/api/http";
import { generateProposalsSchema } from "@/lib/domain/validation";
import { draftToCreateEdge, generateProposalDrafts } from "@/lib/domain/proposals";
import { SIM_AI } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * Simulated proposal generator. Analyst/admin only (viewers get 403).
 * Generates up to `count` plausible pending edges from existing nodes,
 * attributed to the `sim-ai` sentinel via the standard propose path.
 */
export async function POST(request: Request) {
  try {
    const store = getStore();
    const actor = await requireActor(store, request);
    requireWriter(actor);
    const { count } = generateProposalsSchema.parse(await parseBody(request));

    const nodes = await store.listNodes();
    const edges = await store.listEdges();
    const existingKeys = new Set<string>();
    for (const edge of edges) {
      existingKeys.add(`${edge.sourceId}:${edge.targetId}`);
      existingKeys.add(`${edge.targetId}:${edge.sourceId}`);
    }

    const drafts = generateProposalDrafts(nodes, count).filter(
      (draft) => !existingKeys.has(`${draft.sourceId}:${draft.targetId}`),
    );

    const created = [];
    for (const draft of drafts) {
      const edge = await store.createEdge(draftToCreateEdge(draft), SIM_AI);
      created.push(edge);
    }

    return ok({ count: created.length, proposals: created }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
