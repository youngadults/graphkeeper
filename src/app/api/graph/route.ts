import { getStore } from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** Composite snapshot for the canvas: live nodes plus every edge. */
export async function GET() {
  try {
    const store = getStore();
    const [nodes, edges] = await Promise.all([store.listNodes(), store.listEdges()]);
    return ok({ nodes, edges });
  } catch (error) {
    return toErrorResponse(error);
  }
}