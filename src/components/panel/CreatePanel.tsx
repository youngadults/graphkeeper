"use client";

import { useState } from "react";
import { PropsField, parsePropsText } from "@/components/panel/PropsField";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

const NODE_TYPE_SUGGESTIONS = ["person", "project", "system"];
const EDGE_TYPE_SUGGESTIONS = ["works_on", "manages", "uses", "reports_to", "depends_on"];

/** Create a node or propose a relationship. New edges start pending. */
export default function CreatePanel() {
  const { createMode, openCreate } = useWorkspace();
  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex gap-1.5">
        <button
          type="button"
          onClick={() => openCreate("node")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            createMode === "node" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Node
        </button>
        <button
          type="button"
          onClick={() => openCreate("edge")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            createMode === "edge" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Relationship
        </button>
      </div>
      {createMode === "node" ? <NodeForm /> : <EdgeForm />}
    </div>
  );
}

function NodeForm() {
  const { createNode, select } = useWorkspace();
  const [label, setLabel] = useState("");
  const [type, setType] = useState("person");
  const [propsText, setPropsText] = useState("");
  const [propsError, setPropsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const props = parsePropsText(propsText);
    if (!props.ok) {
      setPropsError(props.error ?? "Invalid props");
      return;
    }
    setBusy(true);
    try {
      const node = await createNode({ label: label.trim(), type: type.trim(), ...(props.value ? { props: props.value } : {}) });
      select({ kind: "node", id: node.id });
      setLabel("");
      setPropsText("");
    } catch {
      // error toast already shown by the provider
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
      <div>
        <label htmlFor="gk-new-node-label" className="mb-1 block text-xs font-medium text-slate-600">
          Label
        </label>
        <input
          id="gk-new-node-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. Dana Kim"
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        />
      </div>
      <div>
        <label htmlFor="gk-new-node-type" className="mb-1 block text-xs font-medium text-slate-600">
          Type
        </label>
        <input
          id="gk-new-node-type"
          list="gk-node-types"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        />
        <datalist id="gk-node-types">
          {NODE_TYPE_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </div>
      <PropsField text={propsText} onChange={setPropsText} error={propsError} />
      <button
        type="button"
        onClick={submit}
        disabled={busy || label.trim() === "" || type.trim() === ""}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
      >
        {busy ? "Creating…" : "Create node"}
      </button>
    </div>
  );
}

function EdgeForm() {
  const { graph, createEdge, select } = useWorkspace();
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [type, setType] = useState("works_on");
  const [propsText, setPropsText] = useState("");
  const [propsError, setPropsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!graph) return null;
  const nodes = graph.nodes;
  const effectiveSource = sourceId || nodes[0]?.id || "";
  const effectiveTarget = targetId || nodes[1]?.id || nodes[0]?.id || "";

  const submit = async () => {
    const props = parsePropsText(propsText);
    if (!props.ok) {
      setPropsError(props.error ?? "Invalid props");
      return;
    }
    if (effectiveSource === effectiveTarget) {
      setPropsError("Source and target must differ.");
      return;
    }
    setBusy(true);
    try {
      const edge = await createEdge({
        sourceId: effectiveSource,
        targetId: effectiveTarget,
        type: type.trim(),
        ...(props.value ? { props: props.value } : {}),
      });
      select({ kind: "edge", id: edge.id });
      setPropsText("");
    } catch {
      // error toast already shown by the provider
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
      <p className="text-[11px] text-slate-400">
        New relationships start as <span className="font-medium text-amber-700">pending proposals</span> — review them in
        the Review tab.
      </p>
      <div>
        <label htmlFor="gk-new-edge-type" className="mb-1 block text-xs font-medium text-slate-600">
          Relationship type
        </label>
        <input
          id="gk-new-edge-type"
          list="gk-edge-types"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        />
        <datalist id="gk-edge-types">
          {EDGE_TYPE_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="gk-new-edge-source" className="mb-1 block text-xs font-medium text-slate-600">
            Source
          </label>
          <select
            id="gk-new-edge-source"
            value={effectiveSource}
            onChange={(event) => setSourceId(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label} ({node.type})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="gk-new-edge-target" className="mb-1 block text-xs font-medium text-slate-600">
            Target
          </label>
          <select
            id="gk-new-edge-target"
            value={effectiveTarget}
            onChange={(event) => setTargetId(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label} ({node.type})
              </option>
            ))}
          </select>
        </div>
      </div>
      <PropsField text={propsText} onChange={setPropsText} error={propsError} />
      <button
        type="button"
        onClick={submit}
        disabled={busy || effectiveSource === "" || effectiveTarget === "" || type.trim() === ""}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
      >
        {busy ? "Proposing…" : "Propose relationship"}
      </button>
    </div>
  );
}