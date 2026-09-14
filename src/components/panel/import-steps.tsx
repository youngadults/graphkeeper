"use client";

import type { ChangeEvent } from "react";
import type { ImportCommitResult, ImportPreview } from "@/lib/domain/import-plan";

/**
 * Presentational steps for the import wizard. State and handlers live in
 * ImportPanel; these components render each step's UI.
 */

export interface SourceStepProps {
  sourceKind: "csv" | "graph-json";
  onSourceKind: (kind: "csv" | "graph-json") => void;
  nodesCsv: string | null;
  edgesCsv: string | null;
  graphJsonText: string | null;
  filenames: { nodes?: string; edges?: string; graph?: string };
  onFile: (event: ChangeEvent<HTMLInputElement>, target: "nodes" | "edges" | "graph") => void;
  onNodesText: (value: string) => void;
  onEdgesText: (value: string) => void;
  onGraphText: (value: string) => void;
  busy: boolean;
  onCheck: () => void;
}

export function SourceStep(props: SourceStepProps) {
  const hasSource =
    props.sourceKind === "csv" ? props.nodesCsv !== null || props.edgesCsv !== null : props.graphJsonText !== null;
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Import graph data</p>
      <div className="flex gap-2">
        {(["csv", "graph-json"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => props.onSourceKind(kind)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              props.sourceKind === kind ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"
            }`}
          >
            {kind === "csv" ? "CSV files" : "Graph JSON"}
          </button>
        ))}
      </div>
      {props.sourceKind === "csv" ? (
        <>
          <FileField label="Nodes CSV" filename={props.filenames.nodes} onFile={(event) => props.onFile(event, "nodes")} accept=".csv,text/csv" />
          <textarea
            aria-label="Nodes CSV text"
            value={props.nodesCsv ?? ""}
            onChange={(event) => props.onNodesText(event.target.value)}
            placeholder="…or paste node rows (first row = headers)"
            className="gk-scroll h-24 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
          <FileField label="Edges CSV" filename={props.filenames.edges} onFile={(event) => props.onFile(event, "edges")} accept=".csv,text/csv" />
          <textarea
            aria-label="Edges CSV text"
            value={props.edgesCsv ?? ""}
            onChange={(event) => props.onEdgesText(event.target.value)}
            placeholder="…or paste edge rows (source/target can be ids or labels)"
            className="gk-scroll h-24 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
        </>
      ) : (
        <>
          <FileField label="Graph JSON" filename={props.filenames.graph} onFile={(event) => props.onFile(event, "graph")} accept=".json,application/json" />
          <textarea
            aria-label="Graph JSON text"
            value={props.graphJsonText ?? ""}
            onChange={(event) => props.onGraphText(event.target.value)}
            placeholder='{"nodes":[{"label":"Ada","type":"person"}],"edges":[{"source":"Ada","target":"Kafka","type":"uses"}]}'
            className="gk-scroll h-32 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
        </>
      )}
      <button
        type="button"
        disabled={!hasSource || props.busy}
        onClick={props.onCheck}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
      >
        {props.busy ? "Checking…" : "Check import"}
      </button>
      <p className="text-[11px] text-slate-400">
        Nothing lands silently: nodes are tagged with their origin, and every imported relationship enters the review
        queue as pending. Row cap: 5,000 per file.
      </p>
    </>
  );
}

export interface PreviewStepProps {
  preview: ImportPreview;
  busy: boolean;
  onBack: () => void;
  onCommit: () => void;
}

export function PreviewStep({ preview, busy, onBack, onCommit }: PreviewStepProps) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Review before import</p>
      <div className="flex gap-2">
        <CountCard label="nodes" parsed={preview.nodes.count} creating={preview.nodes.willCreate} />
        <CountCard label="relationships" parsed={preview.edges.count} creating={preview.edges.willCreate} />
      </div>
      {preview.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          {preview.warnings.map((warning, i) => (
            <li key={i} className="text-xs text-amber-800">
              {warning}
            </li>
          ))}
        </ul>
      )}
      {preview.skipped.length > 0 && (
        <p className="text-xs text-slate-500">
          {preview.skipped.length} row(s) will be skipped (dangling references, duplicates, self-loops, or missing
          labels).
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600"
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy || (preview.nodes.willCreate === 0 && preview.edges.willCreate === 0)}
          onClick={onCommit}
          className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {busy ? "Importing…" : `Import ${preview.nodes.willCreate} node(s), ${preview.edges.willCreate} relationship(s)`}
        </button>
      </div>
    </>
  );
}

export interface DoneStepProps {
  result: ImportCommitResult;
  onReviewQueue: () => void;
  onReset: () => void;
}

export function DoneStep({ result, onReviewQueue, onReset }: DoneStepProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-sm font-medium text-emerald-800">
        Imported {result.nodesCreated} node(s) and {result.edgesCreated} relationship(s)
        {result.origin === "csv" ? " from CSV" : " from graph JSON"}.
      </p>
      <p className="text-xs text-emerald-700">
        Nodes are tagged <strong>{result.origin}</strong>
        {result.filename ? ` (${result.filename})` : ""}; relationships are pending review. Retries with the same
        import id are deduplicated.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReviewQueue}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Open review queue
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600"
        >
          Import more
        </button>
      </div>
    </div>
  );
}

export interface MappingFieldSpec {
  key: "id" | "label" | "type" | "source" | "target";
  label: string;
}

export function MappingFields({
  title,
  headers,
  fields,
  mapping,
  onChange,
}: {
  title: string;
  headers: string[];
  fields: MappingFieldSpec[];
  mapping: Record<string, string>;
  onChange: (field: MappingFieldSpec["key"], value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-600">{title}</p>
      {fields.map((field) => (
        <div key={field.key} className="flex items-center gap-2">
          <label htmlFor={`gk-map-${field.key}`} className="w-36 shrink-0 text-xs text-slate-500">
            {field.label}
          </label>
          <select
            id={`gk-map-${field.key}`}
            value={mapping[field.key] ?? ""}
            onChange={(event) => onChange(field.key, event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">— not mapped —</option>
            {headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function FileField({
  label,
  filename,
  onFile,
  accept,
}: {
  label: string;
  filename?: string;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  accept: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-slate-400">
      <span className="text-xs font-medium">{label}</span>
      <span className="truncate text-[11px] text-slate-400">{filename ?? "choose a file…"}</span>
      <input type="file" accept={accept} onChange={onFile} className="hidden" />
    </label>
  );
}

function CountCard({ label, parsed, creating }: { label: string; parsed: number; creating: number }) {
  return (
    <div className="flex-1 rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-lg font-semibold">{creating}</p>
      <p className="text-[11px] text-slate-500">
        {label} to create · {parsed} parsed
      </p>
    </div>
  );
}