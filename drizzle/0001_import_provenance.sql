CREATE TYPE "public"."edge_origin" AS ENUM('manual', 'csv', 'graph-json', 'sim-ai');--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'import';--> statement-breakpoint
CREATE TABLE "imports" (
	"import_id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"source" text NOT NULL,
	"filename" text,
	"node_count" integer DEFAULT 0 NOT NULL,
	"edge_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "edges" ADD COLUMN "origin" "edge_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "edges" ADD COLUMN "origin_ref" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "origin" "edge_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "origin_ref" text;--> statement-breakpoint
-- Backfill provenance for pre-existing edges (PR #1 data): rows proposed by
-- the simulated AI are tagged 'sim-ai', everything else 'manual'.
UPDATE "edges" SET "origin" = 'sim-ai' WHERE "proposed_by" = 'sim-ai';--> statement-breakpoint
UPDATE "edges" SET "origin" = 'manual' WHERE "proposed_by" <> 'sim-ai';
