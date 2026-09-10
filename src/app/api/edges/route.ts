import { getStore } from "@/lib/db";
import { ok, parseBody, requireActor, requireWriter, toErrorResponse } from "@/lib/api/http";
import { createEdgeSchema, listEdgesQuerySchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filter = listEdgesQuerySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
    });
    return ok(await getStore().listEdges(filter));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** New edges always start as pending proposals by the acting user. */
export async function POST(request: Request) {
  try {
    const store = getStore();
    const actor = await requireActor(store, request);
    requireWriter(actor);
    const input = createEdgeSchema.parse(await parseBody(request));
    const edge = await store.createEdge(input, actor.id);
    return ok(edge, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}