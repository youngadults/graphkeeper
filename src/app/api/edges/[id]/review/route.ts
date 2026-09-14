import { getStore } from "@/lib/db";
import { ok, parseBody, requireActor, requireWriter, toErrorResponse } from "@/lib/api/http";
import { reviewSchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Review action on a pending edge: approve or reject.
 * Sets status, decided_by, decided_at, and logs the decision.
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const store = getStore();
    const actor = await requireActor(store, request);
    requireWriter(actor);
    const { id } = await ctx.params;
    const { action } = reviewSchema.parse(await parseBody(request));
    return ok(await store.reviewEdge(id, action, actor.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}