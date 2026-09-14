import { getStore } from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api/http";
import { activityQuerySchema } from "@/lib/domain/validation";

export const dynamic = "force-dynamic";

/** Global or per-entity activity feed, newest first. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filter = activityQuerySchema.parse({
      entityType: url.searchParams.get("entityType") ?? undefined,
      entityId: url.searchParams.get("entityId") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    return ok(await getStore().listActivity(filter));
  } catch (error) {
    return toErrorResponse(error);
  }
}