# GraphKeeper

**A visual, collaborative governance and review layer over knowledge graphs — "Git for Knowledge Graphs".**

In a knowledge graph, not every relationship should land silently. GraphKeeper treats
graph mutations like pull requests: new relationships (from humans or AI) enter a
**pending** state, reviewers **approve / reject / edit-then-approve** them in a review
queue, soft-deletes are **retirements** that can be restored, and every mutation is
recorded in an append-only **activity log** with full before/after snapshots.

## What it does

- **Graph canvas** — force-directed [Cytoscape.js](https://js.cytoscape.org/) view.
  Nodes colored by type; approved edges render solid, pending proposals dashed and
  dimmed, rejected faint red, retired faint dotted. Click anything to open a details
  side panel.
- **Full CRUD on nodes and edges** — create/edit forms in the side panel. Every
  mutation writes an `activity_log` entry with the full before/after entity snapshot.
  Deleting a node is a soft delete (`deleted_at`); deleting an edge retires it.
- **Review queue** — all pending edges in one list (Sim-AI proposals are badged).
  Approve, reject, or open the edge, edit it, and then approve — the approval carries
  your edits. Approving sets `status='approved'`, `decided_by`, `decided_at`. A
  **Generate proposals** button (analyst/admin only) asks the simulated AI to propose
  new relationships from existing nodes.
- **Provenance-first import** — bulk-load nodes and relationships from CSV files or
  a graph-JSON document. Every row is tagged with its origin (`csv`, `graph-json`,
  `sim-ai`, `manual`), imported relationships land in the review queue as pending,
  and each import run is idempotent per import id (see [Import](#import)).
- **Multiuser without auth** — pick any seeded user in the header; that user is the
  attributed actor on every action (sent via an `x-gk-actor` header, validated
  server-side). Viewers are read-only, enforced by the API.
- **History** — global activity timeline (filter by nodes/edges) plus per-entity
  history in each details panel, with human-readable field diffs.
- **Seeded demo domain** — a fictional company: 12 people, 8 projects, 6 systems,
  ~28 approved relationships, 18 pending simulated-AI proposals (with confidence +
  rationale), one rejected, one retired, and ~85 activity entries.

## Stack

| Layer     | Choice                                                        |
| --------- | ------------------------------------------------------------- |
| Framework | Next.js 15 (App Router) + React 19, TypeScript strict         |
| Styling   | TailwindCSS v4                                                |
| Graph     | Cytoscape.js (built-in `cose` force-directed layout)          |
| Data      | Drizzle ORM + Vercel Postgres via the Neon serverless driver  |
| Validation| zod v4 on every mutating API route                            |
| Tests     | Vitest (domain logic, zod schemas, state machine, store)       |

**Zero-config demo mode:** with no `POSTGRES_URL`, the app runs entirely in-memory on
the seeded demo graph (both stores implement the same `GraphStore` interface — see
`src/lib/db/store.ts`). Set `POSTGRES_URL` and the exact same API/UX runs on Postgres.

## Security / trust model

> ⚠️ **This MVP trusts the client-supplied identity for demo purposes only.**

GraphKeeper has **no real authentication**. The acting user is chosen from a
seeded picker in the header and sent to the API as the `x-gk-actor` header.
The server validates that the actor id exists in the `users` table (an unknown
actor is rejected with `422`) and enforces role-based authorization (viewers
are read-only, `403` on write attempts), but it does **not** verify that the
caller actually is that user.

**Consequences:**

- Any client can impersonate any seeded user by setting `x-gk-actor` to that
  user's id — there is no session, cookie, token, or signature.
- This is a deliberate, documented limitation of the MVP to keep the demo
  zero-config and explorable. It is **not** a production security boundary.

**Before any real deployment**, replace the trust-based actor with a real auth
flow (session cookie / OAuth / signed token) and derive the actor server-side
from the authenticated principal instead of a client header. The rest of the
API (zod validation, role checks, state machine) is designed to layer on top
of that unchanged.

## Run locally

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:3000 — in-memory seeded demo graph
```

In demo mode data resets when the dev server restarts. No env vars, no database.

### With Postgres (Neon)

1. Create a database at [neon.tech](https://neon.tech) and copy the **pooled**
   connection string.
2. `cp .env.example .env.local` and set `POSTGRES_URL`.
3. Run the versioned migrations and load the demo domain:

```bash
npm run db:migrate  # drizzle-kit migrate — applies the SQL migrations in ./drizzle
npm run db:seed     # clears + reseeds the demo graph
npm run dev
```

### Schema migrations

Schema changes are versioned SQL migrations in `drizzle/` (Drizzle Kit), not a
push-to-database workflow:

1. Edit `src/lib/db/schema.ts`.
2. `npm run db:generate` — generates a timestamped SQL migration in `drizzle/`
   (diffed against the previous snapshot in `drizzle/meta/`).
3. Review the generated SQL, commit it with your schema change.
4. `npm run db:migrate` — applies all pending migrations in order, recording
   progress in the `drizzle.__drizzle_migrations` journal table.

All future schema changes go through migrations. Database changes that ship
with backfills (e.g. provenance tags on pre-existing edges) are encoded in the
migration SQL itself, so `db:migrate` is the only step needed.

**Adopting migrations on a database that was previously managed with `db:push`**
requires marking the baseline migration (`0000_baseline_schema.sql`) as applied
so `db:migrate` starts *after* it. Pick exactly one path — **never drop tables
in a database whose data you want to keep**:

- **Dev / demo database (disposable data):** recreate it. Drop the database, or
  just the GraphKeeper tables (`users`, `nodes`, `edges`, `imports`,
  `activity_log`), then `npm run db:migrate && npm run db:seed`. Dropping
  tables destroys everything in them — only acceptable when nothing in the
  database needs to be kept.
- **Production / any database with data to keep (non-destructive):** baseline
  in place, then migrate forward:

  1. Back up the database (`pg_dump`).
  2. Create the journal and mark the baseline as already applied, using the
     baseline entry's `tag` and `when` values from `drizzle/meta/_journal.json`:

     ```sql
     CREATE SCHEMA IF NOT EXISTS drizzle;
     CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at numeric NOT NULL
     );
     INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
     VALUES ('0000_baseline_schema', 1789381025960);
     ```

  3. `npm run db:migrate` — the baseline is skipped; only later migrations run
     (e.g. `0001_import_provenance.sql`, whose backfills are in-place `UPDATE`s
     that tag existing rows without replacing anything).
  4. Verify: row counts and spot checks (e.g. `SELECT origin, count(*) FROM
     edges GROUP BY origin;`) before and after.

  The accidental-replay safety net is that the baseline uses plain `CREATE
  TABLE`, which errors on existing tables instead of overwriting data. If a
  migration step misbehaves, restore the backup and re-run the baselining
  steps.

## Tests

```bash
npm test           # vitest run — schemas, review transitions, activity diffing, store
npm run lint       # eslint (flat config, next/core-web-vitals + next/typescript)
npm run typecheck  # tsc --noEmit (strict)
npm run build      # next build
```

## Environment variables

| Var             | Required | Description                                                              |
| --------------- | -------- | ------------------------------------------------------------------------ |
| `POSTGRES_URL`  | No*      | Neon/Vercel Postgres pooled connection string. Unset → in-memory demo.   |

\* Required on Vercel; optional locally. Never commit real credentials — only
`.env.example` is tracked.

## Data model

Contract tables (Drizzle schema in `src/lib/db/schema.ts`):

- **users** — `id` (uuid pk), `name`, `role` (`viewer|analyst|admin`), `color`
- **nodes** — `id`, `label`, `type`, `props` jsonb, `created_by → users`,
  `created_at`, `updated_at`, plus `deleted_at` (soft-delete flag, additive)
- **edges** — `id`, `source_id → nodes`, `target_id → nodes`, `type`, `props` jsonb,
  `status` (`pending|approved|rejected|retired`), `proposed_by` (user id or
  `sim-ai`), `decided_by → users` nullable, `decided_at` nullable, `created_at`,
  `updated_at`
- **activity_log** — `id`, `actor` (text: user id or `sim-ai`), `action`
  (`create|update|delete|approve|reject|propose|retire|restore`), `entity_type`
  (`node|edge`), `entity_id`, `before` jsonb, `after` jsonb, `created_at`

Edge lifecycle: `pending → approved | rejected` (review), `pending|approved →
retired` (soft delete), `rejected|retired → pending` (restore, decision cleared).
New human-created edges always start `pending` — governance by default.

Provenance columns: `nodes` and `edges` carry `origin` (`edge_origin` enum:
`manual | csv | graph-json | sim-ai`) and `origin_ref` (source file name, null for
manual rows). The **imports** ledger table (`import_id` pk, actor, source,
filename, node/edge counts) powers import idempotency.

## Import

Bulk-load a graph from CSV files or graph JSON — the funnel top. Nothing lands
silently: nodes are created immediately but origin-tagged; every imported
relationship enters the review queue as `pending` with an `import` activity entry
attributed to the importing user.

- **`POST /api/import/preview`** — parses a source without touching the graph.
  Returns parsed counts, the first 20 planned rows, an inferred field-mapping
  suggestion (headers like `label`, `type`, `source`, `target` auto-match,
  including suffixed variants like `node_id` or `employee_name`), and warnings
  (unknown node types, dangling edge references).
- **`POST /api/import/commit`** — creates nodes (`origin`, `origin_ref` = the
  uploaded filename) and edges (`status: pending`, `origin`, `import` activity,
  actor = requesting user). Analyst/admin only (viewers get `403`); an invalid
  mapping returns `422`.
- **Idempotent per `importId`** — a client-supplied id (e.g. a uuid per wizard
  run); retries return the first run's result with `duplicate: true` instead of
  re-importing. Backed by the `imports` ledger, whose `import_id` primary key
  is the database-level guard: concurrent double-submits cannot double-insert.
- **Row cap** — 5,000 rows per file; `422` beyond.
- **Formula-injection guard** — CSV cells beginning with `=`, `+`, `-`, or `@`
  are stored with a leading apostrophe (e.g. `'=SUM(A1)`) so they can never
  execute as spreadsheet formulas in a later export; the preview reports how
  many cells were neutralized and reviewers correct values in the review queue.
- **Duplicate columns rejected** — a CSV whose header row repeats a column
  name is flagged in the preview and rejected with `422` on commit; rename
  columns so each field maps uniquely.
- **UI** — header **⤓ Import** → pick files or paste → confirm the column mapping
  → preview counts + warnings → commit, then jump to the review queue. Edges in
  the details panel and review queue carry an origin badge.

CSV mapping: `label` (+ optional `type`, `id`) for nodes, `source` / `target` /
`type` for edges; unmapped columns become `props`. Edge references resolve against
the import's own nodes first (by uuid or label), then the live graph; unresolvable
rows are skipped with a reason instead of failing the whole import.

## API

All routes are Next.js route handlers under `src/app/api`, validated with zod, and
return JSON. Mutations require the `x-gk-actor: <user-id>` header.

| Method              | Route                        | Purpose                                        |
| ------------------- | ---------------------------- | ---------------------------------------------- |
| GET                 | `/api/graph`                 | Nodes + edges snapshot for the canvas          |
| GET                 | `/api/users`                 | Seeded users (no-auth picker)                  |
| GET / POST          | `/api/nodes`                 | List live nodes / create node                  |
| GET / PATCH / DELETE| `/api/nodes/[id]`            | Read / update / soft-delete                    |
| POST                | `/api/nodes/[id]/restore`    | Undo soft delete                               |
| GET / POST          | `/api/edges`                 | List (`?status=`) / propose (→ pending)        |
| GET / PATCH / DELETE| `/api/edges/[id]`            | Read / update (endpoints only while pending) / retire |
| POST                | `/api/edges/[id]/review`     | `{ "action": "approve" \| "reject" }`          |
| POST                | `/api/edges/[id]/restore`    | Back to pending                                |
| POST                | `/api/proposals/generate`    | `{ "count": n }` — Sim-AI proposes n pending edges (analyst/admin) |
| POST                | `/api/import/preview`        | `{ nodesCsv?, edgesCsv? } or { graphJson }` — parse, map, warn (no writes) |
| POST                | `/api/import/commit`         | `{ importId, source, mapping?, filename? }` — create origin-tagged rows (analyst/admin) |
| GET                 | `/api/activity`              | Feed, newest first (`?entityType=&entityId=&limit=`) |

Errors: `400` validation, `403` viewer write attempt, `404` missing entity,
`409` illegal state transition, `422` zod validation failure (with issue details).

## Deploy to Vercel

1. Push the repo to GitHub (it already is — see the PR) and import it in Vercel.
   `vercel.json` pins the `nextjs` framework preset.
2. Add `POSTGRES_URL` in Project → Settings → Environment Variables (a Neon
   instance via the Vercel Marketplace integration works directly).
3. Run the migrations + seed once against that database
   (`npm run db:migrate && npm run db:seed` locally with the same `POSTGRES_URL`).
4. Deploy. CI (`.github/workflows/ci.yml`) runs lint + typecheck + tests + build on
   every PR, so only green branches merge.

No actual Vercel deployment was attempted from this environment (no credentials).

## Project structure

```
src/
  app/                 # App Router: page shell + /api route handlers
  components/          # canvas, header, side panels (details/review/history/create)
  lib/
    domain/            # types, edge state machine, activity diffing, zod schemas
    db/                # GraphStore contract, Drizzle/Neon + memory stores, seed data
    api/               # HTTP helpers (actor resolution, error mapping)
    client/            # typed fetch wrapper + display helpers
scripts/seed.ts        # loads the demo domain into Postgres
```

## Known gaps (follow-up pass)

- No real auth/SSO — the user picker is trust-based by design for the MVP (see
  [Security / trust model](#security--trust-model)).
- Node restore is API-only (no UI); no bulk review actions; no server-side pagination.
- Collaboration is ~20s polling, not websockets; concurrent edits are last-write-wins.
- Versioned migrations are in place; there is no automated down-migration/rollback path.
- In-memory demo mode resets on restart and is per-server-process (single-node only).
- Only unit/integration tests on domain + store logic; no Playwright E2E yet.

## A note on constrained hosts

Next.js generates route-validator types under `.next/types` that can push
`tsc`/`next build` past the default Node heap on small hosts (this repo was built
and verified on a 3.7GB ARM board). `.next/types` is therefore excluded from
`tsconfig.json` — route handlers are still fully strict-checked as regular
modules. On memory-constrained machines you can additionally run checks with
`NODE_OPTIONS=--max-old-space-size=2600`.
