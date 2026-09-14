import { neutralizeFormulas, parseCsv } from "./csv";
import type { CsvTable } from "./csv";
import type { SkippedRow } from "./import-plan";

/**
 * Import source parsing: turns the raw request source (CSV text or graph
 * JSON) into canonical node/edge rows, applying either the confirmed field
 * mapping or an inferred one. Pure functions — no store or HTTP access.
 */

export const MAX_IMPORT_ROWS = 5000;

/** Canonical column -> header synonyms (normalized: lowercase alphanumeric). */
const NODE_FIELD_SYNONYMS: Record<"id" | "label" | "type", string[]> = {
  id: ["id", "nodeid", "uuid"],
  label: ["label", "name", "title"],
  type: ["type", "nodetype", "kind", "category"],
};

const EDGE_FIELD_SYNONYMS: Record<"source" | "target" | "type", string[]> = {
  source: ["source", "sourceid", "from", "fromid", "fromnode"],
  target: ["target", "targetid", "to", "toid", "tonode"],
  type: ["type", "relationship", "relation", "rel", "edgetype", "edge", "label"],
};

export interface NodeFieldMapping {
  id?: string;
  label?: string;
  type?: string;
  props?: string[];
}

export interface EdgeFieldMapping {
  source?: string;
  target?: string;
  type?: string;
  props?: string[];
}

export interface ImportFieldMapping {
  nodes?: NodeFieldMapping;
  edges?: EdgeFieldMapping;
}

export interface GraphJsonSource {
  nodes?: Array<{ id?: string; label?: string; type?: string; props?: Record<string, unknown> }>;
  edges?: Array<{ source?: string; target?: string; type?: string; props?: Record<string, unknown> }>;
}

/** Canonical row shape after mapping is applied. */
export interface ParsedNodeRow {
  id?: string;
  label: string;
  type: string;
  props: Record<string, unknown>;
}

export interface ParsedEdgeRow {
  source: string;
  target: string;
  type: string;
  props: Record<string, unknown>;
}

