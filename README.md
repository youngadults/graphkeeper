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
- **Multiuser without auth** — pick any seeded user in the header; that user is the
  attributed actor on every action (sent via an `x-gk-actor` header, validated
  server-side). Viewers are read-only, enforced by the API.
- **History** — global activity timeline (filter by nodes/edges) plus per-entity
  history in each details panel, with human-readable field diffs.
- **Seeded demo domain** — a fictional company: 12 people, 8 projects, 6 systems,
  ~28 approved relationships, 18 pending simulated-AI proposals (with confidence +
  rationale), one rejected, one retired, and ~85 activity entries.

## Features

| Feature             | Free                      | Pro (planned)          |
| ------------------- | ------------------------- | ---------------------- |
| Graph canvas        | ✅                        | ✅                     |
| Manual node/edge CRUD| ✅                       | ✅                     |
| Import              | planned                   | ✅                     |
| Review queue        | ✅                        | ✅                     |
| History / audit log | ✅                        | ✅                     |
| Bulk review         | —                         | ✅                     |
| Exports at scale    | ≤ 50k edges               | Unlimited              |
| Team seats          | single demo user          | Multi-seat roles       |

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
3. Push the schema and load the demo domain:

```bash
npm run db:push    # drizzle-kit push — creates tables/enums
npm run db:seed    # clears + reseeds the demo graph
npm run dev
```

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
| GET                 | `/api/activity`              | Feed, newest first (`?entityType=&entityId=&limit=`) |
| GET                 | `/api/export/graph`          | Full graph export (`?include=activity` embeds the activity log) |
| GET                 | `/api/export/report`         | Validation/audit compliance report |

Errors: `400` validation, `403` viewer write attempt, `404` missing entity,
`409` illegal state transition, `422` zod validation failure (with issue details),
`413` export payload exceeds the edge cap.

### Export API

Both export routes are **read-only** and require no `x-gk-actor` header — every
role (viewer/analyst/admin) may call them.

#### `GET /api/export/graph`

Full graph JSON for backups, downstream pipelines, or analysis.

| Query param | Values                | Effect                                              |
| ----------- | --------------------- | --------------------------------------------------- |
| `include`   | `activity` (optional)  | Embed the complete activity log as an `activity` array |

Response shape:

```jsonc
{
  "nodes": [
    {
      "id": "…", "label": "…", "type": "…",
      "props": {}, "createdBy": "…", "createdAt": "…",
      "updatedAt": "…", "deletedAt": null
    }
  ],
  "edges": [
    {
      "id": "…", "sourceId": "…", "targetId": "…", "type": "…",
      "props": {}, "status": "approved", "proposedBy": "sim-ai",
      "decidedBy": "…", "decidedAt": "…", "createdAt": "…", "updatedAt": "…"
    }
  ],
  "activity": [] // only when ?include=activity
}
```

Nodes include their `created_by`/`created_at`/`updated_at` creation metadata; edges
carry `status`, `proposed_by` (user id or the `sim-ai` sentinel), `decided_by`,
`decided_at`, and both timestamps. **Scale cap:** exports are refused with `413 (Too
Large)` when the edge count exceeds **50,000**. Invalid query params return `422`.

#### `GET /api/export/report`

Validation / audit report — the compliance-evidence artifact. Aggregates the whole
graph into a glanceable summary:

```jsonc
{
  "generatedAt": "2026-03-10T12:00:00.000Z",
  "nodeCount": 26,
  "edgeCount": 50,
  "countsByStatus": { "pending": 20, "approved": 28, "rejected": 1, "retired": 1 },
  "provenance": { "simAi": 48, "human": 2 },
  "pendingBacklog": { "count": 20, "oldestPendingAgeDays": 6, "oldestPendingAt": "…" },
  "timeline": [
    { "date": "2026-02-08", "approvals": 3, "rejections": 0 },
    // … last 30 calendar days, oldest → newest
  ]
}
```

- `countsByStatus` — edges grouped by lifecycle status.
- `provenance` — edge origin split derived from `proposed_by` (`sim-ai` vs human).
- `pendingBacklog` — pending count plus age (in days) of the oldest pending edge.
- `timeline` — approvals and rejections per day over the last 30 calendar days,
  sourced from the activity log (authoritative decision lineage).

### Graph Health panel

The **Health** tab (right side panel) renders `/api/export/report` client-side as a
clean, glanceable dashboard: node/edge scale, per-status relationship counts,
Sim AI vs human provenance split, pending backlog (count + oldest age), and a
7-day review-activity sparkline of approvals/rejections. It refreshes whenever the
workspace reloads and needs no credentials to view.

## Deploy to Vercel

1. Push the repo to GitHub (it already is — see the PR) and import it in Vercel.
   `vercel.json` pins the `nextjs` framework preset.
2. Add `POSTGRES_URL` in Project → Settings → Environment Variables (a Neon
   instance via the Vercel Marketplace integration works directly).
3. Run the schema push + seed once against that database
   (`npm run db:push && npm run db:seed` locally with the same `POSTGRES_URL`).
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
- Schema sync uses `drizzle-kit push`; versioned migrations are the next step.
- In-memory demo mode resets on restart and is per-server-process (single-node only).
- Only unit/integration tests on domain + store logic; no Playwright E2E yet.

## A note on constrained hosts

Next.js generates route-validator types under `.next/types` that can push
`tsc`/`next build` past the default Node heap on small hosts (this repo was built
and verified on a 3.7GB ARM board). `.next/types` is therefore excluded from
`tsconfig.json` — route handlers are still fully strict-checked as regular
modules. On memory-constrained machines you can additionally run checks with
`NODE_OPTIONS=--max-old-space-size=2600`.
