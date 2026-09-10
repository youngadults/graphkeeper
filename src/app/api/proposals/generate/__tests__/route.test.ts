import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/proposals/generate/route";
import { getStore } from "@/lib/db";
import { buildSeedGraph } from "@/lib/db/seed-data";
import { SIM_AI } from "@/lib/domain/types";

const seed = buildSeedGraph();
const ADMIN = seed.users[0].id;
const VIEWER = seed.users.find((user) => user.role === "viewer")?.id ?? seed.users[10].id;

function makeRequest(actorId: string, body: unknown): Request {
  return new Request("http://localhost/api/proposals/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gk-actor": actorId,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/proposals/generate", () => {
  it("rejects viewers with 403", async () => {
    const res = await POST(makeRequest(VIEWER, { count: 3 }));
    expect(res.status).toBe(403);
  });

  it("generates proposals for an analyst/admin and returns them", async () => {
    const res = await POST(makeRequest(ADMIN, { count: 3 }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { count: number; proposals: Array<{ status: string; proposedBy: string; props: Record<string, unknown> }> };
    expect(data.count).toBeGreaterThan(0);
    expect(data.count).toBeLessThanOrEqual(3);
    for (const proposal of data.proposals) {
      expect(proposal.status).toBe("pending");
      expect(proposal.proposedBy).toBe(SIM_AI);
      expect(proposal.props.generator).toBe(SIM_AI);
    }
  });

  it("rejects an invalid count with 422", async () => {
    const res = await POST(makeRequest(ADMIN, { count: 0 }));
    expect(res.status).toBe(422);
  });

  it("rejects a count above the cap with 422", async () => {
    const res = await POST(makeRequest(ADMIN, { count: 50 }));
    expect(res.status).toBe(422);
  });

  it("accepts a count at the cap and returns at most 10", async () => {
    const res = await POST(makeRequest(ADMIN, { count: 10 }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { count: number };
    expect(data.count).toBeLessThanOrEqual(10);
  });

  it("rejects an unknown actor with 422", async () => {
    const res = await POST(makeRequest("00000000-0000-4000-8000-000000009999", { count: 3 }));
    expect(res.status).toBe(422);
  });
});
