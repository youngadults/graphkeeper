import dotenv from "dotenv";

// Load .env.local first (Next.js convention), then plain .env as fallback.
dotenv.config({ path: ".env.local" });
dotenv.config();

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { buildSeedGraph } from "@/lib/db/seed-data";
import { activityLog, edges, nodes, users } from "@/lib/db/schema";

async function main(): Promise<void> {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error(
      "POSTGRES_URL is required to seed. Copy .env.example to .env.local and set a Neon connection string.",
    );
    process.exit(1);
  }

  const db = drizzle(neon(url));
  const seed = buildSeedGraph();

  console.log("Clearing existing rows…");
  await db.delete(activityLog);
  await db.delete(edges);
  await db.delete(nodes);
  await db.delete(users);

  console.log(
    `Inserting ${seed.users.length} users, ${seed.nodes.length} nodes, ${seed.edges.length} edges, ${seed.activity.length} activity entries…`,
  );

  await db.insert(users).values(
    seed.users.map((user) => ({ id: user.id, name: user.name, role: user.role, color: user.color })),
  );

  await db.insert(nodes).values(
    seed.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      props: node.props,
      createdBy: node.createdBy,
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
      deletedAt: node.deletedAt ? new Date(node.deletedAt) : null,
      origin: node.origin,
      originRef: node.originRef,
    })),
  );

  await db.insert(edges).values(
    seed.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      type: edge.type,
      props: edge.props,
      status: edge.status,
      proposedBy: edge.proposedBy,
      decidedBy: edge.decidedBy,
      decidedAt: edge.decidedAt ? new Date(edge.decidedAt) : null,
      createdAt: new Date(edge.createdAt),
      updatedAt: new Date(edge.updatedAt),
      origin: edge.origin,
      originRef: edge.originRef,
    })),
  );

  await db.insert(activityLog).values(
    seed.activity.map((entry) => ({
      id: entry.id,
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      createdAt: new Date(entry.createdAt),
    })),
  );

  console.log("✓ Seed complete — open the app and pick a user in the header.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });