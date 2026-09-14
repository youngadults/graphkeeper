import type { EdgeStatus } from "./types";

/**
 * Review state machine for edges.
 *
 * Lifecycle:
 *   pending  --approve--> approved
 *   pending  --reject-->  rejected
 *   pending  --retire-->  retired        (soft delete)
 *   approved --retire-->  retired        (soft delete)
 *   rejected --restore--> pending       (re-open as a fresh proposal)
 *   retired  --restore--> pending       (re-open as a fresh proposal)
 *
 * Restoring clears the previous decision fields so the edge re-enters the
 * review queue as if newly proposed.
 */

export const EDGE_ACTIONS = ["approve", "reject", "retire", "restore"] as const;
export type EdgeAction = (typeof EDGE_ACTIONS)[number];

export const EDGE_TRANSITIONS: Record<EdgeStatus, readonly EdgeAction[]> = {
  pending: ["approve", "reject", "retire"],
  approved: ["retire"],
  rejected: ["restore"],
  retired: ["restore"],
};

const TARGET_STATUS: Record<EdgeAction, EdgeStatus> = {
  approve: "approved",
  reject: "rejected",
  retire: "retired",
  restore: "pending",
};

export type EdgeTransition =
  | { ok: true; status: EdgeStatus }
  | { ok: false; reason: string };

export function canTransitionEdge(status: EdgeStatus, action: EdgeAction): boolean {
  return EDGE_TRANSITIONS[status].includes(action);
}

export function transitionEdge(status: EdgeStatus, action: EdgeAction): EdgeTransition {
  const allowed = EDGE_TRANSITIONS[status];
  if (!allowed.includes(action)) {
    const hint = allowed.length > 0 ? `Allowed actions: ${allowed.join(", ")}.` : "This edge is in a terminal state.";
    return { ok: false, reason: `Cannot ${action} an edge that is "${status}". ${hint}` };
  }
  return { ok: true, status: TARGET_STATUS[action] };
}