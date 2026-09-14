import { describe, expect, it } from "vitest";
import { describeChange, formatValue, truncateValue } from "@/lib/domain/activity";

describe("describeChange", () => {
  it("reports changed top-level fields", () => {
    const changes = describeChange(
      { label: "Atlas", type: "project", props: {} },
      { label: "Atlas Data Platform", type: "project", props: {} },
    );
    expect(changes).toEqual([
      { field: "label", before: "Atlas", after: "Atlas Data Platform" },
    ]);
  });

  it("reports status transitions", () => {
    const changes = describeChange({ status: "pending" }, { status: "approved" });
    expect(changes).toEqual([{ field: "status", before: "pending", after: "approved" }]);
  });

  it("diffs props per key", () => {
    const changes = describeChange(
      { props: { confidence: 0.5, rationale: "old" } },
      { props: { confidence: 0.9, rationale: "old" } },
    );
    expect(changes).toEqual([{ field: "props.confidence", before: "0.5", after: "0.9" }]);
  });

  it("skips metadata fields", () => {
    const changes = describeChange(
      { id: "a", updatedAt: "t1", decidedBy: "x", status: "pending" },
      { id: "a", updatedAt: "t2", decidedBy: "y", status: "approved" },
    );
    expect(changes).toEqual([{ field: "status", before: "pending", after: "approved" }]);
  });

  it("returns nothing when snapshots match", () => {
    const snapshot = { label: "X", type: "person", props: { a: 1 } };
    expect(describeChange(snapshot, { ...snapshot, props: { ...snapshot.props } })).toEqual([]);
  });

  it("handles create (before null) and delete (after null)", () => {
    const created = describeChange(null, { label: "X" });
    expect(created).toEqual([{ field: "label", before: null, after: "X" }]);
    const deleted = describeChange({ label: "X", status: "approved" }, null);
    expect(deleted.map((c) => c.field)).toEqual(["label", "status"]);
  });
});

describe("formatValue / truncateValue", () => {
  it("formats primitives and serializes objects", () => {
    expect(formatValue("text")).toBe("text");
    expect(formatValue(42)).toBe("42");
    expect(formatValue(true)).toBe("true");
    expect(formatValue(null)).toBe("null");
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it("truncates long values with an ellipsis", () => {
    const long = "x".repeat(100);
    expect(truncateValue(long)).toHaveLength(60);
    expect(truncateValue(long).endsWith("…")).toBe(true);
    expect(truncateValue("short")).toBe("short");
  });
});