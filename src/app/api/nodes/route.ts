import { getStore } from "@/lib/db";
import { ok, parseBody, requireActor, requireWriter, toErrorResponse } from "@/lib/api/http";
import { createNodeSchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getStore().listNodes());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const store = getStore();
    const actor = await requireActor(store, request);
    requireWriter(actor);
    const input = createNodeSchema.parse(await parseBody(request));
    const node = await store.createNode(input, actor.id);
    return ok(node, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}