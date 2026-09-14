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

/**
 * Formula-injection guard (OWASP "CSV injection"): a cell beginning with
 * `=`, `+`, `-`, or `@` executes as a formula when the value is later exported
 * and opened in a spreadsheet app. Imported cells are neutralized at parse
 * time with a leading apostrophe so the stored value is inert text; quoting
 * a cell does not defang it, so quoted values are neutralized too. Reviewers
 * correct neutralized values in the review queue when they were intentional.
 */
const FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);

export function neutralizeFormulas(table: CsvTable): { table: CsvTable; count: number } {
  let count = 0;
  const neutralize = (value: string): string => {
    if (value.length > 0 && FORMULA_PREFIXES.has(value.charAt(0))) {
      count += 1;
      return `'${value}`;
    }
    return value;
  };
  return {
    table: {
      headers: table.headers.map(neutralize),
      rows: table.rows.map((row) => row.map(neutralize)),
    },
    count,
  };
}