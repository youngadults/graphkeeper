"use client";

import { useEffect, useRef, useState } from "react";
import { RoleChip } from "@/components/ui/badges";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

/** No-auth actor picker: the selected user is attributed on every mutation. */
export default function UserPicker() {
  const { users, me, setMe, loading } = useWorkspace();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:border-slate-300"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {me ? (
          <>
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: me.color }} />
            <span className="font-medium">{me.name}</span>
            <RoleChip role={me.role} />
          </>
        ) : loading ? (
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
            Loading…
          </span>
        ) : (
          <span className="text-slate-400">Pick a user…</span>
        )}
        <span className="text-slate-400">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="gk-scroll absolute right-0 z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Act as
          </p>
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              role="option"
              aria-selected={user.id === me?.id}
              onClick={() => {
                setMe(user.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 ${user.id === me?.id ? "bg-slate-50" : ""}`}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: user.color }} />
              <span className="flex-1 truncate font-medium">{user.name}</span>
              <RoleChip role={user.role} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}