export interface SourceData {
  kind: "csv" | "graph-json";
  nodeRows: ParsedNodeRow[];
  edgeRows: ParsedEdgeRow[];
  nodeHeaders: string[] | null;
  edgeHeaders: string[] | null;
  nodeMapping: NodeFieldMapping | null;
  edgeMapping: EdgeFieldMapping | null;
  /** Headers the confirmed mapping expects but could not find (422 on commit). */
  mappingProblems: string[];
  /** Rows dropped at parse time (e.g. missing label). */
  rowProblems: SkippedRow[];
  /** Cells that began with = + - @ and were defanged with a leading apostrophe. */
  neutralizedCells: number;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Auto-match headers to canonical fields: exact normalized matches first,
 * then suffix matches (so "employee_name" matches the "name" synonym and
 * "guid" matches "id"). Each claimed header is consumed so no column maps
 * twice.
 */
function suggestField(
  headers: string[],
  claimed: Set<string>,
  synonyms: string[],
): string | undefined {
  for (const synonym of synonyms) {
    const match = headers.find((header) => normalizeHeader(header) === synonym);
    if (match !== undefined && !claimed.has(match)) {
      claimed.add(match);
      return match;
    }
  }
  for (const synonym of synonyms) {
    const match = headers.find(
      (header) => !claimed.has(header) && normalizeHeader(header).endsWith(synonym),
    );
    if (match !== undefined) {
      claimed.add(match);
      return match;
    }
  }
  return undefined;
}

export function suggestNodeMapping(headers: string[]): NodeFieldMapping {
  const claimed = new Set<string>();
  return {
    id: suggestField(headers, claimed, NODE_FIELD_SYNONYMS.id),
    label: suggestField(headers, claimed, NODE_FIELD_SYNONYMS.label),
    type: suggestField(headers, claimed, NODE_FIELD_SYNONYMS.type),
  };
}

export function suggestEdgeMapping(headers: string[]): EdgeFieldMapping {
  const claimed = new Set<string>();
  return {
    source: suggestField(headers, claimed, EDGE_FIELD_SYNONYMS.source),
    target: suggestField(headers, claimed, EDGE_FIELD_SYNONYMS.target),
    type: suggestField(headers, claimed, EDGE_FIELD_SYNONYMS.type),
  };
}

/** Problems that make a confirmed node mapping invalid (commit -> 422). */
export function validateNodeMapping(table: CsvTable, mapping: NodeFieldMapping): string[] {
  const headerSet = new Set(table.headers);
  const problems: string[] = [];
  if (!mapping.label) {
    problems.push('The "label" field is required for nodes.');
  } else if (!headerSet.has(mapping.label)) {
    problems.push(`Column "${mapping.label}" (mapped to "label") is not in the CSV headers.`);
  }
  for (const field of ["id", "type"] as const) {
    const column = mapping[field];
    if (column !== undefined && !headerSet.has(column)) {
      problems.push(`Column "${column}" (mapped to "${field}") is not in the CSV headers.`);
    }
  }
  for (const column of mapping.props ?? []) {
    if (!headerSet.has(column)) {
      problems.push(`Props column "${column}" is not in the CSV headers.`);
    }
  }
  return problems;
}

/** Problems that make a confirmed edge mapping invalid (commit -> 422). */
export function validateEdgeMapping(table: CsvTable, mapping: EdgeFieldMapping): string[] {
  const headerSet = new Set(table.headers);
  const problems: string[] = [];
  for (const field of ["source", "target", "type"] as const) {
    const column = mapping[field];
    if (!column) {
      problems.push(`The "${field}" field is required for edges.`);
    } else if (!headerSet.has(column)) {
      problems.push(`Column "${column}" (mapped to "${field}") is not in the CSV headers.`);
    }
  }
  for (const column of mapping.props ?? []) {
    if (!headerSet.has(column)) {
      problems.push(`Props column "${column}" is not in the CSV headers.`);
    }
  }
  return problems;
}

const NODE_MAPPED_FIELDS = ["id", "label", "type"] as const;
const EDGE_MAPPED_FIELDS = ["source", "target", "type"] as const;

function headerIndex(table: CsvTable): Map<string, number> {
  return new Map(table.headers.map((header, index) => [header, index]));
}

function cell(row: string[], index: Map<string, number>, column: string | undefined): string | undefined {
  if (column === undefined) return undefined;
  const at = index.get(column);
  if (at === undefined) return undefined;
  const value = row[at]?.trim();
  return value === "" ? undefined : value;
}

function collectProps(row: string[], index: Map<string, number>, propsColumns: string[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const column of propsColumns) {
    const at = index.get(column);
    const value = at === undefined ? undefined : row[at]?.trim();
    if (value !== undefined && value !== "") props[column] = value;
  }
  return props;
}

/** Headers not claimed by a canonical field become props columns by default. */
function defaultPropsColumns(table: CsvTable, claimed: readonly string[]): string[] {
  return table.headers.filter((header) => !claimed.includes(header));
}

export function applyNodeMapping(
  table: CsvTable,
  mapping: NodeFieldMapping,
): { rows: ParsedNodeRow[]; problems: SkippedRow[] } {
  const index = headerIndex(table);
  const claimed = NODE_MAPPED_FIELDS.map((field) => mapping[field]).filter(
    (column): column is string => column !== undefined,
  );
  const propsColumns = mapping.props ?? defaultPropsColumns(table, claimed);
  const rows: ParsedNodeRow[] = [];
  const problems: SkippedRow[] = [];
  table.rows.forEach((row, rowIndex) => {
    const label = cell(row, index, mapping.label);
    if (label === undefined) {
      problems.push({ kind: "node", index: rowIndex, reason: "Row has no label value." });
      return;
    }
    const id = cell(row, index, mapping.id);
    rows.push({
      ...(id !== undefined ? { id } : {}),
      label,
      type: cell(row, index, mapping.type) ?? "unknown",
      props: collectProps(row, index, propsColumns),
    });
  });
  return { rows, problems };
}

export function applyEdgeMapping(
  table: CsvTable,
  mapping: EdgeFieldMapping,
): { rows: ParsedEdgeRow[]; problems: SkippedRow[] } {
  const index = headerIndex(table);
  const claimed = EDGE_MAPPED_FIELDS.map((field) => mapping[field]).filter(
    (column): column is string => column !== undefined,
  );
  const propsColumns = mapping.props ?? defaultPropsColumns(table, claimed);
  const rows: ParsedEdgeRow[] = [];
  const problems: SkippedRow[] = [];
  table.rows.forEach((row, rowIndex) => {
    const source = cell(row, index, mapping.source);
    const target = cell(row, index, mapping.target);
    const type = cell(row, index, mapping.type);
    if (source === undefined || target === undefined || type === undefined) {
      const missing = [
        source === undefined ? "source" : null,
        target === undefined ? "target" : null,
        type === undefined ? "type" : null,
      ]
        .filter((field): field is string => field !== null)
        .join(", ");
      problems.push({ kind: "edge", index: rowIndex, reason: `Row is missing ${missing}.` });
      return;
    }
    rows.push({ source, target, type, props: collectProps(row, index, propsColumns) });
  });
  return { rows, problems };
}

/** Graph JSON needs no mapping: the shape is fixed by the zod schema. */
function parseGraphJsonNodes(source: GraphJsonSource): ParsedNodeRow[] {
  return (source.nodes ?? [])
    .filter((node): node is typeof node & { label: string } => typeof node.label === "string" && node.label.trim() !== "")
    .map((node) => ({
      ...(node.id !== undefined && node.id.trim() !== "" ? { id: node.id.trim() } : {}),
      label: node.label.trim(),
      type: node.type?.trim() || "unknown",
      props: node.props ?? {},
    }));
}

function parseGraphJsonEdges(source: GraphJsonSource): ParsedEdgeRow[] {
  return (source.edges ?? [])
    .filter(
      (edge): edge is typeof edge & { source: string; target: string; type: string } =>
        typeof edge.source === "string" &&
        edge.source.trim() !== "" &&
        typeof edge.target === "string" &&
        edge.target.trim() !== "" &&
        typeof edge.type === "string" &&
        edge.type.trim() !== "",
    )
    .map((edge) => ({
      source: edge.source.trim(),
      target: edge.target.trim(),
      type: edge.type.trim(),
      props: edge.props ?? {},
    }));
}

/**
 * Parse a validated import source into canonical rows. `confirmed` is the
 * client-confirmed mapping for CSV sources; for previews pass undefined to
 * use the inferred mapping. `mappingProblems` is advisory for previews and
 * fatal (422) for commits.
 */
export function parseSourceData(
  kind: "csv" | "graph-json",
  csv: { nodesCsv?: string; edgesCsv?: string },
  graphJson: GraphJsonSource | undefined,
  confirmed: ImportFieldMapping | undefined,
): SourceData {
  const rowProblems: SkippedRow[] = [];
  const issues: string[] = [];
  let neutralizedCells = 0;
  let nodeRows: ParsedNodeRow[] = [];
  let edgeRows: ParsedEdgeRow[] = [];
  let nodeHeaders: string[] | null = null;
  let edgeHeaders: string[] | null = null;
  let nodeMapping: NodeFieldMapping | null = null;
  let edgeMapping: EdgeFieldMapping | null = null;

  if (kind === "graph-json" && graphJson) {
    nodeRows = parseGraphJsonNodes(graphJson);
    edgeRows = parseGraphJsonEdges(graphJson);
  } else {
    if (csv.nodesCsv !== undefined) {
      const neutralized = neutralizeFormulas(parseCsv(csv.nodesCsv));
      const table = neutralized.table;
      neutralizedCells += neutralized.count;
      nodeHeaders = table.headers;
      nodeMapping = confirmed?.nodes ?? suggestNodeMapping(table.headers);
      const problems = validateNodeMapping(table, nodeMapping);
      issues.push(...problems);
      if (problems.length === 0) {
        const applied = applyNodeMapping(table, nodeMapping);
        nodeRows = applied.rows;
        rowProblems.push(...applied.problems);
      }
    }
    if (csv.edgesCsv !== undefined) {
      const neutralized = neutralizeFormulas(parseCsv(csv.edgesCsv));
      const table = neutralized.table;
      neutralizedCells += neutralized.count;
      edgeHeaders = table.headers;
      edgeMapping = confirmed?.edges ?? suggestEdgeMapping(table.headers);
      const problems = validateEdgeMapping(table, edgeMapping);
      issues.push(...problems);
      if (problems.length === 0) {
        const applied = applyEdgeMapping(table, edgeMapping);
        edgeRows = applied.rows;
        rowProblems.push(...applied.problems);
      }
    }
  }

  return {
    kind,
    nodeRows,
    edgeRows,
    nodeHeaders,
    edgeHeaders,
    nodeMapping,
    edgeMapping,
    mappingProblems: issues,
    rowProblems,
    neutralizedCells,
  };
}

/** Human-readable notice about neutralized formula cells (none -> []). */
export function neutralizationWarning(count: number): string[] {
  return count > 0
    ? [
        `${count} cell(s) began with "= + - @" and were stored with a leading apostrophe so they cannot execute as spreadsheet formulas — correct them in the review queue if they were intentional.`,
      ]
    : [];
}