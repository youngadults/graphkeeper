import { createDrizzleStore } from "./drizzle";
import { MemoryStore } from "./memory";
import { buildSeedGraph } from "./seed-data";
import type { GraphStore } from "./store";

/**
 * Store factory. POSTGRES_URL selects the Drizzle + Neon Postgres store;
 * without it the app runs on an in-memory seeded demo graph so the MVP is
 * explorable with zero setup.
 *
 * The instance is cached on globalThis: Next.js bundles each route handler
 * separately, so a module-level variable would give every route its own store
 * (and, in memory mode, its own divergent copy of the graph). globalThis is
 * shared by all routes in the same server process.
 */

const storeHolder = globalThis as unknown as { __graphKeeperStore?: GraphStore };

export function getStore(): GraphStore {
  if (!storeHolder.__graphKeeperStore) {
    const url = process.env.POSTGRES_URL;
    storeHolder.__graphKeeperStore = url ? createDrizzleStore(url) : new MemoryStore(buildSeedGraph());
  }
  return storeHolder.__graphKeeperStore;
}

export function storeMode(): "postgres" | "memory" {
  return process.env.POSTGRES_URL ? "postgres" : "memory";
}