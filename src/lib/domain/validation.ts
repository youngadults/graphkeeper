import { z } from "zod";
import { EDGE_ORIGINS, EDGE_STATUSES, ENTITY_TYPES } from "./types";

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

export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;
export type CreateEdgeInput = z.infer<typeof createEdgeSchema>;
export type UpdateEdgeInput = z.infer<typeof updateEdgeSchema>;
export type ActivityQueryInput = z.infer<typeof activityQuerySchema>;