import type { UserRole } from "@/lib/domain/types";

/**
 * Static content for the demo seed graph: a fictional company ("Nimbus
 * Analytics") with people, projects, and systems, plus relationship tuples.
 * Referenced by id like "p:3" (person index), "pr:2" (project index),
 * "sy:5" (system index).
 */

export interface SeedPerson {
  name: string;
  title: string;
  role: UserRole;
  color: string;
}

export const SEED_PEOPLE: SeedPerson[] = [
  { name: "Elena Vasquez", title: "CEO", role: "admin", color: "#7c3aed" },
  { name: "Marcus Chen", title: "CTO", role: "analyst", color: "#2563eb" },
  { name: "Priya Sharma", title: "Engineering Manager", role: "analyst", color: "#0891b2" },
  { name: "Diego Ramirez", title: "Senior Data Scientist", role: "analyst", color: "#059669" },
  { name: "Aisha Okafor", title: "Product Manager", role: "analyst", color: "#d97706" },
  { name: "Tom Novak", title: "Platform Engineer", role: "analyst", color: "#dc2626" },
  { name: "Sofia Rossi", title: "Frontend Engineer", role: "analyst", color: "#db2777" },
  { name: "Kenji Tanaka", title: "ML Engineer", role: "analyst", color: "#4f46e5" },
  { name: "Grace Liu", title: "Data Engineer", role: "analyst", color: "#0d9488" },
  { name: "Omar Haddad", title: "QA Engineer", role: "viewer", color: "#65a30d" },
  { name: "Nina Petrova", title: "Product Designer", role: "viewer", color: "#9333ea" },
  { name: "Sam Whitfield", title: "Sales Engineer", role: "viewer", color: "#b45309" },
];

export interface SeedProject {
  name: string;
  phase: string;
  started: string;
}

export const SEED_PROJECTS: SeedProject[] = [
  { name: "Atlas Data Platform", phase: "active", started: "2024-03" },
  { name: "Helios ML Pipeline", phase: "active", started: "2024-09" },
  { name: "Comet Customer Portal", phase: "active", started: "2023-11" },
  { name: "Orion Mobile App", phase: "beta", started: "2025-02" },
  { name: "Vertex Analytics Dashboard", phase: "discovery", started: "2025-06" },
  { name: "Forge Internal Tooling", phase: "active", started: "2023-05" },
  { name: "Pulse Monitoring", phase: "active", started: "2024-06" },
  { name: "Beacon", phase: "live", started: "2022-10" },
];

export interface SeedSystem {
  name: string;
  vendor: string;
  tier: string;
}

export const SEED_SYSTEMS: SeedSystem[] = [
  { name: "PostgreSQL Cluster", vendor: "Self-hosted", tier: "critical" },
  { name: "Kafka Event Bus", vendor: "Apache", tier: "critical" },
  { name: "Snowflake Warehouse", vendor: "Snowflake", tier: "high" },
  { name: "Kubernetes Cluster", vendor: "Self-hosted", tier: "critical" },
  { name: "GitHub Actions", vendor: "GitHub", tier: "medium" },
  { name: "Metabase BI", vendor: "Metabase", tier: "low" },
];

/** [sourceRef, type, targetRef, props?] — approved relationships. */
export type ApprovedEdgeTuple = [string, string, string, Record<string, unknown>?];

export const SEED_APPROVED_EDGES: ApprovedEdgeTuple[] = [
  // reporting lines
  ["p:2", "reports_to", "p:1"],
  ["p:3", "reports_to", "p:2"],
  ["p:4", "reports_to", "p:3"],
  ["p:6", "reports_to", "p:3"],
  ["p:7", "reports_to", "p:3"],
  ["p:8", "reports_to", "p:2"],
  ["p:9", "reports_to", "p:2"],
  ["p:5", "reports_to", "p:1"],
  ["p:10", "reports_to", "p:5"],
  ["p:11", "reports_to", "p:5"],
  // project ownership
  ["p:3", "manages", "pr:1", { since: "2024-04" }],
  ["p:2", "manages", "pr:2", { since: "2024-10" }],
  ["p:5", "manages", "pr:3", { since: "2023-12" }],
  // project staffing
  ["p:4", "works_on", "pr:1", { allocation: "80%" }],
  ["p:6", "works_on", "pr:1", { allocation: "60%" }],
  ["p:7", "works_on", "pr:3"],
  ["p:8", "works_on", "pr:2"],
  ["p:9", "works_on", "pr:2", { allocation: "50%" }],
  ["p:11", "works_on", "pr:8"],
  ["p:12", "works_on", "pr:5"],
  // tooling
  ["p:4", "uses", "sy:3"],
  ["p:9", "uses", "sy:2"],
  ["p:6", "uses", "sy:4"],
  ["p:7", "uses", "sy:5"],
  // technical dependencies
  ["pr:1", "depends_on", "sy:2"],
  ["pr:2", "depends_on", "sy:3"],
  ["pr:3", "depends_on", "sy:4"],
  ["pr:7", "depends_on", "sy:2"],
];

/** [sourceRef, type, targetRef, confidence, rationale] — simulated AI proposals. */
export type PendingEdgeTuple = [string, string, string, number, string];

export const SEED_PENDING_EDGES: PendingEdgeTuple[] = [
  ["p:7", "works_on", "pr:5", 0.88, "Sofia's recent PRs touch Vertex dashboard components."],
  ["p:8", "uses", "sy:4", 0.81, "Kenji deployed Helios models to the shared cluster."],
  ["pr:8", "depends_on", "sy:6", 0.57, "Marketing site embeds Metabase dashboards."],
  ["p:12", "reports_to", "p:5", 0.62, "Sam's OKRs roll up to Aisha's product org."],
  ["p:10", "works_on", "pr:6", 0.66, "Omar filed most Forge test plans this quarter."],
  ["pr:7", "depends_on", "sy:4", 0.74, "Pulse agents run on the shared cluster."],
  ["pr:1", "depends_on", "sy:3", 0.71, "Atlas ETL lands curated tables in Snowflake."],
  ["p:9", "works_on", "pr:1", 0.83, "Grace owns the Atlas ingestion DAGs."],
  ["p:11", "uses", "sy:5", 0.59, "Design-token pipeline runs on GitHub Actions."],
  ["pr:4", "depends_on", "sy:4", 0.69, "Orion backend services deploy via the cluster."],
  ["pr:5", "depends_on", "sy:3", 0.77, "Vertex queries the warehouse directly."],
  ["p:6", "manages", "pr:6", 0.52, "Tom reviews most Forge deployments."],
  ["p:4", "uses", "sy:6", 0.64, "Diego shares experiment reports via Metabase."],
  ["p:8", "works_on", "pr:5", 0.58, "Kenji prototyped the Vertex churn model."],
  ["p:7", "reports_to", "p:5", 0.44, "Low confidence: reporting line inferred from standup notes."],
  ["pr:6", "depends_on", "sy:5", 0.66, "Forge CI pipelines orchestrate releases."],
  ["p:9", "uses", "sy:3", 0.79, "Grace tunes warehouse queries for Helios."],
  ["pr:2", "depends_on", "sy:2", 0.72, "Helios consumes training events from Kafka."],
];