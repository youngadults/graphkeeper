import type { ActivityAction, ActivityEntityType } from "./types";

/**
 * Pure helpers for building and rendering activity log entries.
 *
 * Policy: `before` / `after` are full JSON snapshots of the entity at
 * mutation time. `create` entries carry only `after`, `delete` entries carry
 * only `before`. Metadata fields (ids, timestamps, attribution) are excluded
 * from human-readable diffs.
 */

export interface ActivityDraft {
  actor: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export function activityDraft(
  actor: string,
  action: ActivityAction,
  entityType: ActivityEntityType,
  entityId: string,
  before: Record<string, unknown> | null = null,
  after: Record<string, unknown> | null = null,
): ActivityDraft {
  return { actor, action, entityType, entityId, before, after };
}

const META_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "createdBy",
  "proposedBy",
  "decidedBy",
  "decidedAt",
  "deletedAt",
]);

export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export function formatValue(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

/** Human-facing value cap; renderers may truncate further. */
export const MAX_VALUE_LENGTH = 60;

export function truncateValue(value: string, max = MAX_VALUE_LENGTH): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Diff two entity snapshots into a flat list of changed fields.
 * `props` is diffed per-key (rendered as `props.key`). Metadata fields are
 * skipped. Returns an empty array when the snapshots are equivalent.
 */
export function describeChange(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const key of keys) {
    if (META_FIELDS.has(key)) continue;
    if (key === "props") {
      changes.push(...propsChanges(before?.props, after?.props));
      continue;
    }
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    if (formatValue(b) !== formatValue(a)) {
      changes.push({
        field: key,
        before: b === undefined ? null : truncateValue(formatValue(b)),
        after: a === undefined ? null : truncateValue(formatValue(a)),
      });
    }
  }
  return changes;
}

function propsChanges(
  before: unknown,
  after: unknown,
): FieldChange[] {
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (formatValue(b[key]) !== formatValue(a[key])) {
      changes.push({
        field: `props.${key}`,
        before: key in b ? truncateValue(formatValue(b[key])) : null,
        after: key in a ? truncateValue(formatValue(a[key])) : null,
      });
    }
  }
  return changes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}