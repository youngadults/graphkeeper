import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory";
import { buildSeedGraph } from "@/lib/db/seed-data";
import { SIM_AI } from "@/lib/domain/types";
import {
  draftToCreateEdge,
  generateProposalDrafts,
  MAX_PROPOSALS_PER_RUN,
  PROPOSAL_TYPES,
} from "@/lib/domain/proposals";

const seed = buildSeedGraph();

function store(): MemoryStore {
  return new MemoryStore(buildSeedGraph());
}

/** Deterministic pseudo-random sequence for reproducible tests. */
function seqRandom(seedValue = 42): () => number {
  let state = seedValue;
  return () => {
    // Simple LCG — deterministic, good enough for tests.
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("generateProposalDrafts", () => {
  it("generates up to the requested count of plausible drafts", () => {
    const nodes = seed.nodes;
    const drafts = generateProposalDrafts(nodes, 5, { random: seqRandom() });
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.length).toBeLessThanOrEqual(5);
    for (const draft of drafts) {
      expect(PROPOSAL_TYPES).toContain(draft.type);
      expect(draft.sourceId).not.toBe(draft.targetId);
      expect(draft.props.generator).toBe(SIM_AI);
      expect(typeof draft.props.confidence).toBe("number");
      expect(typeof draft.props.rationale).toBe("string");
    }
  });

  it("caps the count at MAX_PROPOSALS_PER_RUN", () => {
    const nodes = seed.nodes;
    const drafts = generateProposalDrafts(nodes, 100, { random: seqRandom() });
    expect(drafts.length).toBeLessThanOrEqual(MAX_PROPOSALS_PER_RUN);
  });

  it("returns no drafts when there are fewer than two alive nodes", () => {
    const single = [seed.nodes[0]];
    expect(generateProposalDrafts(single, 5)).toEqual([]);
  });

  it("skips self-loops and duplicate pairs", () => {
    // Deterministic random that always picks the same two nodes.
    const nodes = seed.nodes.slice(0, 2);
    const drafts = generateProposalDrafts(nodes, 10, { random: seqRandom() });
    // With only 2 nodes there is exactly one undirected pair.
    expect(drafts.length).toBeLessThanOrEqual(1);
  });

  it("draftToCreateEdge maps a draft to a create-edge input", () => {
    const draft = {
      sourceId: "a",
      targetId: "b",
      type: "works_on" as const,
      props: { generator: SIM_AI, confidence: 0.7 },
    };
    expect(draftToCreateEdge(draft)).toEqual({
      sourceId: "a",
      targetId: "b",
      type: "works_on",
      props: { generator: SIM_AI, confidence: 0.7 },
    });
  });
});

describe("proposal generator through the store", () => {
  it("creates pending edges attributed to sim-ai via the propose path", async () => {
    const s = store();
    const nodes = await s.listNodes();
    const drafts = generateProposalDrafts(nodes, 3, { random: seqRandom() });
    const created = [];
    for (const draft of drafts) {
      created.push(await s.createEdge(draftToCreateEdge(draft), SIM_AI));
    }
    expect(created.length).toBeGreaterThan(0);
    for (const edge of created) {
      expect(edge.status).toBe("pending");
      expect(edge.proposedBy).toBe(SIM_AI);
      expect(edge.props.generator).toBe(SIM_AI);
      const log = await s.listActivity({ entityType: "edge", entityId: edge.id });
      expect(log[0].action).toBe("propose");
      expect(log[0].actor).toBe(SIM_AI);
    }
  });
});
