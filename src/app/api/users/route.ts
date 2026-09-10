import { getStore } from "@/lib/db";
import { ok, toErrorResponse } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** Seeded users for the no-auth user picker. */
export async function GET() {
  try {
    return ok(await getStore().listUsers());
  } catch (error) {
    return toErrorResponse(error);
  }
}