import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { GraphError } from "@/lib/db/store";
import type { User } from "@/lib/domain/types";
import type { GraphStore } from "@/lib/db/store";

const STATUS_BY_CODE: Record<GraphError["code"], number> = {
  validation: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  too_large: 413,
};

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof GraphError) {
    return NextResponse.json({ error: error.message }, { status: STATUS_BY_CODE[error.code] });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }
  console.error("[api] unexpected error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new GraphError("validation", "Request body must be valid JSON.");
  }
}

/** Every mutating request attributes its actor via the x-gk-actor header. */
export async function requireActor(store: GraphStore, request: Request): Promise<User> {
  const actorId = request.headers.get("x-gk-actor");
  if (!actorId) {
    throw new GraphError("validation", "Missing x-gk-actor header — pick a user in the header first.");
  }
  const user = await store.getUser(actorId);
  if (!user) throw new GraphError("unprocessable", `Unknown actor "${actorId}".`);
  return user;
}

/** Viewers are read-only; analysts and admins can mutate the graph. */
export function requireWriter(actor: User): void {
  if (actor.role === "viewer") {
    throw new GraphError("forbidden", `User "${actor.name}" has the viewer role and cannot modify the graph.`);
  }
}