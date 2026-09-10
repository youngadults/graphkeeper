import { pgEnum, pgTable, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Data model contract:
 *  - users: id (uuid pk), name, role enum, color
 *  - nodes: id (uuid pk), label, type, props jsonb, created_by -> users,
 *    created_at, updated_at (+ deleted_at soft-delete flag)
 *  - edges: id (uuid pk), source_id -> nodes, target_id -> nodes, type,
 *    props jsonb, status enum, proposed_by (text: user id or 'sim-ai'),
 *    decided_by -> users nullable, decided_at nullable, created_at, updated_at
 *  - activity_log: id (uuid pk), actor (text), action enum, entity_type enum,
 *    entity_id, before jsonb, after jsonb, created_at
 */

export const userRoleEnum = pgEnum("user_role", ["viewer", "analyst", "admin"]);
export const edgeStatusEnum = pgEnum("edge_status", ["pending", "approved", "rejected", "retired"]);
export const activityActionEnum = pgEnum("activity_action", [
  "create",
  "update",
  "delete",
  "approve",
  "reject",
  "propose",
  "retire",
  "restore",
]);
export const activityEntityTypeEnum = pgEnum("activity_entity_type", ["node", "edge"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("viewer"),
  color: text("color").notNull(),
});

export const nodes = pgTable("nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  type: text("type").notNull(),
  props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const edges = pgTable("edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => nodes.id),
  targetId: uuid("target_id")
    .notNull()
    .references(() => nodes.id),
  type: text("type").notNull(),
  props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  status: edgeStatusEnum("status").notNull().default("pending"),
  /** User id or the 'sim-ai' sentinel — deliberately plain text, no FK. */
  proposedBy: text("proposed_by").notNull(),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  action: activityActionEnum("action").notNull(),
  entityType: activityEntityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NodeRow = typeof nodes.$inferSelect;
export type EdgeRow = typeof edges.$inferSelect;
export type ActivityRow = typeof activityLog.$inferSelect;