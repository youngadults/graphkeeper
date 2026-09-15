"use client";

import { useEffect, useRef, useState } from "react";
import { WorkspaceProvider, useWorkspace } from "@/components/workspace/WorkspaceProvider";
import Header from "@/components/Header";
import GraphCanvas from "@/components/GraphCanvas";
import SidePanel from "@/components/panel/SidePanel";

function Toast() {
  const { notice } = useWorkspace();
  if (!notice) return null;
  const tone =
    notice.kind === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div className={`gk-toast fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-2.5 text-sm shadow-lg ${tone}`}>
      {notice.text}
    </div>
  );
}

function Shell() {
  const { graph, loading, error, selection, select } = useWorkspace();
  const [panelWidth, setPanelWidth] = useState(400);
  const resizeState = useRef({ isDragging: false, startX: 0, startWidth: 400 });

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!resizeState.current.isDragging) return;

      const dx = event.clientX - resizeState.current.startX;
      const nextWidth = resizeState.current.startWidth - dx;
      setPanelWidth(Math.min(Math.max(nextWidth, 280), 760));
    };

    const stopDragging = () => {
      resizeState.current.isDragging = false;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", stopDragging);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", stopDragging);
    };
  }, []);

  const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.button !== 0) return;

    resizeState.current = {
      isDragging: true,
      startX: event.clientX,
      startWidth: panelWidth,
    };
  };

  return (
    <div className="flex h-screen flex-col">
      <Header />
      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[420px] flex-1">
          <GraphCanvas graph={graph} selectedId={selection?.id ?? null} onSelect={select} />
          {loading && !graph && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80">
              <p className="text-sm text-slate-500">Loading graph…</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0">
          <div
            className="w-2 cursor-col-resize border-l border-slate-200 bg-slate-50 hover:bg-slate-100"
            onMouseDown={startResize}
            title="Drag to resize the side panel"
            aria-label="Resize side panel"
            role="separator"
          />
          <aside
            className="gk-scroll w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white lg:border-l lg:border-t-0"
            style={{ width: `${panelWidth}px` }}
          >
            <SidePanel />
          </aside>
        </div>
      </div>
      <Toast />
    </div>
  );
}

export default function AppShell() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}