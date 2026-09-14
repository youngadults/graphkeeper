/**
 * Minimal RFC 4180-style CSV parser (no external dependency).
 * Handles quoted fields, escaped quotes (""), commas inside quotes, CRLF and
 * LF line endings, and a leading BOM. Blank lines are skipped. The first
 * non-blank record is the header row.
 */

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export function parseCsv(raw: string): CsvTable {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  const endField = (): void => {
    record.push(field);
    field = "";
  };
  const endRecord = (): void => {
    endField();
    if (record.some((cell) => cell.trim() !== "")) records.push(record);
    record = [];
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      endField();
      i += 1;
    } else if (ch === "\n") {
      endRecord();
      i += 1;
    } else if (ch === "\r") {
      // CR ends the record on its own (or pairs with the following LF).
      if (text[i + 1] !== "\n") endRecord();
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (field !== "" || record.length > 0) endRecord();

  const [headers, ...rows] = records;
  return {
    headers: (headers ?? []).map((header) => header.trim()),
    rows,
  };
}