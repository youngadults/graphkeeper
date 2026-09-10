import { GraphError } from "@/lib/db/store";
import { getStore } from "@/lib/db";
import { ok, parseBody, requireActor, requireWriter, toErrorResponse } from "@/lib/api/http";
import { updateEdgeSchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const edge = await getStore().getEdge(id);
    if (!edge) throw new GraphError("not_found", `Edge "${id}" was not found.`);
    return ok(edge);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const store = getStore();
    const actor = await requireActor(store, request);
    requireWriter(actor);
    const { id } = await ctx.params;
    const patch = updateEdgeSchema.parse(await parseBody(request));
    return ok(await store.updateEdge(id, patch, actor.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Soft delete: pending/approved edges become `retired`. */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const store = getStore();
    const actor = await requireActor(store, request);
    requireWriter(actor);
    const { id } = await ctx.params;
    return ok(await store.retireEdge(id, actor.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}