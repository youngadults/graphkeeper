import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/domain/csv";

describe("parseCsv", () => {
  it("parses headers and rows", () => {
    const table = parseCsv("label,type\nAda,person\nKafka,system");
    expect(table.headers).toEqual(["label", "type"]);
    expect(table.rows).toEqual([
      ["Ada", "person"],
      ["Kafka", "system"],
    ]);
  });

  it("handles quoted fields with commas, escaped quotes, and embedded newlines", () => {
    const table = parseCsv('label,note\n"He said ""hi"", twice","a"\r\n"line\nbreak",b');
    expect(table.rows[0]).toEqual(['He said "hi", twice', "a"]);
    expect(table.rows[1]).toEqual(["line\nbreak", "b"]);
  });

  it("strips a BOM and skips blank lines", () => {
    const table = parseCsv("﻿label,type\n\nAda,person\n\n");
    expect(table.headers).toEqual(["label", "type"]);
    expect(table.rows).toEqual([["Ada", "person"]]);
  });

  it("skips fully empty rows but keeps rows with values", () => {
    const table = parseCsv("label,type\n,,\nAda,person");
    expect(table.rows).toEqual([["Ada", "person"]]);
  });

  it("handles a header-only table and trims header whitespace", () => {
    const table = parseCsv("  label , type \n");
    expect(table.headers).toEqual(["label", "type"]);
    expect(table.rows).toEqual([]);
  });
});