import { SIM_AI } from "./types";
import type { GraphNode } from "./types";
import type { CreateEdgeInput } from "@/lib/db/store";

/**
 * Simulated proposal generator — the upgrade path from static fake seeds to
 * "AI suggestions". Given the live node set, it synthesizes plausible pending
 * edges using template relationship types, tagged with `generator: 'sim-ai'`.
 *
 * The generated inputs are fed through the exact same `createEdge` + activity
 * path as manual proposals, so they land in the review queue as `propose`
 * entries attributed to the `sim-ai` sentinel.
 */

export const PROPOSAL_TYPES = ["works_on", "manages", "uses", "reports_to", "depends_on"] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const MAX_PROPOSALS_PER_RUN = 10;

/** Relationship type suggested for a (sourceType, targetType) pair. */
const TYPE_FOR_PAIR: Record<string, ProposalType> = {
  "person:project": "works_on",
  "person:person": "reports_to",
  "person:system": "uses",
  "project:system": "depends_on",
  "project:project": "depends_on",
  "system:system": "depends_on",
};

const RATIONALE: Record<ProposalType, string> = {
  works_on: "Recent activity suggests this person contributes to the project.",
  manages: "Ownership signals point to this person leading the project.",
  uses: "Tooling and access patterns indicate this person uses the system.",
  reports_to: "Org-chart signals suggest this reporting line.",
  depends_on: "Dependency analysis suggests this relationship.",
};

export interface ProposalDraft {
  sourceId: string;
  targetId: string;
  type: ProposalType;
  props: Record<string, unknown>;
}

export interface ProposalGeneratorOptions {
  /** Random source for deterministic tests. Defaults to Math.random. */
  random?: () => number;
}

/**
 * Build up to `count` plausible proposal drafts from the given live nodes.
 * Skips pairs that already have an edge (either direction) and self-loops.
 * Returns fewer than `count` when the graph is too small or fully connected.
 */
export function generateProposalDrafts(
  nodes: GraphNode[],
  count: number,
  options: ProposalGeneratorOptions = {},
): ProposalDraft[] {
  const random = options.random ?? Math.random;
  const alive = nodes.filter((node) => !node.deletedAt);
  if (alive.length < 2) return [];

  const existing = new Set<string>();
  // The caller passes edges to avoid duplicates; we track them here too.
  const drafts: ProposalDraft[] = [];
  const attempts = Math.min(count * 20, 500);
  const target = Math.min(count, MAX_PROPOSALS_PER_RUN);

  for (let i = 0; i < attempts && drafts.length < target; i++) {
    const source = alive[Math.floor(random() * alive.length)];
    const targetNode = alive[Math.floor(random() * alive.length)];
    if (source.id === targetNode.id) continue;

    const key = `${source.id}:${targetNode.id}`;
    const reverseKey = `${targetNode.id}:${source.id}`;
    if (existing.has(key) || existing.has(reverseKey)) continue;

    const type = TYPE_FOR_PAIR[`${source.type}:${targetNode.type}`] ?? "depends_on";
    const confidence = round2(0.5 + random() * 0.4);
    drafts.push({
      sourceId: source.id,
      targetId: targetNode.id,
      type,
      props: {
        generator: SIM_AI,
        confidence,
        rationale: RATIONALE[type],
      },
    });
    existing.add(key);
    existing.add(reverseKey);
  }

  return drafts;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Convert a draft into the store's create-edge input. */
export function draftToCreateEdge(draft: ProposalDraft): CreateEdgeInput {
  return {
    sourceId: draft.sourceId,
    targetId: draft.targetId,
    type: draft.type,
    props: draft.props,
  };
}
