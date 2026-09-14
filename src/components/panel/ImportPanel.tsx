"use client";

import { useState, type ChangeEvent } from "react";
import type { ImportCommitResult, ImportPreview } from "@/lib/domain/import-plan";
import type { EdgeFieldMapping, NodeFieldMapping } from "@/lib/domain/import-source";
import { api, type ImportSourceBody } from "@/lib/client/api";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { DoneStep, MappingFields, PreviewStep, SourceStep } from "@/components/panel/import-steps";

/**
 * Import wizard — the free-funnel top: upload/paste a CSV or graph JSON,
 * confirm the field mapping (pre-filled from the server's suggestion),
 * review counts + warnings, then commit. State and handlers live here; the
 * step UIs are in ./import-steps.
 */

type Step = "source" | "mapping" | "preview" | "done";

interface MappingState {
  nodes: { id: string; label: string; type: string };
  edges: { source: string; target: string; type: string };
}

const EMPTY_MAPPING: MappingState = {
  nodes: { id: "", label: "", type: "" },
  edges: { source: "", target: "", type: "" },
};

const NODE_FIELDS = ["id", "label", "type"] as const;
const EDGE_FIELDS = ["source", "target", "type"] as const;

function cleanMapping(map: MappingState["nodes"]): NodeFieldMapping {
  const out: NodeFieldMapping = {};
  for (const field of NODE_FIELDS) {
    if (map[field] !== "") out[field] = map[field];
  }
  return out;
}

function cleanEdgeMapping(map: MappingState["edges"]): EdgeFieldMapping {
  const out: EdgeFieldMapping = {};
  for (const field of EDGE_FIELDS) {
    if (map[field] !== "") out[field] = map[field];
  }
  return out;
}

