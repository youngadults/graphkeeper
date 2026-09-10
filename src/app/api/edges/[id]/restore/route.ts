import { getStore } from "@/lib/db";
import { ok, requireActor, requireWriter, toErrorResponse } from "@/lib/api/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Restore a rejected/retired edge to the pending review queue. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const store = getStore();
    const actor = await requireActor(store, request);
    requireWriter(actor);
    const { id } = await ctx.params;
    return ok(await store.restoreEdge(id, actor.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}