"use client";

import { useEffect, useState } from "react";
import type { ActivityEntry, ActivityEntityType } from "@/lib/domain/types";
import { describeChange } from "@/lib/domain/activity";
import { api } from "@/lib/client/api";
import { timeAgo, truncate } from "@/lib/client/format";
import { ActionBadge, ActorChip, EntityChip } from "@/components/ui/badges";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

/** Fetches an activity feed for a query; refetches when refreshCount moves. */
export function useActivityFeed(
  query: { entityType?: ActivityEntityType; entityId?: string; limit?: number },
  refreshCount: number,
): { entries: ActivityEntry[]; loading: boolean } {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const key = `${query.entityType ?? ""}:${query.entityId ?? ""}:${query.limit ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    void api.activity(query)
      .then((feed) => {
        if (!cancelled) {
          setEntries(feed);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshCount]);

  return { entries, loading };
}

const MAX_DIFF_CHIPS = 4;

export function ActivityList({ entries, emptyText }: { entries: ActivityEntry[]; emptyText?: string }) {
  const { labelFor, actorInfo } = useWorkspace();

  if (entries.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-slate-400">{emptyText ?? "No activity yet."}</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {entries.map((entry) => {
        const actor = actorInfo(entry.actor);
        const changes =
          entry.before && entry.after
            ? describeChange(entry.before, entry.after)
            : [];
        return (
          <li key={entry.id} className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <ActionBadge action={entry.action} />
              <EntityChip kind={entry.entityType} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700" title={entry.entityId}>
                {labelFor(entry.entityType, entry.entityId)}
              </span>
              <span className="shrink-0 text-[11px] text-slate-400" title={entry.createdAt}>
                {timeAgo(entry.createdAt)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 pl-0.5">
              <ActorChip actor={actor} />
            </div>
            {changes.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {changes.slice(0, MAX_DIFF_CHIPS).map((change) => (
                  <span
                    key={change.field}
                    className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600"
                    title={`${change.field}: ${change.before ?? "∅"} → ${change.after ?? "∅"}`}
                  >
                    <span className="font-medium">{change.field}</span>{" "}
                    {truncate(change.before ?? "∅", 24)} → {truncate(change.after ?? "∅", 24)}
                  </span>
                ))}
                {changes.length > MAX_DIFF_CHIPS && (
                  <span className="text-[11px] text-slate-400">+{changes.length - MAX_DIFF_CHIPS} more</span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}