export default function ImportPanel() {
  const { me, canWrite, notify, setTab } = useWorkspace();
  const [step, setStep] = useState<Step>("source");
  const [sourceKind, setSourceKind] = useState<"csv" | "graph-json">("csv");
  const [nodesCsv, setNodesCsv] = useState<string | null>(null);
  const [edgesCsv, setEdgesCsv] = useState<string | null>(null);
  const [graphJsonText, setGraphJsonText] = useState<string | null>(null);
  const [filenames, setFilenames] = useState<{ nodes?: string; edges?: string; graph?: string }>({});
  const [mapping, setMapping] = useState<MappingState>(EMPTY_MAPPING);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("source");
    setNodesCsv(null);
    setEdgesCsv(null);
    setGraphJsonText(null);
    setFilenames({});
    setMapping(EMPTY_MAPPING);
    setPreview(null);
    setImportId(null);
    setResult(null);
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>, target: "nodes" | "edges" | "graph") => {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      if (target === "graph") {
        setGraphJsonText(text);
        setFilenames((current) => ({ ...current, graph: file.name }));
      } else if (target === "nodes") {
        setNodesCsv(text);
        setFilenames((current) => ({ ...current, nodes: file.name }));
      } else {
        setEdgesCsv(text);
        setFilenames((current) => ({ ...current, edges: file.name }));
      }
    });
  };

  const sourceBody = (): ImportSourceBody => {
    if (sourceKind === "graph-json") {
      return { graphJson: JSON.parse(graphJsonText ?? "{}") as { nodes?: unknown[]; edges?: unknown[] } };
    }
    return {
      ...(nodesCsv !== null ? { nodesCsv } : {}),
      ...(edgesCsv !== null ? { edgesCsv } : {}),
    };
  };

  const confirmedMapping = () =>
    sourceKind === "csv"
      ? { mapping: { nodes: cleanMapping(mapping.nodes), edges: cleanEdgeMapping(mapping.edges) } }
      : {};

  const checkImport = async () => {
    setBusy(true);
    try {
      let parsed: ImportSourceBody;
      try {
        parsed = sourceBody();
      } catch {
        notify("Graph JSON is not valid JSON.", "error");
        return;
      }
      const suggestion = await api.previewImport({ source: parsed });
      setPreview(suggestion);
      if (sourceKind === "graph-json") {
        setImportId(crypto.randomUUID());
        setStep("preview");
      } else {
        setMapping({
          nodes: {
            id: suggestion.mapping.nodes?.id ?? "",
            label: suggestion.mapping.nodes?.label ?? "",
            type: suggestion.mapping.nodes?.type ?? "",
          },
          edges: {
            source: suggestion.mapping.edges?.source ?? "",
            target: suggestion.mapping.edges?.target ?? "",
            type: suggestion.mapping.edges?.type ?? "",
          },
        });
        setStep("mapping");
      }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Preview failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const previewConfirmed = async () => {
    setBusy(true);
    try {
      const confirmed = await api.previewImport({ source: sourceBody(), ...confirmedMapping() });
      setPreview(confirmed);
      // A fresh id per preview run: changing the mapping starts a new import.
      setImportId(crypto.randomUUID());
      setStep("preview");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Preview failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!importId) return;
    const actorId = me?.id;
    if (!actorId) {
      notify("Pick a user in the header first.", "error");
      return;
    }
    setBusy(true);
    try {
      const outcome = await api.commitImport(
        {
          importId,
          source: sourceBody(),
          ...confirmedMapping(),
          filename: filenames.graph ?? filenames.nodes ?? filenames.edges,
        },
        actorId,
      );
      setResult(outcome);
      setStep("done");
      notify(
        `Imported ${outcome.nodesCreated} node(s), ${outcome.edgesCreated} relationship(s) — review queue updated.`,
      );
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Import failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (!canWrite) {
    return (
      <div className="px-4 py-6">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Viewers are read-only — switch to an analyst or admin user to import.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {step === "source" && (
        <SourceStep
          sourceKind={sourceKind}
          onSourceKind={setSourceKind}
          nodesCsv={nodesCsv}
          edgesCsv={edgesCsv}
          graphJsonText={graphJsonText}
          filenames={filenames}
          onFile={onFile}
          onNodesText={(value) => setNodesCsv(value === "" ? null : value)}
          onEdgesText={(value) => setEdgesCsv(value === "" ? null : value)}
          onGraphText={(value) => setGraphJsonText(value === "" ? null : value)}
          busy={busy}
          onCheck={() => void checkImport()}
        />
      )}

      {step === "mapping" && preview && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Confirm field mapping</p>
          {preview.nodes.headers && (
            <MappingFields
              title="Node columns"
              headers={preview.nodes.headers}
              fields={[
                { key: "label", label: "Label (required)" },
                { key: "type", label: "Type" },
                { key: "id", label: "Id (uuid)" },
              ]}
              mapping={mapping.nodes}
              onChange={(field, value) =>
                setMapping((current) => ({ ...current, nodes: { ...current.nodes, [field]: value } }))
              }
            />
          )}
          {preview.edges.headers && (
            <MappingFields
              title="Edge columns"
              headers={preview.edges.headers}
              fields={[
                { key: "source", label: "Source (required)" },
                { key: "target", label: "Target (required)" },
                { key: "type", label: "Relationship type (required)" },
              ]}
              mapping={mapping.edges}
              onChange={(field, value) =>
                setMapping((current) => ({ ...current, edges: { ...current.edges, [field]: value } }))
              }
            />
          )}
          <p className="text-[11px] text-slate-400">
            Unmapped columns become props automatically. Leave &quot;Id&quot; empty to generate fresh uuids.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("source")}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600"
            >
              Back
            </button>
            <button
              type="button"
              disabled={
                busy ||
                (preview.nodes.headers !== null && mapping.nodes.label === "") ||
                (preview.edges.headers !== null &&
                  (mapping.edges.source === "" || mapping.edges.target === "" || mapping.edges.type === ""))
              }
              onClick={() => void previewConfirmed()}
              className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
            >
              {busy ? "Checking…" : "Preview import"}
            </button>
          </div>
        </>
      )}

      {step === "preview" && preview && (
        <PreviewStep
          preview={preview}
          busy={busy}
          onBack={() => setStep(sourceKind === "csv" ? "mapping" : "source")}
          onCommit={() => void commit()}
        />
      )}

      {step === "done" && result && (
        <DoneStep result={result} onReviewQueue={() => setTab("review")} onReset={reset} />
      )}
    </div>
  );
}