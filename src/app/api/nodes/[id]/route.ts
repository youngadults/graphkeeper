import { GraphError } from "@/lib/db/store";
import { getStore } from "@/lib/db";
import { ok, parseBody, requireActor, requireWriter, toErrorResponse } from "@/lib/api/http";
import { updateNodeSchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const node = await getStore().getNode(id);
    if (!node) throw new GraphError("not_found", `Node "${id}" was not found.`);
    return ok(node);
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
    const patch = updateNodeSchema.parse(await parseBody(request));
    return ok(await store.updateNode(id, patch, actor.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Soft delete: sets deleted_at on the node; edges keep their history. */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const store = getStore();
    const actor = await requireActor(store, request);
    requireWriter(actor);
    const { id } = await ctx.params;
    return ok(await store.softDeleteNode(id, actor.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}