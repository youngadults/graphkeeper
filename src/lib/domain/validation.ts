import { z } from "zod";
import { EDGE_ORIGINS, EDGE_STATUSES, ENTITY_TYPES } from "./types";
import { MAX_IMPORT_ROWS } from "./import-source";

/**
 * Server-side validation schemas (zod v4). Route handlers parse every body
 * and query string through these before touching a store.
 */

export const propsSchema = z.record(z.string(), z.unknown());

/** Provenance values used for import payloads and filters. */
export const edgeOriginSchema = z.enum(EDGE_ORIGINS);

export const createNodeSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(120),
  type: z.string().trim().min(1, "Type is required").max(60),
  props: propsSchema.optional(),
});

export const updateNodeSchema = z
  .object({
    label: z.string().trim().min(1, "Label cannot be empty").max(120).optional(),
    type: z.string().trim().min(1, "Type cannot be empty").max(60).optional(),
    props: propsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update (label, type, or props).",
  });

export const createEdgeSchema = z
  .object({
    sourceId: z.uuid("sourceId must be a uuid"),
    targetId: z.uuid("targetId must be a uuid"),
    type: z.string().trim().min(1, "Relationship type is required").max(60),
    props: propsSchema.optional(),
  })
  .refine((value) => value.sourceId !== value.targetId, {
    message: "An edge cannot connect a node to itself.",
  });

export const updateEdgeSchema = z
  .object({
    sourceId: z.uuid("sourceId must be a uuid").optional(),
    targetId: z.uuid("targetId must be a uuid").optional(),
    type: z.string().trim().min(1, "Relationship type cannot be empty").max(60).optional(),
    props: propsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  })
  .refine(
    (value) =>
      !(value.sourceId !== undefined && value.targetId !== undefined && value.sourceId === value.targetId),
    { message: "An edge cannot connect a node to itself." },
  );

export const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export const generateProposalsSchema = z.object({
  count: z.coerce.number().int().min(1).max(10).default(5),
});

export const activityQuerySchema = z.object({
  entityType: z.enum(ENTITY_TYPES).optional(),
  entityId: z.uuid("entityId must be a uuid").optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const listEdgesQuerySchema = z.object({
  status: z.enum(EDGE_STATUSES).optional(),
});

// ---- import (provenance-first funnel) -------------------------------------

const columnSchema = z.string().trim().min(1).max(120);

/** Client-supplied idempotency key for one import run. */
export const importIdSchema = z
  .string()
  .trim()
  .min(6, "importId must be at least 6 characters")
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "importId may only contain letters, digits, and . _ : -");

const csvTextSchema = z.string().min(1, "CSV text is empty").max(4_000_000, "CSV text is too large");

export const csvImportSourceSchema = z
  .object({
    nodesCsv: csvTextSchema.optional(),
    edgesCsv: csvTextSchema.optional(),
  })
  .refine((value) => value.nodesCsv !== undefined || value.edgesCsv !== undefined, {
    message: "Provide nodesCsv, edgesCsv, or graphJson.",
  });

const graphJsonNodeSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  label: z.string().trim().min(1, "Node label is required").max(120),
  type: z.string().trim().min(1).max(60).optional(),
  props: propsSchema.optional(),
});

const graphJsonEdgeSchema = z.object({
  source: z.string().trim().min(1).max(120),
  target: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(60),
  props: propsSchema.optional(),
});

export const graphJsonImportSourceSchema = z.object({
  graphJson: z
    .object({
      nodes: z.array(graphJsonNodeSchema).max(MAX_IMPORT_ROWS).optional(),
      edges: z.array(graphJsonEdgeSchema).max(MAX_IMPORT_ROWS).optional(),
    })
    .refine((value) => (value.nodes?.length ?? 0) + (value.edges?.length ?? 0) > 0, {
      message: "graphJson must contain at least one node or edge.",
    }),
});

export const importSourceSchema = z.union([graphJsonImportSourceSchema, csvImportSourceSchema]);

const nodeMappingSchema = z.object({
  id: columnSchema.optional(),
  label: columnSchema.optional(),
  type: columnSchema.optional(),
  props: z.array(columnSchema).max(60).optional(),
});

const edgeMappingSchema = z.object({
  source: columnSchema.optional(),
  target: columnSchema.optional(),
  type: columnSchema.optional(),
  props: z.array(columnSchema).max(60).optional(),
});

export const importMappingSchema = z.object({
  nodes: nodeMappingSchema.optional(),
  edges: edgeMappingSchema.optional(),
});

export const importPreviewSchema = z.object({
  source: importSourceSchema,
  mapping: importMappingSchema.optional(),
});

export const importCommitSchema = z.object({
  importId: importIdSchema,
  source: importSourceSchema,
  mapping: importMappingSchema.optional(),
  filename: z.string().trim().min(1).max(200).optional(),
});

export type ImportSourceInput = z.infer<typeof importSourceSchema>;
export type ImportMappingInput = z.infer<typeof importMappingSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;

export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;
export type CreateEdgeInput = z.infer<typeof createEdgeSchema>;
export type UpdateEdgeInput = z.infer<typeof updateEdgeSchema>;
export type ActivityQueryInput = z.infer<typeof activityQuerySchema>;