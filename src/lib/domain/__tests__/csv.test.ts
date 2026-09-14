import { describe, expect, it } from "vitest";
import { neutralizeFormulas, parseCsv } from "@/lib/domain/csv";

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

  it("parses a quoted field spanning multiple lines", () => {
    const table = parseCsv('label,description\n"Test","Line1\nLine2"');
    expect(table.headers).toEqual(["label", "description"]);
    expect(table.rows).toEqual([["Test", "Line1\nLine2"]]);
  });
});

describe("neutralizeFormulas", () => {
  it("defangs cells beginning with = + - @", () => {
    const { table, count } = neutralizeFormulas(parseCsv("a,b\n=SUM(A1),+1\n-5,@cmd\n"));
    expect(table.rows).toEqual([["'=SUM(A1)", "'+1"], ["'-5", "'@cmd"]]);
    expect(count).toBe(4);
  });

  it("leaves ordinary values and headers untouched", () => {
    const { table, count } = neutralizeFormulas(parseCsv("note,total\nabc=def,x-y\n"));
    expect(table.headers).toEqual(["note", "total"]);
    expect(table.rows).toEqual([["abc=def", "x-y"]]);
    expect(count).toBe(0);
  });

  it("neutralizes quoted formula cells too", () => {
    const { table, count } = neutralizeFormulas(parseCsv('label\n"=CMD|\'/c calc\'!A1"\n'));
    expect(table.rows).toEqual([["'=CMD|'/c calc'!A1"]]);
    expect(count).toBe(1);
  });

  it("defangs a formula-like header", () => {
    const { table, count } = neutralizeFormulas(parseCsv("=bad,value\nx,1\n"));
    expect(table.headers).toEqual(["'=bad", "value"]);
    expect(count).toBe(1);
  });
});