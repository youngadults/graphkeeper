import { describe, expect, it } from "vitest";
import {
  activityQuerySchema,
  createEdgeSchema,
  createNodeSchema,
  listEdgesQuerySchema,
  reviewSchema,
  updateNodeSchema,
} from "@/lib/domain/validation";

const UUID = "00000000-0000-4000-8000-000000000001";

describe("createNodeSchema", () => {
  it("accepts a valid node and applies defaults", () => {
    const result = createNodeSchema.parse({ label: "  Ada  ", type: "person" });
    expect(result).toEqual({ label: "Ada", type: "person" });
  });

  it("accepts free-form props", () => {
    const result = createNodeSchema.parse({ label: "Kafka", type: "system", props: { tier: "critical" } });
    expect(result.props).toEqual({ tier: "critical" });
  });

  it("rejects empty labels, empty types, and non-object props", () => {
    expect(createNodeSchema.safeParse({ label: "  ", type: "person" }).success).toBe(false);
    expect(createNodeSchema.safeParse({ label: "X", type: "" }).success).toBe(false);
    expect(createNodeSchema.safeParse({ label: "X", type: "person", props: "nope" }).success).toBe(false);
  });

  it("strips unknown keys instead of failing", () => {
    const result = createNodeSchema.parse({ label: "X", type: "person", hacker: true });
    expect(result).not.toHaveProperty("hacker");
  });
});

describe("updateNodeSchema", () => {
  it("accepts partial updates", () => {
    expect(updateNodeSchema.parse({ label: "New" })).toEqual({ label: "New" });
  });

  it("refuses an empty patch (all fields optional but at least one required)", () => {
    expect(updateNodeSchema.safeParse({}).success).toBe(false);
    // Unknown keys are stripped, so a patch of only unknown keys is empty.
    expect(updateNodeSchema.safeParse({ status: "approved" }).success).toBe(false);
  });
});

describe("createEdgeSchema", () => {
  const base = { sourceId: UUID, targetId: "00000000-0000-4000-8000-000000000002", type: "works_on" };

  it("accepts a valid edge", () => {
    expect(createEdgeSchema.parse(base).sourceId).toBe(UUID);
  });

  it("rejects self-loops", () => {
    expect(createEdgeSchema.safeParse({ ...base, targetId: UUID }).success).toBe(false);
  });

  it("rejects non-uuid endpoints and missing type", () => {
    expect(createEdgeSchema.safeParse({ ...base, sourceId: "not-a-uuid" }).success).toBe(false);
    expect(createEdgeSchema.safeParse({ sourceId: UUID, targetId: UUID }).success).toBe(false);
  });
});

describe("reviewSchema", () => {
  it("accepts approve and reject only", () => {
    expect(reviewSchema.parse({ action: "approve" })).toEqual({ action: "approve" });
    expect(reviewSchema.parse({ action: "reject" })).toEqual({ action: "reject" });
    expect(reviewSchema.safeParse({ action: "retire" }).success).toBe(false);
    expect(reviewSchema.safeParse({}).success).toBe(false);
  });
});

describe("activityQuerySchema", () => {
  it("coerces and bounds the limit", () => {
    expect(activityQuerySchema.parse({ limit: "25" })).toEqual({ limit: 25 });
    expect(activityQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(activityQuerySchema.safeParse({ limit: "501" }).success).toBe(false);
    expect(activityQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
  });

  it("validates filters", () => {
    expect(activityQuerySchema.parse({ entityType: "edge" })).toEqual({ entityType: "edge" });
    expect(activityQuerySchema.safeParse({ entityType: "graph" }).success).toBe(false);
    expect(activityQuerySchema.safeParse({ entityId: "nope" }).success).toBe(false);
  });
});

describe("listEdgesQuerySchema", () => {
  it("accepts a status filter", () => {
    expect(listEdgesQuerySchema.parse({ status: "pending" })).toEqual({ status: "pending" });
    expect(listEdgesQuerySchema.safeParse({ status: "bogus" }).success).toBe(false);
    expect(listEdgesQuerySchema.parse({})).toEqual({});
  });
});