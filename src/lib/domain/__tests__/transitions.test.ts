import { describe, expect, it } from "vitest";
import { canTransitionEdge, EDGE_TRANSITIONS, transitionEdge } from "@/lib/domain/transitions";

describe("transitionEdge", () => {
  it("approves a pending edge", () => {
    const result = transitionEdge("pending", "approve");
    expect(result).toEqual({ ok: true, status: "approved" });
  });

  it("rejects a pending edge", () => {
    const result = transitionEdge("pending", "reject");
    expect(result).toEqual({ ok: true, status: "rejected" });
  });

  it("retires pending and approved edges (soft delete)", () => {
    expect(transitionEdge("pending", "retire")).toEqual({ ok: true, status: "retired" });
    expect(transitionEdge("approved", "retire")).toEqual({ ok: true, status: "retired" });
  });

  it("restores rejected and retired edges to pending", () => {
    expect(transitionEdge("rejected", "restore")).toEqual({ ok: true, status: "pending" });
    expect(transitionEdge("retired", "restore")).toEqual({ ok: true, status: "pending" });
  });

  it("refuses invalid transitions with a helpful reason", () => {
    const restorePending = transitionEdge("pending", "restore");
    expect(restorePending.ok).toBe(false);
    if (!restorePending.ok) expect(restorePending.reason).toContain("restore");

    const approveApproved = transitionEdge("approved", "approve");
    expect(approveApproved.ok).toBe(false);
    if (!approveApproved.ok) expect(approveApproved.reason).toContain("retire");

    const rejectRejected = transitionEdge("rejected", "reject");
    expect(rejectRejected.ok).toBe(false);

    const retireRetired = transitionEdge("retired", "retire");
    expect(retireRetired.ok).toBe(false);
    if (!retireRetired.ok) expect(retireRetired.reason).toContain("restore");
  });
});

describe("canTransitionEdge", () => {
  it("matches the transition table", () => {
    for (const status of Object.keys(EDGE_TRANSITIONS) as Array<keyof typeof EDGE_TRANSITIONS>) {
      for (const action of ["approve", "reject", "retire", "restore"] as const) {
        expect(canTransitionEdge(status, action)).toBe(EDGE_TRANSITIONS[status].includes(action));
      }
    }
  });
});